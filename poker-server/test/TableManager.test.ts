import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TableManager } from '../src/application/TableManager.js';
import { InMemoryEventStore } from '../src/infrastructure/eventstore/EventStore.js';
import { InMemoryTableRegistry } from '../src/infrastructure/registry/TableRegistry.js';
import { PokerMetrics } from '../src/infrastructure/observability/PrometheusMetrics.js';

const tick = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function makeManager(overrides: Partial<{ idleMs: number; reapIntervalMs: number }> = {}) {
  const eventStore = new InMemoryEventStore();
  const registry = new InMemoryTableRegistry();
  const metrics = new PokerMetrics();
  const manager = new TableManager({ eventStore, registry, metrics, idleMs: overrides.idleMs ?? 60_000, reapIntervalMs: overrides.reapIntervalMs ?? 1_000_000 });
  return { manager, eventStore, registry, metrics };
}

test('TableManager：同一 tableId 复用同一个 TableSession', async () => {
  const { manager } = makeManager();
  const a = await manager.getOrCreate('t1');
  const b = await manager.getOrCreate('t1');
  assert.equal(a, b);
  assert.equal(manager.size, 1);
});

test('TableManager：不同 tableId 得到互相独立的 TableSession/GameEngine', async () => {
  const { manager } = makeManager();
  const a = await manager.getOrCreate('t1');
  const b = await manager.getOrCreate('t2');
  assert.notEqual(a, b);
  a.engine.addPlayer('X', 'X', 'seed');
  assert.equal(a.engine.seats.length, 1);
  assert.equal(b.engine.seats.length, 0);
});

test('TableManager：同一全新 tableId 的并发首次访问只会 hydrate 一次、共享同一个 TableSession', async () => {
  const eventStore = new InMemoryEventStore();
  const originalReadSnapshot = eventStore.readSnapshot.bind(eventStore);
  let hydrateCalls = 0;
  eventStore.readSnapshot = async (tableId: string) => {
    hydrateCalls += 1;
    await tick(20); // widen the race window: without dedup, two concurrent callers would both get past the `!existing` check before either finishes
    return originalReadSnapshot(tableId);
  };
  const registry = new InMemoryTableRegistry();
  const metrics = new PokerMetrics();
  const manager = new TableManager({ eventStore, registry, metrics });

  const [a, b] = await Promise.all([manager.getOrCreate('brand-new'), manager.getOrCreate('brand-new')]);

  assert.equal(a, b, '并发的两次 getOrCreate 必须拿到同一个 TableSession，而不是各自建出一个孤儿引擎');
  assert.equal(hydrateCalls, 1, 'hydrate（含 Redis 快照读取）只应发生一次');
  assert.equal(manager.size, 1);
});

test('TableManager：新桌成功后注册进 TableRegistry', async () => {
  const { manager, registry } = makeManager();
  await manager.getOrCreate('t1');
  assert.deepEqual(await registry.listActive(), ['t1']);
});

test('TableManager：从既有快照冷启动重建座位/筹码/按钮位', async () => {
  const { eventStore, registry, metrics } = makeManager();
  const manager1 = new TableManager({ eventStore, registry, metrics });
  const session1 = await manager1.getOrCreate('t1');
  session1.runCommand(() => {
    session1.engine.addPlayer('A', 'A', 'seed-a');
    session1.engine.addPlayer('B', 'B', 'seed-b');
    session1.engine.startHand();
  });
  await session1.actor.drain();
  session1.runCommand(() => {
    session1.engine.act(session1.engine.activePlayer!, 'FOLD'); // instant settle → triggers snapshot
  });
  await session1.actor.drain();

  // Simulate a process restart: brand-new TableManager instance, same EventStore-backed Redis.
  const manager2 = new TableManager({ eventStore, registry, metrics });
  const session2 = await manager2.getOrCreate('t1');
  assert.equal(session2.engine.seats.length, 2);
  assert.equal(session2.engine.handInProgress, false);
  assert.deepEqual(session2.engine.views().map(s => s.id).sort(), ['A', 'B']);
});

test('TableManager：损坏的快照不会让进程崩溃，而是安全地以空桌重开', async () => {
  const { eventStore, registry, metrics } = makeManager();
  await eventStore.writeSnapshot('t1', { version: 1, tableId: 't1', savedAt: new Date().toISOString(), streamCursor: '0', engine: { version: 1, seats: 'not-an-array' } });
  const manager = new TableManager({ eventStore, registry, metrics });
  const session = await manager.getOrCreate('t1');
  assert.equal(session.engine.seats.length, 0);
});

test('TableManager：seedBots 仅在没有既有快照时生效', async () => {
  const { manager } = makeManager();
  const session = await manager.getOrCreate('t1', { seedBots: 2 });
  assert.equal(session.engine.seats.length, 2);
});

test('TableManager：熔断跳闸后该桌立即从路由表摘除，下一次访问重新 hydrate', async () => {
  const eventStore = new InMemoryEventStore();
  const originalAppend = eventStore.appendEvents.bind(eventStore);
  let fail = false;
  eventStore.appendEvents = async (...args) => {
    if (fail) throw new Error('redis down');
    return originalAppend(...args);
  };
  const registry = new InMemoryTableRegistry();
  const metrics = new PokerMetrics();
  const manager = new TableManager({ eventStore, registry, metrics, actorOptions: { breakerThreshold: 1 } });

  const session = await manager.getOrCreate('t1');
  session.runCommand(() => {
    session.engine.addPlayer('A', 'A', 'seed-a');
    session.engine.addPlayer('B', 'B', 'seed-b');
  });
  await session.actor.drain();

  fail = true;
  session.runCommand(() => { session.engine.startHand(); }); // dispatches events → append fails → breaker trips
  await session.actor.drain();
  await tick(5); // handleBreakerTrip runs synchronously in the catch handler, but give the event loop a tick to be safe

  assert.equal(manager.get('t1'), undefined, '跳闸后应立即从本地路由表摘除');
  assert.deepEqual(await registry.listActive(), [], '跳闸后应从注册表摘除');
});

test('TableManager：空桌超过阈值会被回收，close() 完成后不再出现在路由表', async () => {
  const { manager, registry } = makeManager({ idleMs: 1, reapIntervalMs: 20 });
  await manager.getOrCreate('t1');
  assert.equal(manager.size, 1);

  await tick(80); // idleMs(1ms) 早已过期，等待一次巡检（20ms 一次）跑过

  assert.equal(manager.size, 0);
  assert.deepEqual(await registry.listActive(), []);
});

test('TableManager：有进行中手牌的桌子即使空闲很久也不会被回收', async () => {
  const { manager } = makeManager({ idleMs: 1, reapIntervalMs: 20 });
  const session = await manager.getOrCreate('t1');
  session.runCommand(() => {
    session.engine.addPlayer('A', 'A', 'seed-a');
    session.engine.addPlayer('B', 'B', 'seed-b');
    session.engine.startHand();
  });
  await session.actor.drain();

  await tick(80);

  assert.equal(manager.size, 1, '手牌进行中不应被回收');
});

test('TableManager：shutdownAll 为每张桌落一次兜底快照（即使手牌进行中）', async () => {
  const { manager, eventStore } = makeManager();
  const session = await manager.getOrCreate('t1');
  session.runCommand(() => {
    session.engine.addPlayer('A', 'A', 'seed-a');
    session.engine.addPlayer('B', 'B', 'seed-b');
    session.engine.startHand();
  });
  await session.actor.drain();
  assert.equal(session.engine.handInProgress, true);

  await manager.shutdownAll();

  const snapshot = await eventStore.readSnapshot('t1');
  assert.ok(snapshot);
  assert.equal((snapshot!.engine as { handInProgress: boolean }).handInProgress, true, '优雅关闭应完整保留进行中手牌的状态（含私密洗牌熵），而非只在 SETTLE 边界快照');
});
