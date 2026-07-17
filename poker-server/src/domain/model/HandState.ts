/** Explicit hand lifecycle.  SETTLE is observable internally while pots are paid. */
export enum HandState {
  WAITING = 'WAITING',
  PREFLOP = 'PREFLOP',
  FLOP = 'FLOP',
  TURN = 'TURN',
  RIVER = 'RIVER',
  SETTLE = 'SETTLE',
}
