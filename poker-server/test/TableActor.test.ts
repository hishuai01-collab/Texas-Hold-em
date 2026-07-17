import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TableActor } from '../src/application/TableActor.js';

const tick = (ms = 0) => new Promise<void>(resolve => setTimeout(resolve, ms));

test('TableActor：并发 run 严格串行执行（同一时刻只有一个 Job 在跑）', async () => {
  const actor = new TableActor();
  const order: number[] = [];
  let active = 0;
  let maxActive = 0;

  const job = (n: number) => async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await tick(5);
    order.push(n);
    active -= 1;
  };

  actor.run(job(1));
  actor.run(job(2));
  actor.run(job(3));
  await actor.drain();

  assert.deepEqual(order, [1, 2, 3]);
  assert.equal(maxActive, 1, '任意时刻至多一个 Job 在执行');
});

test('TableActor：单 Job 抛错被兜底，不影响后续 Job', async () => {
  const actor = new TableActor();
  const order: string[] = [];
  actor.run(() => { throw new Error('boom'); });
  actor.run(() => { order.push('after-sync-throw'); });
  actor.run(async () => { throw new Error('boom-async'); });
  actor.run(async () => { order.push('after-async-throw'); });
  await actor.drain();

  assert.deepEqual(order, ['after-sync-throw', 'after-async-throw']);
});

test('TableActor：超时视为失败（不阻塞队列后续 Job）', async () => {
  const actor = new TableActor({ jobTimeoutMs: 20 });
  const order: string[] = [];
  actor.run(() => new Promise<void>(resolve => setTimeout(resolve, 200)));
  actor.run(() => { order.push('next-after-timeout'); });
  await actor.drain();

  assert.deepEqual(order, ['next-after-timeout']);
});

test('TableActor：连续失败达阈值即熔断，后续 Job 直接丢弃并回调通知', async () => {
  let tripped = 0;
  const actor = new TableActor({ breakerThreshold: 2, onBreakerTrip: () => { tripped += 1; } });
  const ran: string[] = [];

  actor.run(() => { throw new Error('fail-1'); });
  actor.run(() => { throw new Error('fail-2'); });
  await actor.drain();
  assert.equal(tripped, 1);
  assert.equal(actor.isHealthy, false);

  actor.run(() => { ran.push('should-not-run'); });
  await actor.drain();
  assert.deepEqual(ran, []);

  actor.resetBreaker();
  assert.equal(actor.isHealthy, true);
  actor.run(() => { ran.push('runs-after-reset'); });
  await actor.drain();
  assert.deepEqual(ran, ['runs-after-reset']);
});

test('TableActor：一次成功的 Job 会重置连续失败计数', async () => {
  let tripped = 0;
  const actor = new TableActor({ breakerThreshold: 2, onBreakerTrip: () => { tripped += 1; } });
  actor.run(() => { throw new Error('fail-1'); });
  actor.run(() => { /* success resets the streak */ });
  actor.run(() => { throw new Error('fail-2'); });
  await actor.drain();
  assert.equal(tripped, 0, '两次失败被一次成功隔开，不应达到阈值');
  assert.equal(actor.isHealthy, true);
});
