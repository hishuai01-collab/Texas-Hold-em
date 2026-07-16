import { createHash, createHmac, hkdfSync } from 'node:crypto';
import type { Card } from '../model/types.js';

/**
 * 洗牌密钥 = HKDF(serverSeed, salt=handId, info=排序后的全部客户端种子)
 * 服务端承诺在先、客户端熵在后 → 双方都无法单独操控牌序
 */
export function deriveShuffleKey(
  serverSeed: Buffer,
  handId: string,
  clientSeeds: string[],
): Buffer {
  const info = Buffer.from([...clientSeeds].sort().join('|'));
  return Buffer.from(hkdfSync('sha256', serverSeed, Buffer.from(handId), info, 32));
}

/** HMAC 计数器流 + 拒绝采样 → 无偏 Fisher-Yates（确定性，客户端可重放验证） */
export function shuffle(deck: Card[], key: Buffer): Card[] {
  const out = [...deck];
  let ctr = 0;
  let pool = Buffer.alloc(0);
  let pos = 0;
  const nextByte = (): number => {
    if (pos >= pool.length) {
      pool = createHmac('sha256', key).update(String(ctr++)).digest();
      pos = 0;
    }
    return pool[pos++];
  };
  const randBelow = (n: number): number => {
    const limit = Math.floor(256 / n) * n; // 拒绝采样，杜绝模偏差
    let b: number;
    do { b = nextByte(); } while (b >= limit);
    return b % n;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = randBelow(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 逐张承诺（Muck 隐私方案）：
 * 对整副已洗好的牌，每张生成 leaf = SHA256(pos ‖ card ‖ perCardSalt)，
 * perCardSalt = HMAC(shuffleKey, 'card-salt' ‖ pos)。
 * 开局广播 deckRoot；摊牌时只对【公开亮出的牌】出示 (card, salt, inclusion proof)，
 * 弃牌玩家的底牌永不揭示 —— 既可验证"牌未被换"，又遵循 Muck 规则。
 */
export function cardLeaf(pos: number, card: Card, shuffleKey: Buffer): Buffer {
  const salt = createHmac('sha256', shuffleKey).update(`card-salt:${pos}`).digest();
  return createHash('sha256').update(`${pos}:${card}:`).update(salt).digest();
}
