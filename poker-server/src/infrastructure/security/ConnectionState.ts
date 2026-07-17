// WSS 连接状态机（Group C：显式化握手阶段，未授权连接一律拦截 ACTION）。
// CONNECTING（已 TCP/WS 握手上、尚未发任何业务消息）
//   → AUTHORIZING（已发 JOIN/RECONNECT，等待服务端签发身份，authId 未稳）
//   → CONNECTED（JOINED/RECONNECTED 成功，authId 稳定，可自由收发业务消息）
// 任意阶段违规达到阈值由网关处理（见 WebSocketGateway）。本状态机只负责
// 「未进入 CONNECTED 之前，拦截 ACTION 等业务指令」的授权闸。

export type ConnectionState = 'CONNECTING' | 'AUTHORIZING' | 'CONNECTED';

const BUSINESS_ACTIONS = new Set(['ACTION', 'START']);

/**
 * 判断某消息类型在当前连接状态下是否允许被处理。
 * - JOIN / RECONNECT 始终允许（用于推进 AUTHORIZING）。
 * - START / ACTION 仅在 CONNECTED 允许。
 * 返回拒绝原因（结构化错误码），允许则返回 null。
 */
export function guardAction(
  state: ConnectionState,
  msgType: string,
): { code: string; message: string } | null {
  if (state === 'CONNECTING') {
    if (BUSINESS_ACTIONS.has(msgType)) {
      return { code: 'NOT_AUTHORIZED', message: '连接尚未认证，请先加入或重连' };
    }
    return null;
  }
  if (state === 'AUTHORIZING') {
    if (BUSINESS_ACTIONS.has(msgType)) {
      return { code: 'NOT_AUTHORIZED', message: '认证进行中，请稍候' };
    }
    return null;
  }
  // CONNECTED：全部放行
  return null;
}

export function nextState(
  state: ConnectionState,
  msgType: string,
  authorized: boolean,
): ConnectionState {
  if (msgType === 'JOIN' || msgType === 'RECONNECT') {
    return authorized ? 'CONNECTED' : 'AUTHORIZING';
  }
  if (state === 'CONNECTED' && authorized) return 'CONNECTED';
  return state;
}
