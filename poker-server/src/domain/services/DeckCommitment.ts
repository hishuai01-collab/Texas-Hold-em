import { createHash, createHmac } from 'node:crypto';
import type { Card } from '../model/types.js';
import { nodeHash } from '../../infrastructure/audit/MerkleAuditTree.js';
import type { CardReveal } from '../../shared/protocol.js';

/** 逐张盐：由洗牌密钥派生，客户端无需（也不能）知道密钥 */
export const cardSalt = (pos: number, shuffleKey: Buffer): Buffer =>
  createHmac('sha256', shuffleKey).update(`card-salt:${pos}`).digest();

export const cardLeafOf = (pos: number, card: Card, salt: Buffer): Buffer =>
  createHash('sha256').update(`${pos}:${card}:`).update(salt).digest();

/**
 * Muck 隐私核心：开局只广播整副牌的 Merkle root；
 * 每张公开的牌附 (card, salt, inclusion proof)；弃牌玩家底牌的叶子永不揭示。
 */
export class DeckCommitment {
  private readonly leaves: Buffer[];

  constructor(
    private readonly deck: Card[],
    private readonly shuffleKey: Buffer,
  ) {
    this.leaves = deck.map((c, i) => cardLeafOf(i, c, cardSalt(i, shuffleKey)));
  }

  root(): string {
    let layer = [...this.leaves];
    while (layer.length > 1) {
      const next: Buffer[] = [];
      for (let i = 0; i < layer.length; i += 2) {
        next.push(i + 1 < layer.length ? nodeHash(layer[i], layer[i + 1]) : layer[i]);
      }
      layer = next;
    }
    return layer[0].toString('hex');
  }

  /** 亮一张牌：返回客户端可独立验证的揭示包 */
  reveal(pos: number): CardReveal {
    const proof: CardReveal['proof'] = [];
    let layer = [...this.leaves];
    let idx = pos;
    while (layer.length > 1) {
      const sib = idx % 2 === 0 ? idx + 1 : idx - 1;
      if (sib < layer.length) proof.push({ hash: layer[sib].toString('hex'), left: sib < idx });
      const next: Buffer[] = [];
      for (let i = 0; i < layer.length; i += 2) {
        next.push(i + 1 < layer.length ? nodeHash(layer[i], layer[i + 1]) : layer[i]);
      }
      layer = next;
      idx = Math.floor(idx / 2);
    }
    return {
      pos,
      card: this.deck[pos],
      salt: cardSalt(pos, this.shuffleKey).toString('hex'),
      proof,
    };
  }

  /** 客户端验证逻辑的服务端镜像（用于测试；浏览器版在 client/verify.js） */
  static verify(reveal: CardReveal, rootHex: string): boolean {
    let h = cardLeafOf(reveal.pos, reveal.card, Buffer.from(reveal.salt, 'hex'));
    for (const s of reveal.proof) {
      const sib = Buffer.from(s.hash, 'hex');
      h = s.left ? nodeHash(sib, h) : nodeHash(h, sib);
    }
    return h.toString('hex') === rootHex;
  }
}

export const FULL_DECK: Card[] = (() => {
  const out: Card[] = [];
  for (const r of '23456789TJQKA') for (const s of 'shdc') out.push(r + s);
  return out;
})();
