import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PRIVATE_INVITE_PURPOSE,
  PRIVATE_INVITE_VERSION,
  PrivateTableService,
} from '../src/application/PrivateTableService.js';

test('private invite: opaque capability is hashed, versioned, and limited', () => {
  const service = new PrivateTableService();
  const invite = service.create('private-table-a', { displayName: '测试桌', maxUses: 2 });

  assert.match(invite.capability, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(service.isPrivate('private-0123456789abcdef0123456789abcdef'), true, 'restarted private tables must fail closed');
  assert.equal(invite.purpose, PRIVATE_INVITE_PURPOSE);
  assert.equal(invite.version, PRIVATE_INVITE_VERSION);
  assert.match(invite.revokeCapability, /^[A-Za-z0-9_-]{43}$/);
  assert.equal((service as any).invitesByHash.has(invite.capability), false, 'raw capability must not be a storage key');

  assert.equal(service.resolve(invite.capability).ok, true);
  assert.deepEqual(service.consumeForJoin('private-table-other', invite.capability), { ok: false, reason: 'WRONG_TABLE' });
  assert.equal(service.consumeForJoin('private-table-a', invite.capability).ok, true);
  assert.equal(service.consumeForJoin('private-table-a', invite.capability).ok, true);
  assert.deepEqual(service.consumeForJoin('private-table-a', invite.capability), { ok: false, reason: 'EXHAUSTED' });
});

test('private invite: tampering, expiry, and revocation fail closed', () => {
  const service = new PrivateTableService();
  const invite = service.create('private-table-b');

  assert.deepEqual(service.resolve(`${invite.capability}x`), { ok: false, reason: 'INVALID' });
  assert.equal(service.revoke(invite.capability, 'invalid-revoke-token'), false);
  assert.equal(service.revoke(invite.capability, invite.revokeCapability), true);
  assert.deepEqual(service.resolve(invite.capability), { ok: false, reason: 'REVOKED' });

  const expiring = service.create('private-table-c', { ttlMs: 60_000 });
  const now = Date.now;
  Date.now = () => now() + 60_001;
  try {
    assert.deepEqual(service.resolve(expiring.capability), { ok: false, reason: 'EXPIRED' });
  } finally {
    Date.now = now;
  }
});
