import type { Pot, Seat } from '../model/types.js';

export interface SidePot extends Pot {
  /** Main pot is index 0; every later level is an independently contested side pot. */
  kind: 'MAIN' | 'SIDE';
  index: number;
}

/**
 * Builds the monetary layers of an all-in hand.
 *
 * Amounts are drawn from every contribution, including a folded player's chips.
 * Eligibility is deliberately narrower: only non-folded players who reached a
 * layer may win that layer.  An unmatched top contribution is returned before
 * layering, so no one can be eligible for a one-player "pot".
 */
export class SidePotCalculator {
  /**
   * Return the unmatched top contribution before creating pots.
   * A:100, B:300, C:500 therefore returns 200 to C and leaves 100/300/300.
   */
  static returnUncalled(seats: Seat[]): { playerId: string; refund: number } | null {
    const contributors = seats.filter((seat) => seat.contributed > 0);
    const byContribution = [...contributors].sort((a, b) => b.contributed - a.contributed);
    const top = byContribution[0];
    const secondContribution = byContribution[1]?.contributed ?? 0;
    if (!top || top.contributed <= secondContribution) return null;

    const refund = top.contributed - secondContribution;
    top.contributed -= refund;
    top.chips += refund;
    return { playerId: top.id, refund };
  }

  /**
   * Peel contribution levels from low to high. Each level becomes the main pot
   * or one side pot and carries its own eligible-player set.
   */
  static calculate(seats: Seat[]): SidePot[] {
    const contributors = seats.filter((seat) => seat.contributed > 0);
    const levels = [...new Set(contributors.map((seat) => seat.contributed))].sort((a, b) => a - b);
    const pots: SidePot[] = [];
    let previousLevel = 0;

    for (const level of levels) {
      const contributorsAtLevel = contributors.filter((seat) => seat.contributed >= level);
      const amount = (level - previousLevel) * contributorsAtLevel.length;
      const eligible = contributorsAtLevel.filter((seat) => !seat.folded).map((seat) => seat.id);

      if (amount > 0) {
        const last = pots.at(-1);
        const sameEligibility = last
          && last.eligible.length === eligible.length
          && last.eligible.every((id) => eligible.includes(id));
        if (sameEligibility) {
          last.amount += amount;
        } else {
          pots.push({
            kind: pots.length === 0 ? 'MAIN' : 'SIDE',
            index: pots.length,
            amount,
            eligible,
          });
        }
      }
      previousLevel = level;
    }
    return pots;
  }
}
