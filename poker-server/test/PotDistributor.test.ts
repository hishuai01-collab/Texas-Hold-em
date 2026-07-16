import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PotDistributor } from '../src/domain/services/PotDistributor.js';
import type { Seat } from '../src/domain/model/types.js';

const seat = (
  id: string, seatIndex: number, contributed: number,
  folded = false, holeCards: string[] = [], chips = 0,
): Seat => ({ id, seatIndex, contributed, folded, holeCards, chips });

test('3人All-in + 1人弃牌：弃牌筹码留在池中且弃牌者无资格', () => {
  // A all-in 100，B all-in 300，C 跟注300，F 投了50后弃牌
  const board = ['2c', '7d', '9h', 'Js', '3c'];
  const seats = [
    seat('A', 1, 100, false, ['Ah', 'Ad']), // AA → 最大
    seat('B', 3, 300, false, ['Kh', 'Kd']), // KK → 次之
    seat('C', 5, 300, false, ['Qh', 'Qd']), // QQ
    seat('F', 7, 50, true, ['8c', '8d']),   // 弃牌
  ];

  const pots = PotDistributor.buildPots(seats);
  // 主池：50×4 + 50×3 = 350（含F的50），资格 A/B/C（集合相同已合并）
  // 边池：200×2 = 400，资格 B/C
  assert.equal(pots.length, 2);
  assert.equal(pots[0].amount, 350);
  assert.deepEqual([...pots[0].eligible].sort(), ['A', 'B', 'C']);
  assert.ok(!pots[0].eligible.includes('F')); // 弃牌者无资格
  assert.equal(pots[1].amount, 400);
  assert.deepEqual([...pots[1].eligible].sort(), ['B', 'C']);

  // 总额守恒：350+400 = 750 = 100+300+300+50，F的50没有蒸发
  const totalIn = seats.reduce((s, p) => s + p.contributed, 0);
  assert.equal(pots[0].amount + pots[1].amount, totalIn);

  const win = PotDistributor.distribute(pots, seats, board, 0);
  assert.equal(win.get('A'), 350); // AA 赢主池（含弃牌者的钱）
  assert.equal(win.get('B'), 400); // KK 赢边池
  assert.equal(win.get('C') ?? 0, 0);
  assert.equal(win.get('F') ?? 0, 0);
  PotDistributor.assertConservation(pots, win);
});

test('未跟注退还：A下注500，B只有200 all-in', () => {
  const seats = [
    seat('A', 1, 500, false, ['Ah', 'Kd'], 1000),
    seat('B', 2, 200, false, ['Qh', 'Qd'], 0),
  ];
  const r = PotDistributor.returnUncalled(seats);
  assert.deepEqual(r, { playerId: 'A', refund: 300 });
  assert.equal(seats[0].contributed, 200);
  assert.equal(seats[0].chips, 1300);
  const pots = PotDistributor.buildPots(seats);
  assert.equal(pots.length, 1);
  assert.equal(pots[0].amount, 400);
});

test('余数筹码：101平分给2人，按钮位顺时针最近者多得1', () => {
  const board = ['Ah', 'Kh', 'Qh', 'Jh', 'Th']; // 皇家同花顺在公共牌，必平
  const seats = [
    seat('X', 3, 0, false, ['2c', '3d']),
    seat('Y', 7, 0, false, ['4s', '5c']),
  ];
  const pots = [{ amount: 101, eligible: ['X', 'Y'] }];
  // 按钮在5号位：dist(5→7)=2 < dist(5→3)=7 → Y 先拿
  const win = PotDistributor.distribute(pots, seats, board, 5, 9);
  assert.equal(win.get('Y'), 51);
  assert.equal(win.get('X'), 50);
  PotDistributor.assertConservation(pots, win);

  // 换个按钮位置结果必须确定地反转：按钮在1号位 dist(1→3)=2 < dist(1→7)=6
  const win2 = PotDistributor.distribute(pots, seats, board, 1, 9);
  assert.equal(win2.get('X'), 51);
  assert.equal(win2.get('Y'), 50);
});

test('多层边池：4人不同额度All-in，逐层资格正确', () => {
  const board = ['2c', '7d', '9h', 'Js', '3c'];
  const seats = [
    seat('P1', 1, 50, false, ['Ah', 'Ad']),
    seat('P2', 2, 150, false, ['Kh', 'Kd']),
    seat('P3', 3, 400, false, ['Qh', 'Qd']),
    seat('P4', 4, 400, false, ['Th', 'Td']),
  ];
  const pots = PotDistributor.buildPots(seats);
  assert.equal(pots.length, 3);
  assert.equal(pots[0].amount, 200);  // 50×4
  assert.equal(pots[1].amount, 300);  // 100×3
  assert.equal(pots[2].amount, 500);  // 250×2
  assert.equal(pots[0].eligible.length, 4);
  assert.equal(pots[1].eligible.length, 3);
  assert.equal(pots[2].eligible.length, 2);

  const win = PotDistributor.distribute(pots, seats, board, 1);
  assert.equal(win.get('P1'), 200); // AA 只能赢主池
  assert.equal(win.get('P2'), 300); // KK 赢边池1
  assert.equal(win.get('P3'), 500); // QQ 赢边池2
  PotDistributor.assertConservation(pots, win);
});

test('池中仅剩一人时白捡不比牌', () => {
  const seats = [
    seat('A', 1, 300, false, ['2c', '3d']),
    seat('B', 2, 300, true, ['Ah', 'Ad']), // 大牌但弃了
  ];
  const pots = PotDistributor.buildPots(seats);
  const win = PotDistributor.distribute(pots, seats, [], 0);
  assert.equal(win.get('A'), 600);
});

test('tableSize 自动推导：不传参时6人桌余数分配正确', () => {
  const board = ['Ah', 'Kh', 'Qh', 'Jh', 'Th'];
  const seats = [seat('X', 3, 0, false, ['2c', '3d']), seat('Y', 5, 0, false, ['4s', '6c'])];
  const pots = [{ amount: 101, eligible: ['X', 'Y'] }];
  const win = PotDistributor.distribute(pots, seats, board, 4); // 不传 tableSize
  assert.equal(win.get('Y'), 51); // 按钮4，顺时针最近是5号位
  assert.equal(win.get('X'), 50);
});

test('座位号越界时抛错而非错分', () => {
  const seats = [seat('X', 10, 100, false, ['2c', '3d'])];
  const pots = [{ amount: 100, eligible: ['X'] }];
  assert.throws(() => PotDistributor.distribute(pots, seats, [], 0, 9), /SEAT_INDEX_OUT_OF_RANGE/);
});
