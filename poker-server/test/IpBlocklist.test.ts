import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IpBlocklist, extractClientIp } from '../src/infrastructure/security/IpBlocklist.js';

test('IP blocklist: 三次违规后拉黑 60s', () => {
  const bl = new IpBlocklist({ strikesToBan: 3, banTtlMs: 60_000, capacity: 10 });
  assert.equal(bl.isBlocked('1.2.3.4'), false);
  assert.equal(bl.strike('1.2.3.4', 1000), null);
  assert.equal(bl.strike('1.2.3.4', 1000), null);
  const until = bl.strike('1.2.3.4', 1000);
  assert.equal(until, 1000 + 60_000);
  assert.equal(bl.isBlocked('1.2.3.4', 1000), true);
  // 拉黑期内剩余时间递减
  assert.equal(bl.remainingMs('1.2.3.4', 2000), 60_000 - 1000);
});

test('IP blocklist: 解封后清零计数，再次从 0 累加', () => {
  const bl = new IpBlocklist({ strikesToBan: 2, banTtlMs: 1_000, capacity: 10 });
  bl.strike('9.9.9.9', 0);
  bl.strike('9.9.9.9', 0); // 第2次拉黑，until=1000
  assert.equal(bl.isBlocked('9.9.9.9', 500), true);
  assert.equal(bl.isBlocked('9.9.9.9', 1500), false); // 到期自动解封
  assert.equal(bl.strike('9.9.9.9', 1500), null); // 重新从第1次开始
});

test('IP blocklist: LRU 超出容量逐出最久未访问项', () => {
  const bl = new IpBlocklist({ strikesToBan: 100, banTtlMs: 60_000, capacity: 2 });
  bl.strike('a', 1);
  bl.strike('b', 2);
  // 访问 a 使其成为最近，b 变成最久
  bl.strike('a', 3);
  bl.strike('c', 4); // 触发逐出 b
  assert.equal(bl.snapshot(4).some(s => s.ip === 'b'), false);
  assert.equal(bl.snapshot(4).some(s => s.ip === 'a'), true);
  assert.equal(bl.snapshot(4).some(s => s.ip === 'c'), true);
});

test('extractClientIp: 优先取 X-Forwarded-For 首个', () => {
  assert.equal(extractClientIp('203.0.113.7, 10.0.0.1', '10.0.0.1'), '203.0.113.7');
  assert.equal(extractClientIp(undefined, '192.168.1.5'), '192.168.1.5');
  assert.equal(extractClientIp('', '192.168.1.5'), '192.168.1.5');
});
