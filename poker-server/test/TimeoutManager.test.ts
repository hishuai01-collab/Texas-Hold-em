import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TimeoutManager } from '../src/application/TimeoutManager.js';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('断线玩家在行动时限后获得一次 Time Bank，耗尽才自动处理', async () => {
  const fired: { playerId: string; toCall: number }[] = [];
  let banks = 0;
  const manager = new TimeoutManager({
    actionMs: 10,
    disconnectedTimeBankMs: 10,
    onTimeout: action => fired.push(action),
    onTimeBankStarted: () => { banks++; },
  });
  manager.arm('A', 25);
  manager.markDisconnected('A');
  await wait(15);
  assert.equal(banks, 1);
  assert.deepEqual(fired, []);
  await wait(15);
  assert.deepEqual(fired, [{ playerId: 'A', toCall: 25 }]);
  manager.stop();
});

test('连接正常时，行动时限直接触发自动处理', async () => {
  const fired: { playerId: string; toCall: number }[] = [];
  const manager = new TimeoutManager({ actionMs: 10, onTimeout: action => fired.push(action) });
  manager.arm('B', 0);
  await wait(15);
  assert.deepEqual(fired, [{ playerId: 'B', toCall: 0 }]);
  manager.stop();
});
