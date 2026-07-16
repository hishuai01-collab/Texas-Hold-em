import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Seat } from '../src/domain/model/types.js';
import { PotDistributor } from '../src/domain/services/PotDistributor.js';
import { SidePotCalculator } from '../src/domain/services/SidePotCalculator.js';

const seat = (id: string, seatIndex: number, contributed: number, cards: string[]): Seat => ({
  id,
  seatIndex,
  chips: 0,
  contributed,
  folded: false,
  holeCards: cards,
});

test('3人全下极限：主池300、边池400，C的无人跟注200立即退回', () => {
  // A $100 all-in, B $300 all-in, C puts in $500 to call.
  const seats = [
    seat('A', 0, 100, ['Ah', 'Ad']),
    seat('B', 1, 300, ['Kh', 'Kd']),
    seat('C', 2, 500, ['Qh', 'Qd']),
  ];

  const refund = SidePotCalculator.returnUncalled(seats);
  assert.deepEqual(refund, { playerId: 'C', refund: 200 });
  assert.equal(seats[2].contributed, 300);
  assert.equal(seats[2].chips, 200);

  const pots = SidePotCalculator.calculate(seats);
  assert.deepEqual(pots, [
    { kind: 'MAIN', index: 0, amount: 300, eligible: ['A', 'B', 'C'] },
    { kind: 'SIDE', index: 1, amount: 400, eligible: ['B', 'C'] },
  ]);

  // Each pot is evaluated independently: AA wins the main pot; KK wins B/C's side pot.
  const board = ['2c', '7d', '9h', 'Js', '3c'];
  const winnings = PotDistributor.distribute(pots, seats, board, 0, 3);
  assert.equal(winnings.get('A'), 300);
  assert.equal(winnings.get('B'), 400);
  assert.equal(winnings.get('C') ?? 0, 0);
  PotDistributor.assertConservation(pots, winnings);

  for (const player of seats) player.chips += winnings.get(player.id) ?? 0;
  assert.deepEqual(Object.fromEntries(seats.map((player) => [player.id, player.chips])), {
    A: 300,
    B: 400,
    C: 200,
  });
});
