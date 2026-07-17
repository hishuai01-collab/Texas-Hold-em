// 短时 Action 风控签名预留 Hook（Group D：防中间人篡改）。
// 设计：每条 ACTION 在进入引擎前，服务端用一个对称密钥对
//   HMAC(playerId ‖ clientSeq ‖ action ‖ amount ‖ tableEpoch)
// 计算出 sig。当前帧方案仅做「预留 Hook + 结构定义」，签名校验默认关闭，
// 待前端配合下发 nonce/sig 字段后开启。开启后仍保留「未带 sig 则降级放行已认证连接」
// 的兼容策略，避免一次性破坏现有联调。

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface ActionSignaturePayload {
  playerId: string;
  clientSeq: number;
  action: string;
  amount: number;
  tableEpoch: string; // 服务端每局变化的不可预测盐（hex），防止跨局重放
}

export const ACTION_HOOK_ENABLED = process.env.ACTION_SIG_HOOK === '1';

/** 每局开局由引擎调用，生成新的不可预测 epoch（用于签名 salt，防跨局重放） */
export function newTableEpoch(): string {
  return randomBytes(16).toString('hex');
}

function signingKey(): Buffer {
  // 生产应来自 KMS/Env；开发期用固定派生值避免每次启动不一致导致 sig 校验全失败。
  return Buffer.from(process.env.ACTION_SIG_KEY ?? 'poker-dev-action-sig-key', 'utf8');
}

export function signAction(p: ActionSignaturePayload, epoch: string): string {
  const raw = `${p.playerId}|${p.clientSeq}|${p.action}|${p.amount}|${epoch}`;
  return createHmac('sha256', signingKey()).update(raw).digest('hex');
}

/**
 * 校验前端回传的 ACTION 签名。返回 true 表示通过/可放行。
 * 兼容态：Hook 未开启，或客户端未携带 sig（旧协议），均放行（仅已认证连接会被调用到）。
 */
export function verifyActionSignature(
  p: ActionSignaturePayload,
  epoch: string,
  providedSig: string | undefined,
): boolean {
  // A supplied signature is always authoritative: accepting a malformed value
  // merely because rollout enforcement is off would make tampering invisible.
  // The feature flag only controls whether legacy clients may omit the field.
  if (!providedSig) return !ACTION_HOOK_ENABLED;
  const expected = signAction(p, epoch);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(providedSig, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * 生成一条带 sig 的 ACTION 客户端协议样例（供前端接入参考，服务端不消费）。
 * 仅作 Hook 的「能力演示」，不参与运行链路。
 */
export function demoClientActionWithSig(p: ActionSignaturePayload, epoch: string) {
  return { ...p, sig: signAction(p, epoch) };
}
