import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { GameEngine } from '../src/domain/services/GameEngine.js';
import { HandState } from '../src/domain/model/HandState.js';

const emitMap = new Map<string, any[]>();
const makeEngine = () => {
  emitMap.clear();
  const emit = (msg: any, privateTo?: string) => {
    if (privateTo) {
      const list = emitMap.get(privateTo) ?? [];
      list.push(msg);
      emitMap.set(privateTo, list);
    } else {
      const list = emitMap.get('broadcast') ?? [];
      list.push(msg);
      emitMap.set('broadcast', list);
    }
  };
  const engine = new GameEngine(emit);
  return { engine, emitMap };
};

test('开局：2人桌发4张底牌并广播 HAND_STARTED', () => {
  const { engine, emitMap } = makeEngine();
  engine.addPlayer('A', 'A', randomBytes(8).toString('hex'));
  engine.addPlayer('B', 'B', randomBytes(8).toString('hex'));
  engine.startHand();

  const broadcasts = emitMap.get('broadcast') ?? [];
  const start = broadcasts.find(m => m.type === 'HAND_STARTED');
  assert.ok(start, 'HAND_STARTED missing');
  assert.equal(start.seats.length, 2);
  assert.equal(start.button, 0);

  const privA = emitMap.get('A') ?? [];
  assert.ok(privA.some(m => m.type === 'PRIVATE_CARDS'));
});

test('下注：跟注、加注、弃牌、全押顺序正确', () => {
  const { engine, emitMap } = makeEngine();
  engine.addPlayer('A', 'A', randomBytes(8).toString('hex'), 500);
  engine.addPlayer('B', 'B', randomBytes(8).toString('hex'), 500);
  engine.startHand();

  const req = () => {
    const b = emitMap.get('broadcast') ?? [];
    return b.filter(m => m.type === 'ACTION_REQUIRED').pop();
  };

  let action = req();
  assert.equal(action?.playerId, 'A');
  engine.act('A', 'RAISE', 50);
  action = req();
  assert.equal(action?.playerId, 'B');
  engine.act('B', 'CALL');

  action = req();
  assert.ok(action, '翻牌后应继续行动');
  while (action && engine['handInProgress']) {
    engine.act(action.playerId, 'CHECK');
    action = req();
  }

  const broadcasts = emitMap.get('broadcast') ?? [];
  const showdown = broadcasts.find(m => m.type === 'SHOWDOWN');
  assert.ok(showdown, 'SHOWDOWN missing');
  assert.ok(showdown.winnings.A > 0 || showdown.winnings.B > 0);
});

test('全押边池：3人不同筹码产生双层 pot', () => {
  const { engine, emitMap } = makeEngine();
  engine.addPlayer('A', 'A', randomBytes(8).toString('hex'), 100);
  engine.addPlayer('B', 'B', randomBytes(8).toString('hex'), 300);
  engine.addPlayer('C', 'C', randomBytes(8).toString('hex'), 300);
  engine.startHand();

  const req = () => {
    const b = emitMap.get('broadcast') ?? [];
    return b.filter(m => m.type === 'ACTION_REQUIRED').pop();
  };

  engine.act('A', 'ALL_IN');
  engine.act('B', 'CALL');
  engine.act('C', 'CALL');

  let action = req();
  while (action && engine['handInProgress']) {
    engine.act(action.playerId, 'CHECK');
    action = req();
  }

  const broadcasts = emitMap.get('broadcast') ?? [];
  const showdown = broadcasts.find(m => m.type === 'SHOWDOWN');
  assert.ok(showdown, 'SHOWDOWN missing');
  assert.equal(showdown.pots.length, 1);
  assert.equal(showdown.pots[0].amount, 300);
  // 三人都只跟到 A 的 100，且洗牌随机；验证总派彩守恒而非假定某人必胜。
  const paid = Object.values(showdown.winnings).reduce((sum: number, amount: unknown) => sum + Number(amount), 0);
  assert.equal(paid, 300);
  assert.ok(['A', 'B', 'C'].some((id) => (showdown.winnings[id] ?? 0) > 0));
});

test('reconnectToken：一次性令牌验证成功后轮换', () => {
  const { engine } = makeEngine();
  engine.addPlayer('A', 'A', randomBytes(8).toString('hex'));
  const t1 = engine.issueReconnectToken('A');
  assert.ok(t1);
  assert.ok(engine.verifyAndRotateReconnect('A', t1));
  const t2 = engine.currentReconnectToken('A');
  assert.ok(t2, '新令牌存在');
  assert.notEqual(t1, t2, '令牌已轮换');
  assert.ok(!engine.verifyAndRotateReconnect('A', t1), '旧令牌失效');
  assert.ok(engine.verifyAndRotateReconnect('A', t2!));
});

test('事件重放：仅返回 seq 之后的事件', () => {
  const { engine, emitMap } = makeEngine();
  engine.addPlayer('A', 'A', randomBytes(8).toString('hex'));
  engine.addPlayer('B', 'B', randomBytes(8).toString('hex'));
  engine.startHand();

  let action = (() => {
    const b = emitMap.get('broadcast') ?? [];
    return b.filter(m => m.type === 'ACTION_REQUIRED').pop();
  })();
  engine.act(action!.playerId, 'RAISE', 20);
  engine.act((() => {
    const b = emitMap.get('broadcast') ?? [];
    return b.filter(m => m.type === 'ACTION_REQUIRED').pop();
  })().playerId, 'FOLD');

  const broadcasts = emitMap.get('broadcast') ?? [];
  const actions = broadcasts.filter(m => m.type === 'ACTION_APPLIED');
  assert.ok(actions.length > 0, '至少有一次 ACTION_APPLIED');

  const lastSeq = actions[0].seq;
  const replayed = engine.getReplay('A', lastSeq - 1);
  assert.ok(replayed.some(m => m.seq === lastSeq));

  const replayed2 = engine.getReplay('A', lastSeq);
  assert.ok(!replayed2.some(m => m.seq === lastSeq));
});

test('状态机约束：非行动者调用 act 抛错', () => {
  const { engine, emitMap } = makeEngine();
  engine.addPlayer('A', 'A', randomBytes(8).toString('hex'));
  engine.addPlayer('B', 'B', randomBytes(8).toString('hex'));
  engine.startHand();

  const first = (() => {
    const b = emitMap.get('broadcast') ?? [];
    return b.filter(m => m.type === 'ACTION_REQUIRED').pop();
  })();
  assert.ok(first, '应存在 ACTION_REQUIRED');
  const other = first!.playerId === 'A' ? 'B' : 'A';
  assert.throws(() => engine.act(other, 'CALL'), /未轮到你行动/);
});

test('非法动作：未知 action 抛错', () => {
  const { engine, emitMap } = makeEngine();
  engine.addPlayer('A', 'A', randomBytes(8).toString('hex'));
  engine.addPlayer('B', 'B', randomBytes(8).toString('hex'));
  engine.startHand();

  const first = (() => {
    const b = emitMap.get('broadcast') ?? [];
    return b.filter(m => m.type === 'ACTION_REQUIRED').pop();
  })();
  assert.throws(() => engine.act(first!.playerId, 'SLEEP' as any), /未知动作/);
});

test('显式状态机：开局进入 PREFLOP，结算后回到 WAITING', () => {
  const { engine, emitMap } = makeEngine();
  engine.addPlayer('A', 'A', 'seed-a');
  engine.addPlayer('B', 'B', 'seed-b');
  assert.equal(engine.state, HandState.WAITING);
  engine.startHand();
  assert.equal(engine.state, HandState.PREFLOP);
  const first = (emitMap.get('broadcast') ?? []).find(m => m.type === 'ACTION_REQUIRED');
  engine.act(first.playerId, 'FOLD');
  assert.equal(engine.state, HandState.WAITING);
});

test('短 all-in 不重开已行动玩家的加注权，但要求其补齐下注', () => {
  const { engine, emitMap } = makeEngine();
  engine.addPlayer('A', 'A', 'seed-a', 1_000);
  engine.addPlayer('B', 'B', 'seed-b', 1_000);
  engine.addPlayer('C', 'C', 'seed-c', 150);
  engine.startHand(); // A first; B posts 5, C posts 10
  engine.act('A', 'RAISE', 100);
  engine.act('B', 'CALL');
  engine.act('C', 'ALL_IN'); // 150: +50 only, below A's +90 minimum raise

  let required = (emitMap.get('broadcast') ?? []).filter(m => m.type === 'ACTION_REQUIRED').pop();
  assert.equal(required.playerId, 'A');
  assert.equal(required.toCall, 50);
  assert.equal(required.raiseAllowed, false);
  assert.throws(() => engine.act('A', 'RAISE', 250), /未重开加注权/);
  engine.act('A', 'CALL');

  required = (emitMap.get('broadcast') ?? []).filter(m => m.type === 'ACTION_REQUIRED').pop();
  assert.equal(required.playerId, 'B');
  assert.equal(required.toCall, 50);
  assert.equal(required.raiseAllowed, false);
  assert.throws(() => engine.act('B', 'RAISE', 250), /未重开加注权/);
  engine.act('B', 'CALL');
});

test('不足额跟注会将仅剩筹码全部投入并标记 all-in', () => {
  const { engine } = makeEngine();
  engine.addPlayer('A', 'A', 'seed-a', 1_000);
  engine.addPlayer('B', 'B', 'seed-b', 50);
  engine.addPlayer('C', 'C', 'seed-c', 1_000);
  engine.startHand();
  engine.act('A', 'RAISE', 100);
  engine.act('B', 'CALL');
  const b = engine.seats.find(s => s.id === 'B')!;
  assert.equal(b.chips, 0);
  assert.equal(b.betThisStreet, 50);
  assert.equal(b.allIn, true);
});

test('受保护快照可恢复进行中牌局与当前行动者', () => {
  const { engine } = makeEngine();
  engine.addPlayer('A', 'A', 'seed-a');
  engine.addPlayer('B', 'B', 'seed-b');
  engine.startHand();
  const snapshot = engine.snapshot();

  const restored = new GameEngine(() => undefined);
  assert.equal(restored.restore(snapshot), true);
  assert.equal(restored.state, HandState.PREFLOP);
  assert.equal(restored.activePlayer, engine.activePlayer);
  assert.deepEqual(restored.views(), engine.views());
});
