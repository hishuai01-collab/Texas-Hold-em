// 集成测试：只在 REDIS_URL 已配置时对真实 Redis 断言（CI 通过 services.redis 提供）。
// 本地未配置 Redis 时优雅跳过——单元测试套件（EventStore.test.ts 等）已用内存 Fake
// 覆盖全部业务逻辑，此文件只验证 RedisEventStore/RedisTableRegistry 这一层持久化实现
// 本身能不能正确对接真实 Redis（XADD/XRANGE/XTRIM/SET/GET、SADD/SREM/SMEMBERS）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { RedisEventStore } from '../src/infrastructure/eventstore/RedisEventStore.js';
import { RedisTableRegistry } from '../src/infrastructure/registry/TableRegistry.js';

const redisUrl = process.env.REDIS_URL;
const skip = !redisUrl ? 'REDIS_URL not configured; skipping Redis integration coverage' : false;

test('RedisEventStore：真实 Redis 上事件追加/按游标读取/裁剪均正确', { skip }, async () => {
  const store = new RedisEventStore(redisUrl!);
  const tableId = `it-${randomUUID()}`;
  try {
    await store.appendEvents(tableId, [{ msg: { type: 'A' } }, { msg: { type: 'B' } }]);
    const cursor = await store.appendEvents(tableId, [{ msg: { type: 'C' } }]);

    const all = await store.readEventsAfter(tableId, '0');
    assert.deepEqual(all.map(e => e.msg.type), ['A', 'B', 'C']);

    const sinceB = await store.readEventsAfter(tableId, all[1]!.id);
    assert.deepEqual(sinceB.map(e => e.msg.type), ['C']);

    await store.trimBefore(tableId, cursor);
    const afterTrim = await store.readEventsAfter(tableId, '0');
    assert.equal(afterTrim.length, 0);
  } finally {
    await store.close();
  }
});

test('RedisEventStore：真实 Redis 上快照读写往返一致', { skip }, async () => {
  const store = new RedisEventStore(redisUrl!);
  const tableId = `it-${randomUUID()}`;
  try {
    assert.equal(await store.readSnapshot(tableId), null);
    const record = { version: 1 as const, tableId, savedAt: new Date().toISOString(), streamCursor: '5', engine: { seats: [{ id: 'A', chips: 1000 }], button: 0 } };
    await store.writeSnapshot(tableId, record);
    assert.deepEqual(await store.readSnapshot(tableId), record);
  } finally {
    await store.close();
  }
});

test('RedisTableRegistry：真实 Redis 上注册/摘除/列出存活桌', { skip }, async () => {
  const registry = new RedisTableRegistry(redisUrl!);
  const tableId = `it-${randomUUID()}`;
  try {
    await registry.register(tableId);
    assert.ok((await registry.listActive()).includes(tableId));
    await registry.deregister(tableId);
    assert.ok(!(await registry.listActive()).includes(tableId));
  } finally {
    await registry.close();
  }
});
