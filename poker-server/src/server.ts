import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID, randomBytes } from 'node:crypto';
import { GameEngine } from './domain/services/GameEngine.js';
import type { ClientMsg, ServerMsg } from './shared/protocol.js';
import { MAX_MESSAGE_BYTES, WebSocketGateway } from './infrastructure/security/WebSocketGateway.js';

interface ExtWebSocket extends WebSocket {
  isAlive: boolean;
  /** 稳定的引擎玩家身份（JOIN 或 RECONNECT 成功后写入）；连接未认证前为 null */
  authId: string | null;
  gateway: WebSocketGateway;
}

/** Actor：本桌所有命令串行处理（设计文档 §1 单写者原则） */
class TableActor {
  private queue: (() => void)[] = [];
  private processing = false;
  run(fn: () => void): void {
    this.queue.push(fn);
    if (this.processing) return;
    this.processing = true;
    while (this.queue.length > 0) this.queue.shift()!();
    this.processing = false;
  }
}

const PORT = Number(process.env.PORT ?? 8080);
// 生产环境严禁监听 0.0.0.0，只接受 Nginx 本机转发；开发环境放开便于本地多端联调
const HOST = process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0';
const BOTS = Number(process.env.BOTS ?? 0); // BOTS=2 npx tsx src/server.ts → 单人可玩
const sockets = new Map<string, WebSocket>();
const botIds = new Set<string>();
const actor = new TableActor();

const emit = (msg: ServerMsg, privateTo?: string): void => {
  // 机器人策略：跟注站（能过就过，有注就跟）
  if (msg.type === 'ACTION_REQUIRED' && botIds.has(msg.playerId)) {
    const { playerId, toCall } = msg;
    setTimeout(() => actor.run(() => {
      try { engine.act(playerId, toCall > 0 ? 'CALL' : 'CHECK'); } catch { /* 已结束 */ }
    }), 400);
  }
  const data = JSON.stringify(msg);
  console.log(`[emit] ${msg.type}${privateTo ? ' → ' + privateTo.slice(0, 8) : ' (broadcast)'}`);
  if (privateTo) sockets.get(privateTo)?.send(data);
  else for (const ws of sockets.values()) if (ws.readyState === WebSocket.OPEN) ws.send(data);
};

const engine = new GameEngine(emit);
for (let i = 0; i < BOTS; i++) {
  const id = `bot-${i + 1}`;
  botIds.add(id);
  engine.addPlayer(id, `Bot·${i + 1}号`, randomBytes(8).toString('hex'));
}

/** 清理断开/死亡连接对应的玩家：从 socket 表与引擎中移除（以稳定 authId 为键） */
function cleanupPlayer(authId: string | null): void {
  if (!authId) return;
  sockets.delete(authId);
  if (!engine.handInProgress) engine.removePlayer(authId);
}

const wss = new WebSocketServer({ host: HOST, port: PORT, maxPayload: MAX_MESSAGE_BYTES });
wss.on('connection', ws => {
  const ext = ws as ExtWebSocket;
  ext.isAlive = true;
  ext.authId = null;
  ext.gateway = new WebSocketGateway((event) => {
    // Structured security record; replace this hook with Telegram/SIEM delivery later.
    console.warn(JSON.stringify({ ...event, at: new Date().toISOString() }));
  });
  ext.on('pong', () => { ext.isAlive = true; });

  ext.on('message', raw => {
    const inspected = ext.gateway.inspect(raw);
    if (!inspected.ok) {
      if (inspected.disconnect) {
        ext.close(1008, 'protocol violations exceeded');
      } else {
        ext.send(JSON.stringify({ type: 'ERROR', message: `协议安全校验失败: ${inspected.reason}` } satisfies ServerMsg));
      }
      return;
    }
    const msg: ClientMsg = inspected.message;
    actor.run(() => {
      try {
        switch (msg.type) {
          case 'JOIN': {
            // 每次 JOIN 生成稳定的引擎玩家身份（与 socket 映射键一致，支持后续重连）
            const id = randomUUID();
            engine.addPlayer(id, msg.name, msg.clientSeed);
            // 签发短期 reconnectToken（仅用于重连鉴权；clientSeed 继续作为洗牌公平熵）
            const reconnectToken = engine.issueReconnectToken(id);
            ext.authId = id;
            sockets.set(id, ext);
            ext.send(JSON.stringify({ type: 'JOINED', seq: 0, you: id, reconnectToken, seats: engine.views() } satisfies ServerMsg));
            emit({ type: 'PLAYER_JOINED', seq: 0, seats: engine.views() });
            break;
          }
          case 'START': engine.startHand(); break;
          case 'ACTION': {
            // 防冒用/防越权：仅当该 playerId 正是当前行动者时才受理，否则丢弃并 ERROR
            const id = ext.authId;
            if (!id || engine.activePlayer !== id) {
              ext.send(JSON.stringify({ type: 'ERROR', message: '未轮到你行动' } satisfies ServerMsg));
              break;
            }
            engine.act(id, msg.action, msg.amount ?? 0);
            break;
          }
          case 'RECONNECT': {
            // 断线后旧 socket 已移除；以服务端签发的短期 reconnectToken 一次性比对 playerId 做身份校验，防冒用/重放。
            if (!engine.verifyAndRotateReconnect(msg.playerId, msg.reconnectToken)) {
              ext.send(JSON.stringify({ type: 'ERROR', message: '重连校验失败' } satisfies ServerMsg));
              break;
            }
            ext.authId = msg.playerId;
            sockets.set(msg.playerId, ext); // 重建 socket 映射（键为该稳定 playerId）
            const events = engine.getReplay(msg.playerId, msg.lastSeq);
            ext.send(JSON.stringify({ type: 'EVENT_REPLAY', events } satisfies ServerMsg));
            // 验证成功后下发轮换后的新令牌（前端据此刷新本地凭证）
            const newToken = engine.currentReconnectToken(msg.playerId)!;
            ext.send(JSON.stringify({ type: 'RECONNECTED', seq: 0, reconnectToken: newToken, seats: engine.views() } satisfies ServerMsg));
            break;
          }
        }
      } catch (e) {
        ext.send(JSON.stringify({ type: 'ERROR', message: (e as Error).message } satisfies ServerMsg));
      }
    });
  });
  ext.on('close', () => actor.run(() => cleanupPlayer(ext.authId)));
  ext.on('error', (error) => {
    console.warn(JSON.stringify({ type: 'WSS_SOCKET_ERROR', message: error.message, at: new Date().toISOString() }));
    ext.terminate();
  });
});

// 心跳：每 15s 对所有连接发 ping，超时未 pong 的判定为死链并清理
const heartbeat = setInterval(() => {
  wss.clients.forEach(client => {
    const c = client as ExtWebSocket;
    if (c.isAlive === false) { c.terminate(); return; }
    c.isAlive = false;
    try { c.ping(); } catch { c.terminate(); }
  });
}, 15_000);
wss.on('close', () => clearInterval(heartbeat));

console.log(`poker server on http://${HOST}:${PORT}  (BOTS=${BOTS})`);
console.log('在仓库根目录执行 client 的 npm run dev；多标签页=多玩家；BOTS=2 时单人可玩');
