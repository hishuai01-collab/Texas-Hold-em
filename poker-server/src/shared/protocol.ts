// 前后端共享协议 —— 客户端只消费事件，绝不自算游戏逻辑
import type { Card, Pot } from '../domain/model/types.js';

// ---------- 客户端 → 服务端 ----------
export type ClientPayload =
  | { type: 'JOIN'; name: string; clientSeed: string }
  | { type: 'START' }
  | { type: 'ACTION'; action: 'FOLD' | 'CHECK' | 'CALL' | 'RAISE' | 'ALL_IN'; amount?: number }
  // 断线重连：携带身份 + 服务端签发的短期 reconnectToken 做一次性鉴权，lastSeq 用于增量重放
  | { type: 'RECONNECT'; playerId: string; reconnectToken: string; lastSeq: number };

/** Each new WebSocket connection starts clientSeq at 0 and increments by exactly one. */
export type ClientMsg = ClientPayload & { clientSeq: number };

// ---------- 服务端 → 客户端（领域事件） ----------
export interface CardReveal {
  pos: number;        // 牌在牌堆中的位置
  card: Card;
  salt: string;       // hex，逐张盐
  proof: { hash: string; left: boolean }[]; // inclusion proof 至 deckRoot
}

export interface SeatView {
  id: string;
  name: string;
  seatIndex: number;
  chips: number;
  contributed: number;
  betThisStreet: number;
  folded: boolean;
  allIn: boolean;
}

// 重连重放可归档的事件（seq 由引擎统一打，此处不含 seq）。用 distributive 形式保留各分支字段。
export type ReplayableServerMsg = ServerMsg extends infer M
  ? M extends { seq: number } ? Omit<M, 'seq'> : M
  : never;

// 广播事件统一带自增 seq（私有事件单独按 playerId 归档，seq 取全手牌共享序列）
export type ServerMsg =
  | { type: 'JOINED'; seq: number; you: string; reconnectToken: string; seats: SeatView[] }
  | { type: 'RECONNECTED'; seq: number; reconnectToken: string; seats: SeatView[] }
  | { type: 'PLAYER_JOINED'; seq: number; seats: SeatView[] }
  | { type: 'HAND_STARTED'; seq: number; handId: string; deckRoot: string; button: number; sb: number; bb: number; seats: SeatView[] }
  | { type: 'PRIVATE_CARDS'; seq: number; reveals: CardReveal[] }              // 仅发给本人
  | { type: 'ACTION_APPLIED'; seq: number; playerId: string; action: string; amount: number; seats: SeatView[]; pot: number }
  | { type: 'ACTION_REQUIRED'; seq: number; playerId: string; toCall: number; minRaiseTo: number }
  | { type: 'STREET'; seq: number; street: 'FLOP' | 'TURN' | 'RIVER'; reveals: CardReveal[] }
  | { type: 'REFUND'; seq: number; playerId: string; amount: number }
  | { type: 'SHOWDOWN'; seq: number; pots: Pot[]; reveals: Record<string, CardReveal[]>; winnings: Record<string, number>; seats: SeatView[] }
  | { type: 'HAND_ENDED'; seq: number; auditRoot: string; eventCount: number }
  | { type: 'ERROR'; message: string }
  // 断线重连：一次性重放 seq > lastSeq 的所有事件（含重连者私有事件）
  | { type: 'EVENT_REPLAY'; events: ServerMsg[] };
