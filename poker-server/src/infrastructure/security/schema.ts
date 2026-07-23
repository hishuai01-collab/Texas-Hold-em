// 运行时协议强校验（设计文档 Group C/D：防篡改、防非法载荷）。
// 所有进出站消息都经 Zod Schema 做 IO 运行时校验，非法载荷直接丢弃并计入违规。
// 注：ClientMsg 在 WebSocketGateway 已做字段级白名单校验，这里用 Zod 作为第二道独立防线
// （schema 与手动校验解耦，避免单点逻辑漂移），ServerMsg 主要用于出站自检与服务端单测。
import { z } from 'zod';

const cardSchema = z.string().regex(/^[2-9TJQKA][shdc]$/, 'invalid card');

const cardRevealSchema = z.object({
  pos: z.number().int().nonnegative(),
  card: cardSchema,
  salt: z.string().regex(/^[0-9a-f]+$/, 'invalid salt hex'),
  proof: z.array(z.object({
    hash: z.string().regex(/^[0-9a-f]+$/, 'invalid hash hex'),
    left: z.boolean(),
  })).min(0),
});

const seatViewSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(24),
  seatIndex: z.number().int().nonnegative().max(9),
  chips: z.number().int().nonnegative(),
  contributed: z.number().int().nonnegative(),
  betThisStreet: z.number().int().nonnegative(),
  folded: z.boolean(),
  allIn: z.boolean(),
});

const actionName = z.enum(['FOLD', 'CHECK', 'CALL', 'RAISE', 'ALL_IN']);

// ---------- 客户端 → 服务端 ----------
export const clientMsgSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('JOIN'),
    name: z.string().min(1).max(24),
    clientSeed: z.string().min(1).max(256),
    clientSeq: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('LEAVE'),
    clientSeq: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('START'),
    clientSeq: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('ACTION'),
    action: actionName,
    amount: z.number().int().nonnegative().max(1_000_000).optional(),
    clientSeq: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('RECONNECT'),
    playerId: z.string().min(1).max(128),
    reconnectToken: z.string().min(1).max(256),
    lastSeq: z.number().int().gte(-1),
    clientSeq: z.number().int().nonnegative(),
  }),
]);

export type ClientMsgParsed = z.infer<typeof clientMsgSchema>;

// ---------- 服务端 → 客户端（领域事件） ----------
export const serverMsgSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('JOINED'),
    seq: z.number().int().nonnegative(),
    you: z.string(),
    reconnectToken: z.string(),
    seats: z.array(seatViewSchema),
  }),
  z.object({
    type: z.literal('RECONNECTED'),
    seq: z.number().int().nonnegative(),
    reconnectToken: z.string(),
    seats: z.array(seatViewSchema),
  }),
  z.object({
    type: z.literal('PLAYER_JOINED'),
    seq: z.number().int().nonnegative(),
    seats: z.array(seatViewSchema),
  }),
  z.object({
    type: z.literal('PLAYER_LEFT'),
    seq: z.number().int().nonnegative(),
    playerId: z.string(),
    reason: z.enum(['LEFT', 'BUSTED']),
    seats: z.array(seatViewSchema),
  }),
  z.object({
    type: z.literal('HAND_STARTED'),
    seq: z.number().int().nonnegative(),
    handId: z.string(),
    deckRoot: z.string(),
    button: z.number().int().nonnegative(),
    sb: z.number().int().nonnegative(),
    bb: z.number().int().nonnegative(),
    seats: z.array(seatViewSchema),
  }),
  z.object({
    type: z.literal('PRIVATE_CARDS'),
    seq: z.number().int().nonnegative(),
    reveals: z.array(cardRevealSchema),
  }),
  z.object({
    type: z.literal('ACTION_APPLIED'),
    seq: z.number().int().nonnegative(),
    playerId: z.string(),
    action: z.string(),
    amount: z.number().nonnegative(),
    seats: z.array(seatViewSchema),
    pot: z.number().nonnegative(),
  }),
  z.object({
    type: z.literal('ACTION_REQUIRED'),
    seq: z.number().int().nonnegative(),
    playerId: z.string(),
    toCall: z.number().nonnegative(),
    minRaiseTo: z.number().nonnegative(),
    raiseAllowed: z.boolean(),
  }),
  z.object({
    type: z.literal('STREET'),
    seq: z.number().int().nonnegative(),
    street: z.enum(['FLOP', 'TURN', 'RIVER']),
    reveals: z.array(cardRevealSchema),
  }),
  z.object({
    type: z.literal('REFUND'),
    seq: z.number().int().nonnegative(),
    playerId: z.string(),
    amount: z.number().nonnegative(),
  }),
  z.object({
    type: z.literal('SHOWDOWN'),
    seq: z.number().int().nonnegative(),
    pots: z.array(z.object({ amount: z.number().nonnegative(), eligible: z.array(z.string()) })),
    reveals: z.record(z.string(), z.array(cardRevealSchema)),
    winnings: z.record(z.string(), z.number().nonnegative()),
    seats: z.array(seatViewSchema),
  }),
  z.object({
    type: z.literal('HAND_ENDED'),
    seq: z.number().int().nonnegative(),
    auditRoot: z.string(),
    eventCount: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('ERROR'),
    code: z.string().optional(),
    message: z.string(),
    traceId: z.string(),
  }),
  z.object({
    type: z.literal('EVENT_REPLAY'),
    events: z.array(z.any()),
  }),
]);

/**
 * 出站自检：ServerMsg 出站前做一次 schema 校验，能在开发期发现协议回归；
 * 生产环境若追求零开销可关（SKIP_OUTBOUND_SCHEMA=1），但保留能力。
 * 返回 [ok, error]。
 */
export function validateOutbound(msg: unknown): [boolean, string | null] {
  if (process.env.SKIP_OUTBOUND_SCHEMA === '1') return [true, null];
  const r = serverMsgSchema.safeParse(msg);
  return r.success ? [true, null] : [false, r.error.issues[0]?.message ?? 'unknown'];
}
