import assert from 'node:assert/strict';
import { test } from 'node:test';
import { precheckAction } from '../src/infrastructure/security/ActionPrecheck.js';
import {
  signAction,
  verifyActionSignature,
  newTableEpoch,
} from '../src/infrastructure/security/ActionRiskControl.js';

const base = {
  handInProgress: true,
  isActivePlayer: true,
  action: 'CALL',
  amount: 0,
  toCall: 10,
  playerChips: 100,
  playerBetThisStreet: 0,
  currentBet: 10,
};

test('precheck: 非自己回合 → NOT_YOUR_TURN', () => {
  const r = precheckAction({ ...base, isActivePlayer: false });
  assert.deepEqual(r.error, { code: 'NOT_YOUR_TURN', message: '还没轮到你行动' });
});

test('precheck: 无进行中手牌 → NO_HAND_IN_PROGRESS', () => {
  const r = precheckAction({ ...base, handInProgress: false });
  assert.equal(r.error?.code, 'NO_HAND_IN_PROGRESS');
});

test('precheck: 该跟注却过牌 → INVALID_ACTION', () => {
  const r = precheckAction({ ...base, action: 'CHECK', toCall: 10 });
  assert.equal(r.error?.code, 'INVALID_ACTION');
});

test('precheck: 余额不足 CALL → INSUFFICIENT_CHIPS', () => {
  const r = precheckAction({ ...base, playerChips: 0 });
  assert.equal(r.error?.code, 'INSUFFICIENT_CHIPS');
});

test('precheck: 加注超出筹码上限 → INSUFFICIENT_CHIPS', () => {
  const r = precheckAction({ ...base, action: 'RAISE', amount: 99999, playerChips: 50, currentBet: 10 });
  assert.equal(r.error?.code, 'INSUFFICIENT_CHIPS');
});

test('precheck: 合法 CALL/RAISE/FOLD 通过', () => {
  assert.equal(precheckAction({ ...base, action: 'CALL', toCall: 10 }).error, null);
  assert.equal(precheckAction({ ...base, action: 'FOLD' }).error, null);
  assert.equal(precheckAction({ ...base, action: 'RAISE', amount: 20, playerChips: 100, currentBet: 10 }).error, null);
});

test('ActionRiskControl: 签名随载荷/epoch 变化而不同（防篡改/防重放）', () => {
  const epoch = newTableEpoch();
  const p = { playerId: 'p1', clientSeq: 3, action: 'RAISE', amount: 100, tableEpoch: epoch };
  const sig = signAction(p, epoch);
  assert.notEqual(signAction({ ...p, amount: 999 }, epoch), sig); // 篡改 amount 改变签名
  assert.notEqual(signAction(p, newTableEpoch()), sig);            // 换 epoch 改变签名
  // 默认 Hook 未开启时 verify 放行（兼容旧前端），开启后需精确匹配
  assert.equal(verifyActionSignature(p, epoch, sig), true);
  process.env.ACTION_SIG_HOOK = '1';
  assert.equal(verifyActionSignature(p, epoch, sig), true);
  assert.equal(verifyActionSignature({ ...p, amount: 999 }, epoch, sig), false);
  assert.equal(verifyActionSignature(p, newTableEpoch(), sig), false);
  delete process.env.ACTION_SIG_HOOK;
});
