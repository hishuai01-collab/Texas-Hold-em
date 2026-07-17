// 自动化混沌工程 E2E：把手工的 "SIGKILL 崩溃 -> 重启 -> 校验数据一致性" 固化为流水线。
//
// 为什么用 SIGKILL 而不是 SIGTERM：
//   server.ts 的优雅关闭（SIGTERM/SIGINT）会 drain 队列并对每张桌落一次「完整」快照
//   （persistSnapshotNow，即使正卡在手牌中途也会把活状态整份写盘）。那不是崩溃，
//   恢复后自然一致。真正会考验一致性的是「进程被强杀、没有任何机会落盘」——只有 SIGKILL
//   能模拟。此时恢复只能依赖最近一次 SETTLE（HAND_ENDED）时写下的快照。
//
// 崩溃恢复的正确语义（见 EventStore.ts / TableManager.hydrate 注释）：
//   快照只在每手牌结束（HAND_ENDED）时落盘一次，代表一个「筹码守恒、无进行中手牌」的检查点。
//   若崩溃时某手牌已越过上一次 SETTLE 检查点，其私有洗牌熵从未持久化，无法安全续玩；
//   因此重启只回滚到最近一次快照，快照之后的残留事件（trailing events）被「故意丢弃」。
//   => 恢复后的筹码 == 「被打断那手牌开始之前 / 上一次 SETTLE 之后」的一致状态。
//
// 本测试正是断言这一点：第 1 手打完（落基准快照）-> 第 2 手打到一半 -> SIGKILL ->
// 重启 -> 恢复后的每座筹码逐一等于第 1 手结束时的基准，总筹码守恒。

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import { WebSocket } from 'ws';
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL;
// 与 RedisEventStore.integration.test.ts 相同的 skip 约定：未配置 Redis 时优雅跳过。
const skip = !redisUrl ? 'REDIS_URL not configured; skipping chaos E2E' : false;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.resolve(__dirname, '../../src/server.ts');
// 用仓库本地的 tsx 直接跑 TS 源码（与 package.json 的 dev 脚本一致），无需预编译。
const tsxBin = path.resolve(__dirname, '../../node_modules/.bin/tsx');

const START_CHIPS = 1000;

// ---------- 小工具 ----------

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** 等 TCP 端口可连接（服务端就绪信号）。 */
async function waitForPort(port: number, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const ok = await new Promise<boolean>(resolve => {
      const socket = net.connect({ host: '127.0.0.1', port }, () => {
        socket.end();
        resolve(true);
      });
      socket.on('error', () => resolve(false));
      socket.setTimeout(1_000, () => { socket.destroy(); resolve(false); });
    });
    if (ok) return;
    if (Date.now() > deadline) throw new Error(`port ${port} not ready within ${timeoutMs}ms`);
    await delay(150);
  }
}

/** 取一个可用端口，避免与本机其它进程/并行测试抢占。 */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

interface ServerPorts {
  port: number;
  metricsPort: number;
  httpApiPort: number;
}

interface ServerHandle extends ServerPorts {
  child: ChildProcess;
}

async function startServer(ports: ServerPorts): Promise<ServerHandle> {
  const child = spawn(tsxBin, [serverEntry], {
    cwd: path.resolve(__dirname, '../..'),
    env: {
      ...process.env,
      REDIS_URL: redisUrl!,
      PORT: String(ports.port),
      METRICS_PORT: String(ports.metricsPort),
      HTTP_API_PORT: String(ports.httpApiPort), // server.ts 另有一个固定默认 8081 的 HTTP API，需独立指定避免重启/并行冲突
      BOTS: '0',                 // 混沌桌不注入机器人，避免自动行动干扰确定性
      NODE_ENV: 'test',
      // 不设置 ACTION_SIG_HOOK：签名 Hook 关闭，虚拟客户端无需携带 sig（见 ActionRiskControl.ts）
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // 只转发与恢复相关的关键日志到测试输出，便于排查；其余正常日志静默。
  child.stderr?.on('data', d => process.stderr.write(`[server:${ports.port}!] ${d}`));
  child.stdout?.on('data', d => {
    const s = String(d);
    if (/SNAPSHOT_RESTORED|RECOVERY_DISCARDED|SNAPSHOT_CORRUPT/i.test(s)) {
      process.stderr.write(`[server:${ports.port}] ${s}`);
    }
  });
  child.on('error', err => process.stderr.write(`[server:${ports.port}] spawn error: ${err}\n`));

  await waitForPort(ports.port);
  return { child, ...ports };
}

/** 强杀（SIGKILL）并等待进程真正退出——这是本测试的核心：绕过一切优雅落盘。 */
async function killHard(handle: ServerHandle): Promise<void> {
  const child = handle.child;
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGKILL');
    await Promise.race([exited, delay(5_000)]);
  }
  // 释放 stdio 管道，避免子进程句柄让测试进程的事件循环无法退出。
  try { child.stdout?.destroy(); } catch { /* ignore */ }
  try { child.stderr?.destroy(); } catch { /* ignore */ }
  try { child.unref(); } catch { /* ignore */ }
}

// ---------- 虚拟客户端 ----------

interface AnyMsg { type: string; [k: string]: unknown }
type MsgHandler = (m: AnyMsg) => void;

/**
 * 事件驱动的 WS 测试客户端。
 * 关键：所有等待/响应都基于「到达的新消息」触发，绝不轮询缓存重复处理同一条消息——
 * 否则会把同一条 ACTION_REQUIRED 反复回应成千上万次，触发服务端限流拉黑。
 */
class TestClient {
  readonly ws: WebSocket;
  private seq = 0;
  private readonly onceWaiters: { pred: (m: AnyMsg) => boolean; resolve: (m: AnyMsg) => void; timer: NodeJS.Timeout }[] = [];
  private readonly handlers = new Set<MsgHandler>();
  playerId: string | null = null;
  reconnectToken: string | null = null;
  /** 最近一次携带 seats 的事件里的座位快照（chips 的权威来源）。 */
  lastSeats: { id: string; chips: number; seatIndex: number; name: string }[] = [];

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on('message', raw => {
      let msg: AnyMsg;
      try { msg = JSON.parse(String(raw)) as AnyMsg; } catch { return; }
      if (Array.isArray((msg as { seats?: unknown }).seats)) {
        this.lastSeats = (msg as { seats: typeof this.lastSeats }).seats;
      }
      if (msg.type === 'JOINED' || msg.type === 'RECONNECTED') {
        if (typeof msg.you === 'string') this.playerId = msg.you;
        if (typeof msg.reconnectToken === 'string') this.reconnectToken = msg.reconnectToken;
      }
      // 一次性 waiter：命中即摘除。
      for (let i = this.onceWaiters.length - 1; i >= 0; i--) {
        const w = this.onceWaiters[i]!;
        if (w.pred(msg)) {
          clearTimeout(w.timer);
          this.onceWaiters.splice(i, 1);
          w.resolve(msg);
        }
      }
      // 持续 handler：每条新消息触发一次（用于对 ACTION_REQUIRED 反应式行动）。
      for (const h of [...this.handlers]) h(msg);
    });
  }

  async open(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await once(this.ws, 'open');
  }

  send(payload: Record<string, unknown>): void {
    this.ws.send(JSON.stringify({ ...payload, clientSeq: this.seq++ }));
  }

  /** 等待「之后到达」的某条事件（不回看历史，避免重复消费）。 */
  waitFor(pred: (m: AnyMsg) => boolean, timeoutMs = 10_000, label = 'event'): Promise<AnyMsg> {
    return new Promise<AnyMsg>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.onceWaiters.findIndex(w => w.timer === timer);
        if (idx >= 0) this.onceWaiters.splice(idx, 1);
        reject(new Error(`timeout waiting for ${label}`));
      }, timeoutMs);
      timer.unref?.();
      this.onceWaiters.push({ pred, resolve, timer });
    });
  }

  waitForType(type: string, timeoutMs?: number): Promise<AnyMsg> {
    return this.waitFor(m => m.type === type, timeoutMs, type);
  }

  addHandler(h: MsgHandler): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  chipsById(): Map<string, number> {
    return new Map(this.lastSeats.map(s => [s.id, s.chips]));
  }

  close(): void {
    try { this.ws.removeAllListeners(); this.ws.close(); } catch { /* ignore */ }
    try { this.ws.terminate(); } catch { /* ignore */ }
  }
}

// ---------- 手牌驱动 ----------

/**
 * 反应式地把当前手牌推进到 HAND_ENDED：每收到一条「针对我」的 ACTION_REQUIRED 就行动一次，
 * 有欠注则 CALL、否则 CHECK——这是一条永远收敛、不改变谁赢的被动线，用于稳定制造一个
 * 「SETTLE 检查点 / 基准快照」。每条 ACTION_REQUIRED 只会被响应一次（事件驱动，无轮询）。
 */
async function playHandToEnd(clients: TestClient[], timeoutMs = 25_000): Promise<Map<string, number>> {
  const unsubscribers: (() => void)[] = [];
  for (const client of clients) {
    const off = client.addHandler(msg => {
      if (msg.type !== 'ACTION_REQUIRED') return;
      if (msg.playerId !== client.playerId) return; // 只回应轮到自己的那条
      const toCall = Number(msg.toCall ?? 0);
      client.send({ type: 'ACTION', action: toCall > 0 ? 'CALL' : 'CHECK' });
    });
    unsubscribers.push(off);
  }
  try {
    await clients[0]!.waitForType('HAND_ENDED', timeoutMs);
  } finally {
    for (const off of unsubscribers) off();
  }
  // HAND_ENDED 本身不带 seats；SHOWDOWN（先于它发出）带 seats。稍等让广播沉淀。
  await delay(150);
  return clients[0]!.chipsById();
}

// ---------- 测试主体 ----------

const tableId = `chaos-${randomUUID()}`;
let redis: Redis | undefined;
let server: ServerHandle | undefined;

async function cleanupRedis(): Promise<void> {
  if (!redis) return;
  // 只清理本测试 tableId 名下的键，绝不用 `poker:reconnect:*` 通配删除——那会连带清掉
  // 其它牌桌的重连令牌，若 REDIS_URL 指向共享/联调实例将造成误伤。重连令牌本身是随机键、
  // 带 300s TTL，会自动过期，无需在此显式删除。
  await redis.del(`poker:stream:${tableId}`, `poker:snapshot:${tableId}`);
  await redis.srem('poker:tables:active', tableId).catch(() => undefined);
}

before(async () => {
  if (skip) return;
  redis = new Redis(redisUrl!, { lazyConnect: true, maxRetriesPerRequest: 2 });
  await redis.connect();
  await cleanupRedis();
});

after(async () => {
  if (server) await killHard(server).catch(() => undefined);
  if (redis) {
    await cleanupRedis().catch(() => undefined);
    await redis.quit().catch(() => undefined);
  }
});

test('SIGKILL 崩溃后重启：恢复到上一次 SETTLE 快照，筹码与状态一致、总量守恒', { skip }, async () => {
  const port = await freePort();
  const metricsPort = await freePort();
  const httpApiPort = await freePort();
  const ports = { port, metricsPort, httpApiPort };
  const wsUrl = `ws://127.0.0.1:${port}/ws?tableId=${tableId}`;

  // 1) 启动真实服务（连着真实 Redis）。
  server = await startServer(ports);

  // 2) 两个虚拟客户端入桌。
  const a = new TestClient(wsUrl);
  const b = new TestClient(wsUrl);
  await Promise.all([a.open(), b.open()]);
  const joinedAP = a.waitForType('JOINED');
  const joinedBP = b.waitForType('JOINED');
  a.send({ type: 'JOIN', name: 'Alice', clientSeed: 'seed-a' });
  b.send({ type: 'JOIN', name: 'Bob', clientSeed: 'seed-b' });
  const joinedA = await joinedAP;
  await joinedBP;
  assert.ok(a.playerId && b.playerId, '两位玩家都应拿到 playerId');

  // 3) 第 1 手打到结束 -> 触发 HAND_ENDED -> 服务端落基准快照。
  const handStarted1 = a.waitForType('HAND_STARTED');
  a.send({ type: 'START' });
  await handStarted1;
  const baselineChips = await playHandToEnd([a, b]);
  assert.equal(baselineChips.size, 2, '结算后应有两位在座玩家');
  const baselineTotal = [...baselineChips.values()].reduce((t, c) => t + c, 0);
  // 两人各带 1000 入场，总量恒为 2000（无抽水）。
  assert.equal(baselineTotal, START_CHIPS * 2, '第 1 手结束后总筹码应守恒为 2000');
  // 校验基准快照确已写入 Redis（恢复正是从它来）。
  const snapRaw = await redis!.get(`poker:snapshot:${tableId}`);
  assert.ok(snapRaw, '第 1 手结束应写入 SETTLE 快照');

  // 4) 第 2 手打到「一半」：开局并至少完成一个玩家动作，使筹码相对基准发生变化、且手牌进行中。
  const handStarted2 = a.waitForType('HAND_STARTED');
  a.send({ type: 'START' });
  const hand2Started = await handStarted2;
  assert.ok(hand2Started.handId, '第 2 手应有 handId（确认确实开了新的一手）');
  // 等第一条 ACTION_REQUIRED，让被要求的玩家做一个动作（有欠注则 CALL，动到筹码）。
  const firstReq = await a.waitFor(m => m.type === 'ACTION_REQUIRED', 10_000, 'hand2 first ACTION_REQUIRED');
  const firstPid = firstReq.playerId as string;
  const firstToCall = Number(firstReq.toCall ?? 0);
  const firstActor = firstPid === a.playerId ? a : b;
  const appliedP = firstActor.waitFor(
    m => m.type === 'ACTION_APPLIED' && m.playerId === firstPid,
    8_000,
    'hand2 ACTION_APPLIED',
  );
  firstActor.send({ type: 'ACTION', action: firstToCall > 0 ? 'CALL' : 'CHECK' });
  await appliedP;

  // 此刻第 2 手正在进行中且已越过上一次 SETTLE 检查点，但尚未再次结算 ->
  // 其残留事件在崩溃后必须被安全丢弃。给持久化管线一点时间把这批事件 append 进 stream。
  await delay(250);
  const trailing = await redis!.xlen(`poker:stream:${tableId}`);
  assert.ok(trailing > 0, '第 2 手进行中应在 stream 里留下（将被丢弃的）残留事件');

  // 5) 触发崩溃：SIGKILL 强杀，绕过一切优雅落盘。
  await killHard(server);
  a.close();
  b.close();

  // 6) 重启服务（换一组端口，但连同一个 tableId、同一个 Redis）。
  //    数据一致性契约存活在 Redis（快照 + 事件流），与监听端口无关；换端口可彻底规避
  //    SIGKILL 后旧端口短暂 TIME_WAIT 造成的绑定竞态。冷启动会从基准快照重建。
  const restartPorts = { port: await freePort(), metricsPort: await freePort(), httpApiPort: await freePort() };
  server = await startServer(restartPorts);
  const restartWsUrl = `ws://127.0.0.1:${restartPorts.port}/ws?tableId=${tableId}`;

  // 7) 校验恢复：新建连接，用崩溃前签发、仍有效的一次性 reconnectToken 重连，读取恢复后的座位。
  const recovered = new TestClient(restartWsUrl);
  await recovered.open();
  const reconnectedP = recovered.waitForType('RECONNECTED', 12_000);
  // Alice 崩溃前最初拿到的 reconnectToken 在 Redis 里未被消费，重启后依旧有效。
  recovered.send({
    type: 'RECONNECT',
    playerId: joinedA.you as string,
    reconnectToken: joinedA.reconnectToken as string,
    lastSeq: 0,
  });
  const reconnected = await reconnectedP;
  const recoveredSeats = reconnected.seats as { id: string; chips: number }[];
  assert.ok(Array.isArray(recoveredSeats) && recoveredSeats.length === 2, '恢复后应仍是两位在座玩家');

  const recoveredChips = new Map(recoveredSeats.map(s => [s.id, s.chips]));

  // 7a) 总筹码守恒（无凭空增减）。
  const recoveredTotal = [...recoveredChips.values()].reduce((t, c) => t + c, 0);
  assert.equal(recoveredTotal, baselineTotal, '恢复后总筹码必须守恒');

  // 7b) 逐座筹码 == 第 1 手结束时的基准（第 2 手的残留事件被正确丢弃，筹码回到打断前的一致状态）。
  for (const [id, chips] of baselineChips) {
    assert.equal(
      recoveredChips.get(id),
      chips,
      `玩家 ${id} 恢复后的筹码应等于基准快照（被打断的第 2 手不应改变已落盘筹码）`,
    );
  }

  // 7c) 状态快照一致性：Redis 里的 SETTLE 快照仍是「无进行中手牌、筹码守恒」的一致检查点，
  //     且其座位 chips 与恢复后一致。
  const snapAfterRaw = await redis!.get(`poker:snapshot:${tableId}`);
  assert.ok(snapAfterRaw, '恢复所依赖的 SETTLE 快照应仍在 Redis 中');
  const snapAfter = JSON.parse(snapAfterRaw!) as {
    tableId: string;
    engine: { handInProgress: boolean; seats: { id: string; chips: number }[] };
  };
  assert.equal(snapAfter.tableId, tableId);
  assert.equal(snapAfter.engine.handInProgress, false, '基准快照必须处于无进行中手牌的一致检查点');
  const snapTotal = snapAfter.engine.seats.reduce((t, s) => t + s.chips, 0);
  assert.equal(snapTotal, baselineTotal, '快照内筹码总量应守恒');
  for (const s of snapAfter.engine.seats) {
    assert.equal(recoveredChips.get(s.id), s.chips, `快照座位 ${s.id} 的筹码应与恢复后一致`);
  }

  recovered.close();
});
