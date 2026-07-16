// 前后端共享协议 —— 客户端只消费事件，绝不自算游戏逻辑
import type { Card, Pot } from '../domain/model/types.js';

// ---------- 客户端 → 服务端 ----------
export type ClientMsg =
  | { type: 'JOIN'; name: string; clientSeed: string }
  | { type: 'START' }
  | { type: 'ACTION'; action: 'FOLD' | 'CHECK' | 'CALL' | 'RAISE' | 'ALL_IN'; amount?: number };

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

export type ServerMsg =
  | { type: 'JOINED'; you: string; seats: SeatView[] }
  | { type: 'PLAYER_JOINED'; seats: SeatView[] }
  | { type: 'HAND_STARTED'; handId: string; deckRoot: string; button: number; sb: number; bb: number; seats: SeatView[] }
  | { type: 'PRIVATE_CARDS'; reveals: CardReveal[] }              // 仅发给本人
  | { type: 'ACTION_APPLIED'; playerId: string; action: string; amount: number; seats: SeatView[]; pot: number }
  | { type: 'ACTION_REQUIRED'; playerId: string; toCall: number; minRaiseTo: number }
  | { type: 'STREET'; street: 'FLOP' | 'TURN' | 'RIVER'; reveals: CardReveal[] }
  | { type: 'REFUND'; playerId: string; amount: number }
  | { type: 'SHOWDOWN'; pots: Pot[]; reveals: Record<string, CardReveal[]>; winnings: Record<string, number>; seats: SeatView[] }
  | { type: 'HAND_ENDED'; auditRoot: string; eventCount: number }
  | { type: 'ERROR'; message: string };
