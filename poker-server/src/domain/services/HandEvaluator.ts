import type { Card, HandRank } from '../model/types.js';

const RANK: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

export const CATEGORY = {
  HIGH_CARD: 0, ONE_PAIR: 1, TWO_PAIR: 2, THREE_OF_A_KIND: 3,
  STRAIGHT: 4, FLUSH: 5, FULL_HOUSE: 6, FOUR_OF_A_KIND: 7,
  STRAIGHT_FLUSH: 8, ROYAL_FLUSH: 9,
} as const;

/** 比较两个牌型：>0 表示 a 大，<0 表示 b 大，0 平局 */
export function compareRank(a: HandRank, b: HandRank): number {
  if (a.category !== b.category) return a.category - b.category;
  const len = Math.max(a.tiebreak.length, b.tiebreak.length);
  for (let i = 0; i < len; i++) {
    const d = (a.tiebreak[i] ?? 0) - (b.tiebreak[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** 精确评估 5 张牌 */
const SUITS = new Set(['s', 'h', 'd', 'c']);

/** 严格校验：必须是 2 字符 '<点数><花色>'，如 'Td'、'As'。非法牌立即抛错，杜绝 NaN 静默污染资金路径 */
function parseRank(card: Card): number {
  const r = card.length === 2 ? RANK[card[0]] : undefined;
  if (r === undefined || !SUITS.has(card[1])) {
    throw new Error(`INVALID_CARD: "${card}" (expected e.g. 'Td', 'As'; ten is 'T' not '10')`);
  }
  return r;
}

export function evaluate5(cards: Card[]): HandRank {
  if (cards.length !== 5) throw new Error('evaluate5 requires exactly 5 cards');
  if (new Set(cards).size !== 5) throw new Error(`DUPLICATE_CARD in ${cards.join(',')}`);
  const ranks = cards.map(parseRank).sort((a, b) => b - a);
  const flush = cards.every(c => c[1] === cards[0][1]);

  // 顺子检测（含 A-5 wheel：A 当 1 用，顺子高牌为 5）
  const uniq = [...new Set(ranks)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 14 && uniq[1] === 5) straightHigh = 5;
  }

  // 按 (张数降序, 点数降序) 分组
  const cnt = new Map<number, number>();
  for (const r of ranks) cnt.set(r, (cnt.get(r) ?? 0) + 1);
  const groups = [...cnt.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  if (flush && straightHigh === 14)
    return { category: CATEGORY.ROYAL_FLUSH, name: 'ROYAL_FLUSH', tiebreak: [14] };
  if (flush && straightHigh)
    return { category: CATEGORY.STRAIGHT_FLUSH, name: 'STRAIGHT_FLUSH', tiebreak: [straightHigh] };
  if (groups[0][1] === 4)
    return { category: CATEGORY.FOUR_OF_A_KIND, name: 'FOUR_OF_A_KIND', tiebreak: [groups[0][0], groups[1][0]] };
  if (groups[0][1] === 3 && groups[1][1] === 2)
    return { category: CATEGORY.FULL_HOUSE, name: 'FULL_HOUSE', tiebreak: [groups[0][0], groups[1][0]] };
  if (flush)
    return { category: CATEGORY.FLUSH, name: 'FLUSH', tiebreak: ranks };
  if (straightHigh)
    return { category: CATEGORY.STRAIGHT, name: 'STRAIGHT', tiebreak: [straightHigh] };
  if (groups[0][1] === 3)
    return { category: CATEGORY.THREE_OF_A_KIND, name: 'THREE_OF_A_KIND', tiebreak: [groups[0][0], groups[1][0], groups[2][0]] };
  if (groups[0][1] === 2 && groups[1][1] === 2)
    return { category: CATEGORY.TWO_PAIR, name: 'TWO_PAIR', tiebreak: [groups[0][0], groups[1][0], groups[2][0]] };
  if (groups[0][1] === 2)
    return { category: CATEGORY.ONE_PAIR, name: 'ONE_PAIR', tiebreak: [groups[0][0], groups[1][0], groups[2][0], groups[3][0]] };
  return { category: CATEGORY.HIGH_CARD, name: 'HIGH_CARD', tiebreak: ranks };
}

/** 7 选 5：枚举全部 C(7,5)=21 种组合，取最大 */
export function evaluateBest(cards: Card[]): HandRank {
  if (cards.length === 5) return evaluate5(cards);
  if (cards.length < 5 || cards.length > 7) throw new Error(`expected 5-7 cards, got ${cards.length}`);
  let best: HandRank | null = null;
  const n = cards.length;
  const combo: Card[] = new Array(5);
  const pick = (start: number, depth: number) => {
    if (depth === 5) {
      const rank = evaluate5(combo.slice());
      if (!best || compareRank(rank, best) > 0) best = rank;
      return;
    }
    for (let i = start; i <= n - (5 - depth); i++) {
      combo[depth] = cards[i];
      pick(i + 1, depth + 1);
    }
  };
  pick(0, 0);
  return best!;
}
