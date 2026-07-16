export type Card = string; // 'As' = A♠, 'Td' = T♦, '9h' = 9♥, '2c' = 2♣

export interface Seat {
  id: string;
  seatIndex: number;     // 座位号，用于余数筹码的确定性分配
  chips: number;
  contributed: number;   // 本手总投入 —— 弃牌后保留（防筹码蒸发）
  folded: boolean;
  holeCards: Card[];
}

export interface Pot {
  amount: number;
  eligible: string[];    // 有资格赢此池的玩家（仅未弃牌者）
}

export interface HandRank {
  category: number;      // 0=高牌 ... 9=皇家同花顺
  name: string;
  tiebreak: number[];    // 逐位比较的决胜数组（含踢脚）
}
