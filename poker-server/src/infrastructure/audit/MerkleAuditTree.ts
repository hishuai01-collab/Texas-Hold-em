import { createHash } from 'node:crypto';

/** 键排序、无多余空白 → 客户端可逐字节重算 */
export function canonicalJSON(o: unknown): string {
  if (o === null || typeof o !== 'object') return JSON.stringify(o);
  if (Array.isArray(o)) return `[${o.map(canonicalJSON).join(',')}]`;
  return `{${Object.keys(o as object)
    .sort()
    .map(k => `${JSON.stringify(k)}:${canonicalJSON((o as Record<string, unknown>)[k])}`)
    .join(',')}}`;
}

// RFC 6962 风格域分离：叶子前缀 0x00，内部节点 0x01（防第二原像拼接攻击）
export const leafHash = (event: object): Buffer =>
  createHash('sha256')
    .update(Buffer.concat([Buffer.from([0]), Buffer.from(canonicalJSON(event))]))
    .digest();

export const nodeHash = (l: Buffer, r: Buffer): Buffer =>
  createHash('sha256').update(Buffer.concat([Buffer.from([1]), l, r])).digest();

export interface InclusionProof {
  leafIndex: number;
  siblings: { hash: string; left: boolean }[];
}

/**
 * 每手牌一棵树。事件先同步写 WAL（外部职责），手牌结束时构树，
 * root 随结算消息实时推给全桌玩家 —— 这一步才是防篡改的关键。
 */
export class MerkleAuditTree {
  private leaves: Buffer[] = [];

  append(event: object): void {
    this.leaves.push(leafHash(event));
  }

  get size(): number {
    return this.leaves.length;
  }

  root(): Buffer {
    if (this.leaves.length === 0) throw new Error('empty tree');
    let layer = [...this.leaves];
    while (layer.length > 1) {
      const next: Buffer[] = [];
      for (let i = 0; i < layer.length; i += 2) {
        next.push(i + 1 < layer.length ? nodeHash(layer[i], layer[i + 1]) : layer[i]);
      }
      layer = next;
    }
    return layer[0];
  }

  /** 生成第 index 个事件的包含证明，客户端凭 root 独立验证 */
  proof(index: number): InclusionProof {
    if (index < 0 || index >= this.leaves.length) throw new Error('index out of range');
    const siblings: InclusionProof['siblings'] = [];
    let layer = [...this.leaves];
    let idx = index;
    while (layer.length > 1) {
      const sib = idx % 2 === 0 ? idx + 1 : idx - 1;
      if (sib < layer.length) {
        siblings.push({ hash: layer[sib].toString('hex'), left: sib < idx });
      }
      const next: Buffer[] = [];
      for (let i = 0; i < layer.length; i += 2) {
        next.push(i + 1 < layer.length ? nodeHash(layer[i], layer[i + 1]) : layer[i]);
      }
      layer = next;
      idx = Math.floor(idx / 2);
    }
    return { leafIndex: index, siblings };
  }

  static verify(event: object, proof: InclusionProof, root: Buffer): boolean {
    let h = leafHash(event);
    for (const s of proof.siblings) {
      const sib = Buffer.from(s.hash, 'hex');
      h = s.left ? nodeHash(sib, h) : nodeHash(h, sib);
    }
    return h.equals(root);
  }
}
