import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID, randomBytes } from 'node:crypto';
import { GameEngine } from './domain/services/GameEngine.js';
import type { ClientMsg, ServerMsg } from './shared/protocol.js';

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
  if (privateTo) sockets.get(privateTo)?.send(data);
  else for (const ws of sockets.values()) if (ws.readyState === WebSocket.OPEN) ws.send(data);
};

const engine = new GameEngine(emit);
for (let i = 0; i < BOTS; i++) {
  const id = `bot-${i + 1}`;
  botIds.add(id);
  engine.addPlayer(id, `Bot·${i + 1}号`, randomBytes(8).toString('hex'));
}

const wss = new WebSocketServer({ port: PORT });
wss.on('connection', ws => {
  const playerId = randomUUID();
  ws.on('message', raw => {
    let msg: ClientMsg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    actor.run(() => {
      try {
        switch (msg.type) {
          case 'JOIN':
            engine.addPlayer(playerId, msg.name, msg.clientSeed);
            sockets.set(playerId, ws);
            ws.send(JSON.stringify({ type: 'JOINED', you: playerId, seats: engine.views() } satisfies ServerMsg));
            emit({ type: 'PLAYER_JOINED', seats: engine.views() });
            break;
          case 'START': engine.startHand(); break;
          case 'ACTION': engine.act(playerId, msg.action, msg.amount ?? 0); break;
        }
      } catch (e) {
        ws.send(JSON.stringify({ type: 'ERROR', message: (e as Error).message } satisfies ServerMsg));
      }
    });
  });
  ws.on('close', () => actor.run(() => {
    sockets.delete(playerId);
    if (!engine.handInProgress) engine.removePlayer(playerId);
  }));
});

console.log(`poker server ws://localhost:${PORT}  (BOTS=${BOTS})`);
console.log('浏览器打开 client/index.html，多标签页=多玩家；BOTS=2 时单人可玩');
