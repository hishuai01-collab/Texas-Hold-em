import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clientMsgSchema, validateOutbound } from '../src/infrastructure/security/schema.js';

test('schema: 合法 ClientMsg 通过校验', () => {
  const ok = clientMsgSchema.safeParse({ type: 'JOIN', name: 'A', clientSeed: 's', clientSeq: 0 });
  assert.equal(ok.success, true);
  const act = clientMsgSchema.safeParse({ type: 'ACTION', action: 'RAISE', amount: 100, clientSeq: 5 });
  assert.equal(act.success, true);
});

test('schema: 非法 action 枚举被拒', () => {
  const r = clientMsgSchema.safeParse({ type: 'ACTION', action: 'BET', clientSeq: 1 });
  assert.equal(r.success, false);
});

test('schema: 越界 clientSeq 被拒（负数）', () => {
  const r = clientMsgSchema.safeParse({ type: 'START', clientSeq: -1 });
  assert.equal(r.success, false);
});

test('schema: 超长 name 被拒（>24）', () => {
  const r = clientMsgSchema.safeParse({ type: 'JOIN', name: 'x'.repeat(25), clientSeed: 's', clientSeq: 0 });
  assert.equal(r.success, false);
});

test('schema: RAISE 负 amount 被拒', () => {
  const r = clientMsgSchema.safeParse({ type: 'ACTION', action: 'RAISE', amount: -5, clientSeq: 1 });
  assert.equal(r.success, false);
});

test('validateOutbound: 合法 ServerMsg 通过', () => {
  const [ok] = validateOutbound({ type: 'ERROR', message: 'boom' });
  assert.equal(ok, true);
});

test('validateOutbound: 非法 ServerMsg 被拒', () => {
  const [ok, reason] = validateOutbound({ type: 'ACTION_APPLIED', playerId: 1 } as any);
  assert.equal(ok, false);
  assert.equal(typeof reason, 'string');
});
