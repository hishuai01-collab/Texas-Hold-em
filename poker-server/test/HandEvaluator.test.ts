import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBest, evaluate5, compareRank } from '../src/domain/services/HandEvaluator.js';

test('皇家同花顺', () => {
  const r = evaluateBest(['As', 'Ks', 'Qs', 'Js', 'Ts', '2d', '3c']);
  assert.equal(r.name, 'ROYAL_FLUSH');
});

test('同花顺（9高）', () => {
  const r = evaluateBest(['9h', '8h', '7h', '6h', '5h', 'Ad', 'Kd']);
  assert.equal(r.name, 'STRAIGHT_FLUSH');
  assert.equal(r.tiebreak[0], 9);
});

test('四条（带踢脚K）', () => {
  const r = evaluateBest(['Ac', 'Ad', 'Ah', 'As', 'Kd', '2c', '3d']);
  assert.equal(r.name, 'FOUR_OF_A_KIND');
  assert.deepEqual(r.tiebreak, [14, 13]);
});

test('葫芦：7张里有两组三条时取 AAA+KK', () => {
  const r = evaluateBest(['Ac', 'Ad', 'Ah', 'Kc', 'Kd', 'Kh', '2s']);
  assert.equal(r.name, 'FULL_HOUSE');
  assert.deepEqual(r.tiebreak, [14, 13]);
});

test('同花', () => {
  const r = evaluateBest(['Ah', 'Jh', '9h', '6h', '2h', 'Kd', 'Qc']);
  assert.equal(r.name, 'FLUSH');
  assert.deepEqual(r.tiebreak, [14, 11, 9, 6, 2]);
});

test('顺子优先于对子（7选5取最大）', () => {
  const r = evaluateBest(['9c', '8d', '7h', '6s', '5c', 'Ad', 'Ah']);
  assert.equal(r.name, 'STRAIGHT');
  assert.equal(r.tiebreak[0], 9);
});

test('A-5 wheel 顺子，高牌是5不是A', () => {
  const r = evaluateBest(['Ac', '2d', '3h', '4s', '5c', 'Kd', 'Qh']);
  assert.equal(r.name, 'STRAIGHT');
  assert.equal(r.tiebreak[0], 5);
});

test('三条', () => {
  const r = evaluateBest(['7c', '7d', '7h', 'Ks', '2c', '4d', '9h']);
  assert.equal(r.name, 'THREE_OF_A_KIND');
  assert.deepEqual(r.tiebreak, [7, 13, 9]);
});

test('两对（三对里取最大两对+踢脚）', () => {
  const r = evaluateBest(['Ac', 'Ad', 'Kc', 'Kd', 'Qc', 'Qd', '2s']);
  assert.equal(r.name, 'TWO_PAIR');
  assert.deepEqual(r.tiebreak, [14, 13, 12]); // AA KK 踢脚Q
});

test('一对', () => {
  const r = evaluateBest(['Jc', 'Jd', 'Ah', '9s', '5c', '3d', '2h']);
  assert.equal(r.name, 'ONE_PAIR');
  assert.deepEqual(r.tiebreak, [11, 14, 9, 5]);
});

test('高牌', () => {
  const r = evaluateBest(['Ac', 'Jd', '9h', '7s', '5c', '3d', '2h']);
  assert.equal(r.name, 'HIGH_CARD');
  assert.deepEqual(r.tiebreak, [14, 11, 9, 7, 5]);
});

test('踢脚决胜：同为一对A，K踢脚 > Q踢脚', () => {
  const a = evaluate5(['Ac', 'Ad', 'Kh', '9s', '5c']);
  const b = evaluate5(['Ah', 'As', 'Qh', '9d', '5d']);
  assert.ok(compareRank(a, b) > 0);
});

test('同时存在同花与顺子时，同花胜出', () => {
  const r = evaluateBest(['Ah', 'Kh', 'Qh', 'Jh', '9h', 'Td', '2c']);
  assert.equal(r.name, 'FLUSH'); // A-T顺子存在，但红桃同花更大
});

test('完全平局：双方都用公共牌', () => {
  const board = ['Ah', 'Kh', 'Qh', 'Jh', 'Th'];
  const a = evaluateBest([...board, '2c', '3d']);
  const b = evaluateBest([...board, '4s', '5c']);
  assert.equal(compareRank(a, b), 0);
  assert.equal(a.name, 'ROYAL_FLUSH');
});

test('非法牌面 "10h" 立即抛错，不静默污染', () => {
  assert.throws(() => evaluate5(['10h', '9h', '8h', '7h', '6h']), /INVALID_CARD/);
  assert.throws(() => evaluate5(['Xz', '9h', '8h', '7h', '6h']), /INVALID_CARD/);
});

test('重复牌抛错', () => {
  assert.throws(() => evaluate5(['Ah', 'Ah', '8h', '7h', '6h']), /DUPLICATE_CARD/);
});
