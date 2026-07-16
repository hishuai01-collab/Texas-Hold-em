import { randomBytes, randomUUID } from 'node:crypto';
import type { Card } from '../model/types.js';
import { deriveShuffleKey, shuffle } from './DeckShuffler.js';
import { DeckCommitment, FULL_DECK } from './DeckCommitment.js';
import { PotDistributor } from './PotDistributor.js';
import { SidePotCalculator } from './SidePotCalculator.js';
import { MerkleAuditTree } from '../../infrastructure/audit/MerkleAuditTree.js';
import type { CardReveal, ReplayableServerMsg, ServerMsg, SeatView } from '../../shared/protocol.js';

export interface EngineSeat {
  id: string;
  name: string;
  seatIndex: number;
  chips: number;
  contributed: number;
  betThisStreet: number;
  folded: boolean;
  allIn: boolean;
  holeCards: Card[];
  clientSeed: string;
}

type Street = 'PREFLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'DONE';
export type Emit = (msg: ServerMsg, privateTo?: string) => void;

/**
 * 单桌状态机。简化声明（作业范围内明说）：
 * - 未实现"不足额all-in不重开加注权"的细则（短all-in后其余玩家仍可再加注）
 * - 无烧牌（burn card）——不影响公平性，牌序已被承诺锚定
 */
export class GameEngine {
  seats: EngineSeat[] = [];
  private street: Street = 'DONE';
  private deck: Card[] = [];
  private dealt = 0;
  private board: Card[] = [];
  private commitment!: DeckCommitment;
  private audit = new MerkleAuditTree();
  private button = -1; // seats数组下标
  private currentBet = 0;
  private minRaiseInc = 0;
  private actingPos = -1;
  private needAction = new Set<string>();
  handInProgress = false;
  private seq = 0;
  /** 重连鉴权：playerId → 服务端签发的短期 reconnectToken（一次性，验证通过后立即轮换） */
  private reconnectTokens = new Map<string, string>();
  /** 重连重放：全手牌自增 seq 的广播事件历史 */
  private replayLog: { seq: number; msg: ServerMsg }[] = [];
  /** 重连重放：每个玩家的私有事件（PRIVATE_CARDS 等）按 playerId 归档，seq 取自共享序列 */
  private replayPrivate = new Map<string, { seq: number; msg: ServerMsg }[]>();

  constructor(
    private readonly emit: Emit,
    public readonly sb = 5,
    public readonly bb = 10,
  ) {}

  /** 当前轮到行动的玩家 id（用于 ACTION 防冒用） */
  get activePlayer(): string | null {
    const s = this.seats[this.actingPos];
    return s && this.handInProgress && this.needAction.has(s.id) ? s.id : null;
  }

  /**
   * 统一出口：给每条事件打自增 seq 并归档到重连日志，再广播/私发。
   * ERROR 不进重放日志（瞬时错误，无需重建牌桌）。
   */
  private dispatch(msg: ReplayableServerMsg, privateTo?: string): void {
    if (msg.type === 'ERROR') { this.emit(msg as ServerMsg); return; }

    const seq = this.seq++;
    const tagged = { ...msg, seq } as ServerMsg;
    if (privateTo) {
      const list = this.replayPrivate.get(privateTo) ?? [];
      list.push({ seq, msg: tagged });
      this.replayPrivate.set(privateTo, list);
    } else {
      this.replayLog.push({ seq, msg: tagged });
    }
    this.emit(tagged, privateTo);
  }

  // ---------- 入座 ----------
  addPlayer(id: string, name: string, clientSeed: string, chips = 1000): void {
    if (this.handInProgress) throw new Error('手牌进行中，等下一局');
    if (this.seats.length >= 6) throw new Error('桌满');
    const seatIndex = this.seats.length; // demo：顺序入座
    this.seats.push({
      id, name, seatIndex, chips,
      contributed: 0, betThisStreet: 0, folded: false, allIn: false,
      holeCards: [], clientSeed,
    });
  }

  removePlayer(id: string): void {
    this.seats = this.seats.filter(s => s.id !== id);
    this.reconnectTokens.delete(id);
  }

  views(): SeatView[] {
    return this.seats.map(({ holeCards, clientSeed, ...v }) => v);
  }

  private log(event: object): void {
    this.audit.append({ seq: this.seq++, ...event });
  }

  // ---------- 开局 ----------
  startHand(): void {
    const ready = this.seats.filter(s => s.chips > 0);
    if (ready.length < 2) throw new Error('至少2名有筹码的玩家');
    this.seats = ready;
    this.seats.forEach(s => {
      s.contributed = 0; s.betThisStreet = 0; s.folded = false; s.allIn = false; s.holeCards = [];
    });
    this.handInProgress = true;
    this.audit = new MerkleAuditTree();
    this.seq = 0;
    this.replayLog = [];
    this.replayPrivate.clear();
    this.board = [];
    this.dealt = 0;
    this.button = (this.button + 1) % this.seats.length;

    // 可验证公平：混合熵洗牌 + 逐张承诺
    const handId = randomUUID();
    const serverSeed = randomBytes(32);
    const key = deriveShuffleKey(serverSeed, handId, this.seats.map(s => s.clientSeed));
    this.deck = shuffle(FULL_DECK, key);
    this.commitment = new DeckCommitment(this.deck, key);
    const deckRoot = this.commitment.root();
    this.log({ event: 'HAND_STARTED', handId, deckRoot, button: this.button });

    const n = this.seats.length;
    const sbPos = n === 2 ? this.button : (this.button + 1) % n; // 单挑：按钮即小盲
    const bbPos = (sbPos + 1) % n;
    this.dispatch({
      type: 'HAND_STARTED', handId, deckRoot,
      button: this.seats[this.button].seatIndex, sb: this.sb, bb: this.bb,
      seats: this.views(),
    });

    this.postBlind(sbPos, this.sb);
    this.postBlind(bbPos, this.bb);
    this.currentBet = this.bb;
    this.minRaiseInc = this.bb;

    // 发底牌：从小盲起轮转两圈，每人一次一张（顺序确定，客户端可按承诺核对位置）
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < n; i++) {
        const pos = (sbPos + i) % n;
        this.seats[pos].holeCards.push(this.take());
      }
    }
    // 私发揭示包（仅本人可见，可验证自己的牌未被换）
    for (let i = 0; i < n; i++) {
      const pos = (sbPos + i) % n;
      const first = pos === sbPos ? 0 : (pos - sbPos + n) % n;
      const reveals = [this.commitment.reveal(first), this.commitment.reveal(first + n)];
      this.dispatch({ type: 'PRIVATE_CARDS', reveals }, this.seats[pos].id);
    }

    this.street = 'PREFLOP';
    this.resetNeedAction();
    this.actingPos = this.nextActive((bbPos + 1) % n - 1 >= 0 ? bbPos : bbPos); // 起点=大盲后一位
    this.actingPos = this.nextActive(bbPos);
    this.requestAction();
  }

  private postBlind(pos: number, amount: number): void {
    const s = this.seats[pos];
    const paid = Math.min(amount, s.chips);
    s.chips -= paid; s.contributed += paid; s.betThisStreet += paid;
    if (s.chips === 0) s.allIn = true;
    this.log({ event: 'BLIND', playerId: s.id, amount: paid });
  }

  private take(): Card {
    return this.deck[this.dealt++];
  }

  // ---------- 玩家动作 ----------
  act(playerId: string, action: string, amount = 0): void {
    if (!this.handInProgress) throw new Error('没有进行中的手牌');
    const s = this.seats[this.actingPos];
    if (!s || s.id !== playerId) throw new Error('未轮到你行动');
    const toCall = this.currentBet - s.betThisStreet;

    switch (action) {
      case 'FOLD':
        s.folded = true;
        break;
      case 'CHECK':
        if (toCall > 0) throw new Error(`需跟注${toCall}，不能过牌`);
        break;
      case 'CALL': {
        if (toCall <= 0) throw new Error('无注可跟，请过牌');
        const paid = Math.min(toCall, s.chips);
        this.pay(s, paid);
        break;
      }
      case 'RAISE': {
        // amount = 加注到的总额（raise to）。严格限制在 [minRaiseTo, 玩家最大可下注]，防筹码溢出
        const minTo = this.currentBet + this.minRaiseInc;
        const maxTo = s.betThisStreet + s.chips; // 玩家全部筹码能加注到的最高总额
        if (amount < minTo) throw new Error(`最小加注到${minTo}`);
        if (amount > maxTo) throw new Error(`最多加到${maxTo}`);
        const need = amount - s.betThisStreet;
        if (need >= s.chips) return this.act(playerId, 'ALL_IN');
        this.minRaiseInc = amount - this.currentBet;
        this.currentBet = amount;
        this.pay(s, need);
        this.reopenAction(s.id);
        break;
      }
      case 'ALL_IN': {
        const total = s.betThisStreet + s.chips;
        if (total > this.currentBet) {
          this.minRaiseInc = Math.max(this.minRaiseInc, total - this.currentBet);
          this.currentBet = total;
          this.reopenAction(s.id);
        }
        this.pay(s, s.chips);
        break;
      }
      default:
        throw new Error(`未知动作: ${action}`);
    }

    this.needAction.delete(s.id);
    this.log({ event: 'ACTION', playerId, action, amount });
    this.dispatch({
      type: 'ACTION_APPLIED', playerId, action,
      amount: s.betThisStreet,
      seats: this.views(),
      pot: this.seats.reduce((t, p) => t + p.contributed, 0),
    });
    this.advance();
  }

  /**
   * 签发 reconnectToken：玩家 JOIN 成功时调用，生成有时效性的短期令牌。
   * 当前为单实例内存态（用户已暂缓 Redis 持久化）；生产多实例时应下沉 Redis 并设置 EX 过期。
   * 单次席位仅保留最新令牌，旧令牌自动失效。
   */
  issueReconnectToken(playerId: string): string {
    const token = randomBytes(32).toString('hex');
    this.reconnectTokens.set(playerId, token);
    return token;
  }

  /**
   * 重连身份校验（一次性令牌）：
   * 仅当该 playerId 仍在桌上、且令牌与引擎侧一致时通过；验证成功后立即轮换新令牌，
   * 旧令牌作废，防止重放攻击。
   */
  verifyAndRotateReconnect(playerId: string, token: string): boolean {
    const seat = this.seats.find(s => s.id === playerId);
    if (!seat) return false;
    const expected = this.reconnectTokens.get(playerId);
    if (!expected || expected !== token) return false;
    // 一次性：成功后立即签发新令牌，旧令牌失效
    this.reconnectTokens.set(playerId, randomBytes(32).toString('hex'));
    return true;
  }

  /** 重连成功后取最新令牌回传前端（前端据此刷新本地凭证） */
  currentReconnectToken(playerId: string): string | null {
    return this.reconnectTokens.get(playerId) ?? null;
  }

  /**
   * 生成断线重放事件：过滤 seq > lastSeq 的广播事件，并并入该玩家私有事件，
   * 按 seq 升序一次性返回，前端据此重建牌桌。
   */
  getReplay(playerId: string, lastSeq: number): ServerMsg[] {
    const priv = this.replayPrivate.get(playerId) ?? [];
    const all = [...this.replayLog, ...priv]
      .filter(e => e.seq > lastSeq)
      .sort((a, b) => a.seq - b.seq)
      .map(e => e.msg);
    return all;
  }

  private pay(s: EngineSeat, amount: number): void {
    s.chips -= amount; s.contributed += amount; s.betThisStreet += amount;
    if (s.chips === 0) s.allIn = true;
  }

  private reopenAction(raiserId: string): void {
    this.needAction = new Set(
      this.seats.filter(p => !p.folded && !p.allIn && p.id !== raiserId).map(p => p.id),
    );
  }

  private resetNeedAction(): void {
    this.needAction = new Set(
      this.seats.filter(p => !p.folded && !p.allIn).map(p => p.id),
    );
  }

  // ---------- 推进 ----------
  private advance(): void {
    const active = this.seats.filter(p => !p.folded);
    if (active.length === 1) return this.settleHand(); // 全弃牌快速通道

    if (this.needAction.size === 0) return this.nextStreet();

    this.actingPos = this.nextActive(this.actingPos);
    this.requestAction();
  }

  private nextActive(fromPos: number): number {
    const n = this.seats.length;
    for (let i = 1; i <= n; i++) {
      const p = (fromPos + i) % n;
      const s = this.seats[p];
      if (!s.folded && !s.allIn && this.needAction.has(s.id)) return p;
    }
    return -1;
  }

  private requestAction(): void {
    if (this.actingPos < 0) return this.nextStreet();
    const s = this.seats[this.actingPos];
    this.dispatch({
      type: 'ACTION_REQUIRED', playerId: s.id,
      toCall: this.currentBet - s.betThisStreet,
      minRaiseTo: this.currentBet + this.minRaiseInc,
    });
  }

  private nextStreet(): void {
    this.seats.forEach(s => { s.betThisStreet = 0; });
    this.currentBet = 0;
    this.minRaiseInc = this.bb;

    const order: Street[] = ['PREFLOP', 'FLOP', 'TURN', 'RIVER'];
    const idx = order.indexOf(this.street);
    if (this.street === 'RIVER') return this.settleHand();
    this.street = order[idx + 1];

    const count = this.street === 'FLOP' ? 3 : 1;
    const reveals: CardReveal[] = [];
    for (let i = 0; i < count; i++) {
      const pos = this.dealt;
      this.board.push(this.take());
      reveals.push(this.commitment.reveal(pos));
    }
    this.log({ event: 'STREET', street: this.street, cards: reveals.map(r => r.card) });
      this.dispatch({ type: 'STREET', street: this.street as 'FLOP' | 'TURN' | 'RIVER', reveals });

    // 所有人都all-in（或只剩一个能动）→ 直接跑完剩余街
    this.resetNeedAction();
    if (this.needAction.size <= 1 && this.seats.filter(p => !p.folded && !p.allIn).length <= 1) {
      // 只剩0-1人能行动且无人可被加注 → 无下注意义，直接下一街
      const stillContested = this.seats.filter(p => !p.folded).length > 1;
      if (stillContested && this.needAction.size === 0) return this.nextStreet();
    }
    this.actingPos = this.nextActive(this.button); // 翻牌后从按钮下一位开始
    this.requestAction();
  }

  // ---------- 结算 ----------
  /** Independently settle the main pot and every side pot after all contributions close. */
  private settleHand(): void {
    const refund = SidePotCalculator.returnUncalled(this.seats);
    if (refund) {
      this.log({ event: 'REFUND', ...refund });
      this.dispatch({ type: 'REFUND', playerId: refund.playerId, amount: refund.refund });
    }

    const pots = SidePotCalculator.calculate(this.seats);
    const winnings = PotDistributor.distribute(
      pots, this.seats, this.board,
      this.seats[this.button].seatIndex,
      Math.max(...this.seats.map(s => s.seatIndex)) + 1,
    );
    PotDistributor.assertConservation(pots, winnings);

    // 摊牌揭示：只揭示未弃牌且需比牌的玩家底牌；弃牌者的牌永不揭示（Muck）
    const contested = this.seats.filter(p => !p.folded);
    const reveals: Record<string, CardReveal[]> = {};
    if (contested.length > 1) {
      const n = this.seats.length;
      const sbPos = n === 2 ? this.button : (this.button + 1) % n;
      for (const p of contested) {
        const pos = this.seats.indexOf(p);
        const first = (pos - sbPos + n) % n;
        reveals[p.id] = [this.commitment.reveal(first), this.commitment.reveal(first + n)];
      }
    }

    winnings.forEach((won, id) => {
      const p = this.seats.find(s => s.id === id);
      if (p) p.chips += won;
    });

    this.log({ event: 'SHOWDOWN', winnings: Object.fromEntries(winnings) });
    this.dispatch({
      type: 'SHOWDOWN', pots, reveals,
      winnings: Object.fromEntries(winnings),
      seats: this.views(),
    });
    this.dispatch({ type: 'HAND_ENDED', auditRoot: this.audit.root().toString('hex'), eventCount: this.audit.size });
    this.handInProgress = false;
    this.street = 'DONE';
  }
}
