import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { TableSession } from '../src/application/TableSession.js';
import { InMemoryEventStore } from '../src/infrastructure/eventstore/EventStore.js';
import { PokerMetrics } from '../src/infrastructure/observability/PrometheusMetrics.js';

function makeSocket() {
  const sent: unknown[] = [];
  const closed: unknown[] = [];
  return {
    readyState: WebSocket.OPEN,
    send: (data: string) => sent.push(JSON.parse(data)),
    close: (code?: number, reason?: string) => closed.push({ code, reason }),
    sent,
    closed,
  } as unknown as WebSocket & { sent: unknown[]; closed: unknown[] };
}

async function drained(session: TableSession): Promise<void> {
  await session.actor.drain();
}

test('TableSession：命令执行后事件先落 Redis(EventStore) 再投递给 socket', async () => {
  const eventStore = new InMemoryEventStore();
  const metrics = new PokerMetrics();
  const session = new TableSession({ tableId: 't1', eventStore, metrics });

  const order: string[] = [];
  const originalAppend = eventStore.appendEvents.bind(eventStore);
  eventStore.appendEvents = async (...args) => { const r = await originalAppend(...args); order.push('persist'); return r; };

  const sockA = makeSocket();
  const originalSend = sockA.send;
  sockA.send = (data: string) => { order.push('deliver'); return originalSend(data); };

  session.runCommand(() => {
    session.sockets.set('A', sockA as unknown as WebSocket);
    session.engine.addPlayer('A', 'A', 'seed-a');
    session.engine.addPlayer('B', 'B', 'seed-b');
    session.engine.startHand();
  });
  await drained(session);

  const stored = await eventStore.readEventsAfter('t1', '0');
  assert.ok(stored.some(e => e.msg.type === 'HAND_STARTED'), 'startHand 应产生 HAND_STARTED 事件并落盘');
  assert.ok(order.includes('persist') && order.includes('deliver'), '应同时发生持久化与投递');
  assert.equal(order.indexOf('persist'), 0, '持久化必须先于任何一次投递发生');
});

test('TableSession：手牌结束（HAND_ENDED）触发快照落盘，且快照晚于事件持久化', async () => {
  const eventStore = new InMemoryEventStore();
  const metrics = new PokerMetrics();
  const session = new TableSession({ tableId: 't2', eventStore, metrics });

  session.runCommand(() => {
    session.engine.addPlayer('A', 'A', 'seed-a');
    session.engine.addPlayer('B', 'B', 'seed-b');
    session.engine.startHand();
  });
  await drained(session);

  // Force a fast showdown: both fold to one, or just have one fold immediately.
  session.runCommand(() => {
    const active = session.engine.activePlayer!;
    session.engine.act(active, 'FOLD');
  });
  await drained(session);

  const snapshot = await eventStore.readSnapshot('t2');
  assert.ok(snapshot, '应在 HAND_ENDED 后写入快照');
  assert.equal(snapshot!.tableId, 't2');
  assert.equal((snapshot!.engine as { handInProgress: boolean }).handInProgress, false, '快照应捕获「已结算、无进行中手牌」的一致检查点');

  // 快照落盘后会裁剪掉游标之前（含）的事件——它们已被快照取代，不再需要用于恢复。
  const remaining = await eventStore.readEventsAfter('t2', '0');
  assert.equal(remaining.length, 0, 'SETTLE 快照之后应裁剪掉已被取代的旧事件，防止 Stream 无界增长');
});

test('TableSession：广播事件送达全部已登记 socket，私有事件只送目标 socket', async () => {
  const eventStore = new InMemoryEventStore();
  const metrics = new PokerMetrics();
  const session = new TableSession({ tableId: 't3', eventStore, metrics });
  const sockA = makeSocket();
  const sockB = makeSocket();

  session.runCommand(() => {
    session.sockets.set('A', sockA as unknown as WebSocket);
    session.sockets.set('B', sockB as unknown as WebSocket);
    session.engine.addPlayer('A', 'A', 'seed-a');
    session.engine.addPlayer('B', 'B', 'seed-b');
    session.engine.startHand();
  });
  await drained(session);

  const broadcastTypes = sockA.sent.map((m: any) => m.type);
  assert.ok(broadcastTypes.includes('HAND_STARTED'));
  const privateTypesA = sockA.sent.filter((m: any) => m.type === 'PRIVATE_CARDS');
  const privateTypesB = sockB.sent.filter((m: any) => m.type === 'PRIVATE_CARDS');
  assert.equal(privateTypesA.length, 1);
  assert.equal(privateTypesB.length, 1);
});

test('TableSession：isIdle 仅在无 socket 且无进行中手牌且超过阈值时为真', async () => {
  const eventStore = new InMemoryEventStore();
  const metrics = new PokerMetrics();
  const session = new TableSession({ tableId: 't4', eventStore, metrics });
  assert.equal(session.isIdle(-1), true, '刚创建、无 socket、无手牌，阈值为负（已超时）应视为空闲');
  assert.equal(session.isIdle(60_000), false, '尚未超过阈值时长，不应视为空闲');

  session.runCommand(() => {
    session.engine.addPlayer('A', 'A', 'seed-a');
    session.engine.addPlayer('B', 'B', 'seed-b');
    session.engine.startHand();
  });
  await drained(session);
  assert.equal(session.isIdle(-1), false, '手牌进行中即使超过阈值也不应被判定为空闲');
});

test('TableSession：熔断触发会调用 onBreakerTrip 并携带 tableId', async () => {
  const eventStore = new InMemoryEventStore();
  eventStore.appendEvents = async () => { throw new Error('redis down'); };
  const metrics = new PokerMetrics();
  let trippedFor: string | null = null;
  const session = new TableSession({
    tableId: 't5',
    eventStore,
    metrics,
    actorOptions: { breakerThreshold: 1 },
    onBreakerTrip: (tableId) => { trippedFor = tableId; },
  });

  session.runCommand(() => {
    session.engine.addPlayer('A', 'A', 'seed-a');
    session.engine.addPlayer('B', 'B', 'seed-b');
    session.engine.startHand(); // dispatches HAND_STARTED etc., so appendEvents actually gets called
  });
  await drained(session);

  assert.equal(trippedFor, 't5');
  assert.equal(session.actor.isHealthy, false);
});
