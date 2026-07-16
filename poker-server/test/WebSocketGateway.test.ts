import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_MESSAGES_PER_SECOND, WebSocketGateway } from '../src/infrastructure/security/WebSocketGateway.js';

const json = (value: object) => Buffer.from(JSON.stringify(value));

test('WSS gateway accepts strictly consecutive clientSeq values', () => {
  const gateway = new WebSocketGateway();
  const join = gateway.inspect(json({ type: 'JOIN', name: 'Alice', clientSeed: 'seed', clientSeq: 0 }), 1);
  assert.equal(join.ok, true);
  const action = gateway.inspect(json({ type: 'ACTION', action: 'CALL', clientSeq: 1 }), 2);
  assert.equal(action.ok, true);
});

test('WSS gateway rejects replayed or out-of-order clientSeq values', () => {
  const gateway = new WebSocketGateway();
  assert.equal(gateway.inspect(json({ type: 'START', clientSeq: 0 }), 1).ok, true);
  const replay = gateway.inspect(json({ type: 'START', clientSeq: 0 }), 2);
  assert.deepEqual(replay, {
    ok: false,
    reason: 'CLIENT_SEQ_OUT_OF_ORDER',
    violations: 1,
    disconnect: false,
    bytes: replay.bytes,
  });
});

test('WSS gateway allows at most 10 messages in one rolling second', () => {
  const gateway = new WebSocketGateway();
  for (let clientSeq = 0; clientSeq < MAX_MESSAGES_PER_SECOND; clientSeq++) {
    assert.equal(gateway.inspect(json({ type: 'START', clientSeq }), 100).ok, true);
  }
  const rejected = gateway.inspect(json({ type: 'START', clientSeq: MAX_MESSAGES_PER_SECOND }), 100);
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.reason, 'RATE_LIMITED');
});

test('WSS gateway reports an audit event and disconnects after three violations', () => {
  const events: string[] = [];
  const gateway = new WebSocketGateway((event) => events.push(`${event.reason}:${event.violations}:${event.disconnect}`));
  for (let i = 1; i <= 2; i++) {
    const result = gateway.inspect(Buffer.from('{bad json'), i);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.disconnect, false);
  }
  const final = gateway.inspect(Buffer.from('{bad json'), 3);
  assert.equal(final.ok, false);
  if (!final.ok) assert.equal(final.disconnect, true);
  assert.deepEqual(events, ['INVALID_JSON:1:false', 'INVALID_JSON:2:false', 'INVALID_JSON:3:true']);
});
