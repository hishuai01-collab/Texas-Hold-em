export type Card = string

export interface CardReveal {
  pos: number
  card: Card
  salt: string
  proof: { hash: string; left: boolean }[]
}

export interface SeatView {
  id: string
  name: string
  seatIndex: number
  chips: number
  contributed: number
  betThisStreet: number
  folded: boolean
  allIn: boolean
}

export interface Pot {
  amount: number
  eligible: string[]
}

export type ClientPayload =
  | { type: 'JOIN'; name: string; clientSeed: string }
  | { type: 'START' }
  | { type: 'ACTION'; action: 'FOLD' | 'CHECK' | 'CALL' | 'RAISE' | 'ALL_IN'; amount?: number }
  | { type: 'RECONNECT'; playerId: string; reconnectToken: string; lastSeq: number }

export type ClientMsg = ClientPayload & { clientSeq: number }

export type ServerEvent =
  | { type: 'JOINED'; seq: number; you: string; reconnectToken: string; seats: SeatView[] }
  | { type: 'RECONNECTED'; seq: number; reconnectToken: string; seats: SeatView[] }
  | { type: 'PLAYER_JOINED'; seq: number; seats: SeatView[] }
  | { type: 'HAND_STARTED'; seq: number; handId: string; deckRoot: string; button: number; sb: number; bb: number; seats: SeatView[] }
  | { type: 'PRIVATE_CARDS'; seq: number; reveals: CardReveal[] }
  | { type: 'ACTION_APPLIED'; seq: number; playerId: string; action: string; amount: number; seats: SeatView[]; pot: number }
  | { type: 'ACTION_REQUIRED'; seq: number; playerId: string; toCall: number; minRaiseTo: number }
  | { type: 'STREET'; seq: number; street: 'FLOP' | 'TURN' | 'RIVER'; reveals: CardReveal[] }
  | { type: 'REFUND'; seq: number; playerId: string; amount: number }
  | { type: 'SHOWDOWN'; seq: number; pots: Pot[]; reveals: Record<string, CardReveal[]>; winnings: Record<string, number>; seats: SeatView[] }
  | { type: 'HAND_ENDED'; seq: number; auditRoot: string; eventCount: number }
  | { type: 'ERROR'; message: string }

export interface EventReplay {
  type: 'EVENT_REPLAY'
  events: ServerEvent[]
}

export type ServerMsg = ServerEvent | EventReplay
