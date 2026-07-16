import type { Card, Pot, Seat } from '../model/types.js';
import { compareRank, evaluateBest } from './HandEvaluator.js';

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every(x => b.includes(x));

/** 按钮位顺时针距离（用于余数筹码的确定性分配） */
const clockwiseDist = (from: number, to: number, tableSize: number) =>
  (((to - from) % tableSize) + tableSize) % tableSize || tableSize;

export class PotDistributor {
  /**
   * 步骤 1：退还未被跟注的下注部分（摊牌前必须先调）
   * 例：A 下注 500，B all-in 200 跟注 → A 拿回 300
   */
  static returnUncalled(seats: Seat[]): { playerId: string; refund: number } | null {
    const byContrib = [...seats].sort((a, b) => b.contributed - a.contributed);
    const top = byContrib[0];
    const second = byContrib[1]?.contributed ?? 0;
    if (!top || top.contributed <= second) return null;
    const refund = top.contributed - second;
    top.chips += refund;
    top.contributed -= refund;
    return { playerId: top.id, refund };
  }

  /**
   * 步骤 2：建池
   * 金额 —— 来自【所有投入者】（含已弃牌，防筹码蒸发）
   * 资格 —— 只给【未弃牌者】
   * 资格集合相同的相邻层合并，避免碎池；支持任意层级边池
   */
  static buildPots(seats: Seat[]): Pot[] {
    const contributors = seats.filter(s => s.contributed > 0);
    const levels = [...new Set(contributors.map(s => s.contributed))].sort((a, b) => a - b);

    const pots: Pot[] = [];
    let prev = 0;
    for (const level of levels) {
      let amount = 0;
      for (const s of contributors) {
        amount += Math.max(0, Math.min(s.contributed, level) - prev);
      }
      const eligible = seats
        .filter(s => !s.folded && s.contributed >= level)
        .map(s => s.id);

      if (amount > 0) {
        const last = pots[pots.length - 1];
        if (last && sameSet(last.eligible, eligible)) last.amount += amount;
        else pots.push({ amount, eligible });
      }
      prev = level;
    }
    return pots;
  }

  /**
   * 步骤 3：从最高边池向主池倒序分配
   * 平局余数 → 按钮位顺时针最近的赢家优先，每人至多多得 1（确定性、可重放）
   */
  static distribute(
    pots: Pot[],
    seats: Seat[],
    community: Card[],
    buttonIndex: number,
    tableSize?: number,
  ): Map<string, number> {
    // 未显式传入时从座位号自动推导。数学上模数只需 > 最大座位号即可保证顺时针排序正确
    const n = tableSize ?? Math.max(buttonIndex, ...seats.map(s => s.seatIndex)) + 1;
    if (seats.some(s => s.seatIndex >= n) || buttonIndex >= n) {
      throw new Error(`SEAT_INDEX_OUT_OF_RANGE: tableSize=${n}`);
    }
    const winnings = new Map<string, number>();
    const byId = new Map(seats.map(s => [s.id, s]));

    for (let i = pots.length - 1; i >= 0; i--) {
      const pot = pots[i];
      const contenders = pot.eligible
        .map(id => byId.get(id))
        .filter((s): s is Seat => !!s && !s.folded);
      if (contenders.length === 0 || pot.amount === 0) continue;

      let winners: Seat[];
      if (contenders.length === 1) {
        winners = contenders; // 只剩一人，白捡，不比牌
      } else {
        const ranked = contenders.map(s => ({
          s,
          rank: evaluateBest([...s.holeCards, ...community]),
        }));
        let best = ranked[0];
        for (const r of ranked) if (compareRank(r.rank, best.rank) > 0) best = r;
        winners = ranked.filter(r => compareRank(r.rank, best.rank) === 0).map(r => r.s);
      }

      winners.sort(
        (a, b) =>
          clockwiseDist(buttonIndex, a.seatIndex, n) -
          clockwiseDist(buttonIndex, b.seatIndex, n),
      );
      const share = Math.floor(pot.amount / winners.length);
      let remainder = pot.amount % winners.length;
      for (const w of winners) {
        const bonus = remainder > 0 ? 1 : 0;
        remainder -= bonus;
        winnings.set(w.id, (winnings.get(w.id) ?? 0) + share + bonus);
      }
    }
    return winnings;
  }

  /** 不变量：Σ分配 === Σ池金额。不等即资损，必须冻结该手 */
  static assertConservation(pots: Pot[], winnings: Map<string, number>): void {
    const potTotal = pots.reduce((s, p) => s + p.amount, 0);
    const paid = [...winnings.values()].reduce((s, v) => s + v, 0);
    if (potTotal !== paid) {
      throw new Error(`CHIP_CONSERVATION_VIOLATED: pots=${potTotal} paid=${paid}`);
    }
  }
}
