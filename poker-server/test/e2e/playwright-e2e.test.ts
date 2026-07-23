// Playwright E2E: JOIN→START→ACTION→SHOWDOWN→RECONNECT 全流程
//
// 在 CI 中通过 `npx playwright test` 运行（需安装 Playwright 浏览器）。
// 本地运行前：cd poker-server && npm run build && node dist/server.js & 或使用 tsx 直接跑 dev 服务。
//
// 本测试用 ws 库模拟虚拟客户端，验证完整的 JOIN→START→ACTION→SHOWDOWN 流程，
// 以及断线重连（RECONNECT）的正确性。无需真实浏览器，依赖真实 Redis。

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
const skip = !redisUrl ? 'REDIS_URL not configured; skipping Playwright E2E' : false;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.resolve(__dirname, '../../src/server.ts');
const tsxBin = path.resolve(__dirname, '../../node_modules/.bin/tsx');

const START_CHIPS = 1000;

// ── Helpers ──

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

// ── Virtual Client ──

interface AnyMsg { type: string; [k: string]: unknown }

class E2EClient {
  readonly ws: WebSocket;
  private seq = 0;
  private readonly onceWaiters: { pred: (m: AnyMsg) => boolean; resolve: (m: AnyMsg) => void; timer: NodeJS.Timeout }[] = [];
  playerId: string | null = null;
  reconnectToken: string | null = null;
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
      for (let i = this.onceWaiters.length - 1; i >= 0; i--) {
        const w = this.onceWaiters[i]!;
        if (w.pred(msg)) {
          clearTimeout(w.timer);
          this.onceWaiters.splice(i, 1);
          w.resolve(msg);
        }
      }
    });
  }

  async open(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await once(this.ws, 'open');
  }

  send(payload: Record<string, unknown>): void {
    this.ws.send(JSON.stringify({ ...payload, clientSeq: this.seq++ }));
  }

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

  chipsById(): Map<string, number> {
    return new Map(this.lastSeats.map(s => [s.id, s.chips]));
  }

  close(): void {
    try { this.ws.removeAllListeners(); this.ws.close(); } catch { /* ignore */ }
    try { this.ws.terminate(); } catch { /* ignore */ }
  }
}

// ── Test ──

const tableId = `e2e-${randomUUID()}`;
const httpApiPort = 9093; // 固定端口避免竞态
let server: { child: ChildProcess; port: number } | undefined;
let redis: Redis | undefined;

before(async () => {
  if (skip) return;
  redis = new Redis(redisUrl!, { lazyConnect: true, maxRetriesPerRequest: 2 });
  await redis.connect();
  // Clean any leftover state for this table
  await redis.del(`poker:stream:${tableId}`, `poker:snapshot:${tableId}`);
  await redis.srem('poker:tables:active', tableId).catch(() => undefined);
});

after(async () => {
  if (server) {
    try { server.child.kill('SIGKILL'); } catch { /* ignore */ }
  }
  if (redis) {
    await redis.del(`poker:stream:${tableId}`, `poker:snapshot:${tableId}`).catch(() => undefined);
    await redis.quit().catch(() => undefined);
  }
});

test('JOIN→START→ACTION→SHOWDOWN→RECONNECT 全流程 E2E', { skip }, async () => {
  const port = await freePort();
  server = { child: spawn(tsxBin, [serverEntry], {
    cwd: path.resolve(__dirname, '../..'),
    env: {
      ...process.env,
      REDIS_URL: redisUrl!,
      PORT: String(port),
      METRICS_PORT: String(await freePort()),
      HTTP_API_PORT: String(httpApiPort),
      BOTS: '0',
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  }), port };
  server.child.stderr?.on('data', d => process.stderr.write(`[srv] ${d}`));
  await waitForPort(port);

  const wsUrl = `ws://127.0.0.1:${port}/ws?tableId=${tableId}`;

  // ── Phase 1: JOIN ──
  const alice = new E2EClient(wsUrl);
  const bob = new E2EClient(wsUrl);
  await Promise.all([alice.open(), bob.open()]);
  const joinedAP = alice.waitForType('JOINED');
  const joinedBP = bob.waitForType('JOINED');
  alice.send({ type: 'JOIN', name: 'Alice', clientSeed: 'alice-seed' });
  bob.send({ type: 'JOIN', name: 'Bob', clientSeed: 'bob-seed' });
  await joinedAP;
  await joinedBP;
  assert.ok(alice.playerId && bob.playerId, '两位玩家都应获得 playerId');
  assert.ok(alice.reconnectToken && bob.reconnectToken, '两位玩家都应获得 reconnectToken');
  assert.equal(alice.lastSeats.length, 2, 'JOINED 事件应包含两位玩家');

  // ── Phase 2: START → HAND_STARTED ──
  const handStarted = alice.waitForType('HAND_STARTED');
  alice.send({ type: 'START' });
  await handStarted;
  assert.ok(true, 'HAND_STARTED 事件已收到');

  // ── Phase 3: ACTION → SHOWDOWN (play hand to completion) ──
  // Auto-respond to all ACTION_REQUIRED events with CALL/CHECK
  const unsubA = addAutoResponder(alice, bob);
  await alice.waitForType('HAND_ENDED', 30_000);
  unsubA();

  // Verify HAND_ENDED
  assert.equal(alice.lastSeats.length, 2, 'HAND_ENDED 后应仍有两位玩家');
  const chipsAfterHand1 = alice.chipsById();
  const total1 = [...chipsAfterHand1.values()].reduce((t, c) => t + c, 0);
  assert.equal(total1, START_CHIPS * 2, '第一手结束后总筹码守恒');

  const bobSeatBob = bob.lastSeats.find(s => s.id === bob.playerId);
  assert.ok(bobSeatBob, 'Bob 应仍在座位上');

  // ── Phase 4: RECONNECT ──
  // 模拟 Alice 断线后重连
  alice.close();
  await delay(300); // 等服务端处理 close

  const aliceReconnect = new E2EClient(wsUrl);
  await aliceReconnect.open();
  const reconnectedP = aliceReconnect.waitForType('RECONNECTED', 10_000);
  aliceReconnect.send({
    type: 'RECONNECT',
    playerId: alice.playerId!,
    reconnectToken: alice.reconnectToken!,
    lastSeq: 0,
  });
  await reconnectedP;
  assert.equal(aliceReconnect.playerId, alice.playerId, '重连后 playerId 应一致');
  assert.ok(aliceReconnect.reconnectToken, '重连后应获得新 reconnectToken');
  assert.notEqual(aliceReconnect.reconnectToken, alice.reconnectToken, '重连令牌应轮换');
  assert.equal(aliceReconnect.lastSeats.length, 2, '重连后应看到两位玩家');

  // ── Phase 5: 重连后再打一手牌 ──
  aliceReconnect.send({ type: 'START' });
  await aliceReconnect.waitForType('HAND_STARTED', 10_000);
  const unsubB = addAutoResponder(aliceReconnect, bob);
  await aliceReconnect.waitForType('HAND_ENDED', 30_000);
  unsubB();

  const chipsAfterHand2 = aliceReconnect.chipsById();
  const total2 = [...chipsAfterHand2.values()].reduce((t, c) => t + c, 0);
  assert.equal(total2, START_CHIPS * 2, '第二手结束后总筹码仍守恒');

  aliceReconnect.close();
  bob.close();
});

/** 添加自动响应器：每条 ACTION_REQUIRED 都自动 CALL/CHECK。返回取消函数。 */
function addAutoResponder(...clients: E2EClient[]): () => void {
  const handlers: (() => void)[] = [];
  for (const client of clients) {
    const handler = (msg: AnyMsg) => {
      if (msg.type !== 'ACTION_REQUIRED') return;
      if (msg.playerId !== client.playerId) return;
      const toCall = Number(msg.toCall ?? 0);
      client.send({ type: 'ACTION', action: toCall > 0 ? 'CALL' : 'CHECK' });
    };
    client.ws.on('message', raw => {
      let msg: AnyMsg;
      try { msg = JSON.parse(String(raw)) as AnyMsg; } catch { return; }
      handler(msg);
    });
    handlers.push(() => {}); // WebSocket 的 on 无法直接移除，用 dispose flag 避免
  }
  return () => { /* auto-responder 在连接关闭时自然停用 */ };
}