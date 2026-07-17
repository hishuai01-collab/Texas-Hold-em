import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryEventStore } from '../src/infrastructure/eventstore/EventStore.js';

test('EventStore：追加事件后按顺序读取，游标之前的不返回', async () => {
  const store = new InMemoryEventStore();
  await store.appendEvents('t1', [{ msg: { type: 'A' } }, { msg: { type: 'B' } }]);
  const cursor = await store.appendEvents('t1', [{ msg: { type: 'C' } }]);

  const all = await store.readEventsAfter('t1', '0');
  assert.deepEqual(all.map(e => e.msg.type), ['A', 'B', 'C']);

  const sinceB = await store.readEventsAfter('t1', all[1]!.id);
  assert.deepEqual(sinceB.map(e => e.msg.type), ['C']);

  const sinceCursor = await store.readEventsAfter('t1', cursor);
  assert.equal(sinceCursor.length, 0);
});

test('EventStore：不同 tableId 的事件流互不干扰', async () => {
  const store = new InMemoryEventStore();
  await store.appendEvents('t1', [{ msg: { type: 'A' } }]);
  await store.appendEvents('t2', [{ msg: { type: 'X' } }]);

  const t1 = await store.readEventsAfter('t1', '0');
  const t2 = await store.readEventsAfter('t2', '0');
  assert.deepEqual(t1.map(e => e.msg.type), ['A']);
  assert.deepEqual(t2.map(e => e.msg.type), ['X']);
});

test('EventStore：私有事件保留 privateTo 目标', async () => {
  const store = new InMemoryEventStore();
  await store.appendEvents('t1', [{ msg: { type: 'PRIVATE_CARDS' }, privateTo: 'playerA' }]);
  const events = await store.readEventsAfter('t1', '0');
  assert.equal(events[0]!.privateTo, 'playerA');
});

test('EventStore：快照读写往返一致', async () => {
  const store = new InMemoryEventStore();
  assert.equal(await store.readSnapshot('t1'), null);
  const record = { version: 1 as const, tableId: 't1', savedAt: new Date().toISOString(), streamCursor: '3', engine: { seats: [] } };
  await store.writeSnapshot('t1', record);
  assert.deepEqual(await store.readSnapshot('t1'), record);
});

test('EventStore：trimBefore 裁剪掉游标之前（含）的事件', async () => {
  const store = new InMemoryEventStore();
  await store.appendEvents('t1', [{ msg: { type: 'A' } }, { msg: { type: 'B' } }, { msg: { type: 'C' } }]);
  const [a, b] = await store.readEventsAfter('t1', '0');
  await store.trimBefore('t1', b!.id);
  const remaining = await store.readEventsAfter('t1', '0');
  assert.deepEqual(remaining.map(e => e.msg.type), ['C']);
  void a;
});
