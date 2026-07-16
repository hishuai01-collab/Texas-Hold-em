import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { deriveShuffleKey, shuffle, cardLeaf } from '../src/domain/services/DeckShuffler.js';
import { MerkleAuditTree, leafHash } from '../src/infrastructure/audit/MerkleAuditTree.js';

const DECK = ['As','Ks','Qs','2c','3c','4c','5d','6d','7d','8h','9h','Th'];

test('洗牌确定性：同种子重放结果一致（客户端可验证）', () => {
  const seed = randomBytes(32);
  const key = deriveShuffleKey(seed, 'hand-1', ['c1', 'c2']);
  assert.deepEqual(shuffle(DECK, key), shuffle(DECK, key));
});

test('客户端熵改变牌序：服务端无法单方面操控', () => {
  const seed = randomBytes(32);
  const k1 = deriveShuffleKey(seed, 'hand-1', ['c1', 'c2']);
  const k2 = deriveShuffleKey(seed, 'hand-1', ['c1', 'DIFFERENT']);
  assert.notDeepEqual(shuffle(DECK, k1), shuffle(DECK, k2));
});

test('Merkle包含证明：客户端凭root独立验证事件存在', () => {
  const tree = new MerkleAuditTree();
  const events = Array.from({ length: 7 }, (_, i) => ({ seq: i, action: 'BET', amount: i * 10 }));
  events.forEach(e => tree.append(e));
  const root = tree.root();
  for (let i = 0; i < events.length; i++) {
    assert.ok(MerkleAuditTree.verify(events[i], tree.proof(i), root), `event ${i}`);
  }
  // 篡改事件后验证必须失败
  assert.ok(!MerkleAuditTree.verify({ seq: 0, action: 'BET', amount: 999 }, tree.proof(0), root));
});

test('叶子哈希确定性：无Date.now()，键序无关', () => {
  const a = leafHash({ seq: 1, action: 'CALL' });
  const b = leafHash({ action: 'CALL', seq: 1 });
  assert.ok(a.equals(b));
});

test('逐张承诺确定性（muck隐私基础）', () => {
  const key = randomBytes(32);
  assert.ok(cardLeaf(0, 'As', key).equals(cardLeaf(0, 'As', key)));
  assert.ok(!cardLeaf(0, 'As', key).equals(cardLeaf(1, 'As', key)));
});
