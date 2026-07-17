// 预校验拦截（Group C/D：消息进入 TableActor 前，预先拦截无效请求并返回统一结构化错误码）。
// 设计：引擎本身已抛具体异常，但「非自己回合」「余额不足」这类高频无效请求，
// 在入口层就结构化拦截，避免无谓进入单写者队列、也避免向前端裸抛中文 message。
// 统一错误码契约（前端可据此做对应 UI，绝不暴露后端字段名/异常栈）：
//   NOT_YOUR_TURN      非自己回合
//   INSUFFICIENT_CHIPS 余额不足
//   NO_HAND_IN_PROGRESS 当前无进行中的手牌
//   INVALID_ACTION     非法动作（如该跟注却过牌、加注数额越界）
//   NOT_AUTHORIZED     连接未认证

export type PrecheckErrorCode =
  | 'NOT_YOUR_TURN'
  | 'INSUFFICIENT_CHIPS'
  | 'NO_HAND_IN_PROGRESS'
  | 'INVALID_ACTION'
  | 'NOT_AUTHORIZED';

export interface PrecheckResult {
  /** null 表示通过，可进入 TableActor；否则携带结构化错误码与用户语言文案 */
  error: { code: PrecheckErrorCode; message: string } | null;
}

/**
 * 在入口层对 ACTION 做轻量预校验（不改动牌桌状态，纯只读判断）。
 * 与引擎内 act() 的领域校验互补：引擎校验是权威最终闸，此处是前置快挡，
 * 减少无效排队并给出结构化错误码。
 */
export function precheckAction(args: {
  handInProgress: boolean;
  isActivePlayer: boolean;
  action: string;
  amount: number;
  toCall: number;
  playerChips: number;
  playerBetThisStreet: number;
  currentBet: number;
}): PrecheckResult {
  if (!args.handInProgress) {
    return { error: { code: 'NO_HAND_IN_PROGRESS', message: '当前没有进行中的手牌' } };
  }
  if (!args.isActivePlayer) {
    return { error: { code: 'NOT_YOUR_TURN', message: '还没轮到你行动' } };
  }

  switch (args.action) {
    case 'FOLD':
      return { error: null };
    case 'CHECK':
      if (args.toCall > 0) {
        return { error: { code: 'INVALID_ACTION', message: `当前需跟注 ${args.toCall}，不能直接过牌` } };
      }
      return { error: null };
    case 'CALL': {
      if (args.toCall <= 0) {
        return { error: { code: 'INVALID_ACTION', message: '当前没有可跟的注，请改为过牌' } };
      }
      if (args.playerChips <= 0) {
        return { error: { code: 'INSUFFICIENT_CHIPS', message: '你的筹码不足，无法跟注' } };
      }
      return { error: null };
    }
    case 'RAISE':
    case 'ALL_IN': {
      if (args.playerChips <= 0) {
        return { error: { code: 'INSUFFICIENT_CHIPS', message: '你的筹码不足，无法下注' } };
      }
      if (args.action === 'RAISE') {
        const minTo = args.currentBet + 1; // 简化下限；引擎有精确 minRaiseInc 兜底
        const maxTo = args.playerChips + args.playerBetThisStreet;
        if (args.amount < minTo) {
          return { error: { code: 'INVALID_ACTION', message: `最小需加注到 ${minTo}` } };
        }
        if (args.amount > maxTo) {
          return { error: { code: 'INSUFFICIENT_CHIPS', message: '加注数额超出你的筹码上限' } };
        }
      }
      return { error: null };
    }
    default:
      return { error: { code: 'INVALID_ACTION', message: '未知的动作类型' } };
  }
}
