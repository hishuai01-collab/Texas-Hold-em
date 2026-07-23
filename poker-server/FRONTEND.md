# Frontend Integration Guide

## Bootstrap Sequence

### Step 0: Auth Login
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "userId": "optional-existing-id",
  "name": "Alice"
}
```
返回：
```json
{
  "token": "<access-token>",
  "user": {
    "userId": "...",
    "name": "Alice",
    "issuedAt": "..."
  }
}
```
- 前端应把 `token` 存到 `localStorage`
- 后续请求放在 `Authorization: Bearer <token>` 或 `X-Access-Token` header

### Step 1: REST Bootstrap
```http
GET /healthz
Authorization: Bearer <token>
```
返回： `{ status: 'ok', timestamp: string }`

**API base URL**: `http://${WS_HOST.split(':')[0]}:8081`

### Step 2: WebSocket Connection
```
ws://${WS_HOST}/ws?tableId=${encodeURIComponent(tableId)}
```
注意：前端必须传同一个 `tableId`，否则引擎按桌隔离，无法互通。

### Step 3: WS Handshake
1. Server sends nothing on open.
2. Send `JOIN`：
```ts
{
  type: 'JOIN',
  name: string,
  clientSeed: string,
  clientSeq: number   // 严格单调递增，需每客户端维护
}
```
3. Server replies `JOINED` + `reconnectToken` + 初始 `seats`。
   - 把 `reconnectToken` 持久化到 `localStorage`，掉线后用于 `RECONNECT`。

### Step 4: Reconnect
```ts
{
  type: 'RECONNECT',
  playerId: string,
  reconnectToken: string,  // Step 3 拿到的一次性令牌
  lastSeq: number,         // 客户端已处理的最高事件 seq（-1 首轮）
  clientSeq: number
}
```
Server replies `RECONNECTED` + 补发 `events`（`EVENT_REPLAY`）。

### Step 5: Game Loop Actions
```ts
// Start hand
{ type: 'START', clientSeq: number }

// Action
{ type: 'ACTION', action: 'FOLD' | 'CHECK' | 'CALL' | 'RAISE' | 'ALL_IN', amount?: number, clientSeq: number }

// Leave
{ type: 'LEAVE', clientSeq: number }
```

## Message Protocol（共享 TypeScript 类型）

**文件**：`poker-server/src/shared/protocol.ts`

### Client → Server
```ts
type ClientMsg =
  | { type: 'JOIN', name: string, clientSeed: string, clientSeq: number }
  | { type: 'LEAVE', clientSeq: number }
  | { type: 'START', clientSeq: number }
  | { type: 'ACTION', action: 'FOLD' | 'CHECK' | 'CALL' | 'RAISE' | 'ALL_IN', amount?: number, clientSeq: number }
  | { type: 'RECONNECT', playerId: string, reconnectToken: string, lastSeq: number, clientSeq: number }
```

### Server → Client（广播/私有）
```ts
type ServerMsg =
  | { type: 'JOINED', seq: number, you: string, reconnectToken: string, seats: SeatView[] }
  | { type: 'RECONNECTED', seq: number, reconnectToken: string, seats: SeatView[] }
  | { type: 'PLAYER_JOINED', seq: number, seats: SeatView[] }
  | { type: 'PLAYER_LEFT', seq: number, playerId: string, reason: 'LEFT' | 'BUSTED', seats: SeatView[] }
  | { type: 'HAND_STARTED', seq: number, handId: string, deckRoot: string, button: number, sb: number, bb: number, seats: SeatView[] }
  | { type: 'PRIVATE_CARDS', seq: number, reveals: { pos: number, card: string, salt: string, proof: { hash: string, left: boolean }[] }[] }
  | { type: 'ACTION_APPLIED', seq: number, playerId: string, action: string, amount: number, seats: SeatView[], pot: number }
  | { type: 'ACTION_REQUIRED', seq: number, playerId: string, toCall: number, minRaiseTo: number, raiseAllowed: boolean }
  | { type: 'STREET', seq: number, street: 'FLOP' | 'TURN' | 'RIVER', reveals: { pos: number, card: string, salt: string, proof: { hash: string, left: boolean }[] }[] }
  | { type: 'REFUND', seq: number, playerId: string, amount: number }
  | { type: 'SHOWDOWN', seq: number, pots: { amount: number, eligible: string[] }[], reveals: Record<string, { pos: number, card: string, salt: string, proof: { hash: string, left: boolean }[] }[]>, winnings: Record<string, number>, seats: SeatView[] }
  | { type: 'HAND_ENDED', seq: number, auditRoot: string, eventCount: number }
  | { type: 'ERROR', code?: string, message: string, traceId: string }
  | { type: 'EVENT_REPLAY', events: ServerMsg[] }
```

### SeatView
```ts
interface SeatView {
  id: string;
  name: string;
  seatIndex: number;
  chips: number;
  contributed: number;
  betThisStreet: number;
  folded: boolean;
  allIn: boolean;
}
```

## HTTP API

**Base URL**: `http://${host}:8081`

### GET `/healthz`
返回 `{ status: 'ok', timestamp }`

### POST `/api/v1/auth/login`
登录/注册一体化接口。

**请求体**：
```json
{
  "userId": "optional-existing-id",
  "name": "Alice"
}
```
**响应**：
```json
{
  "token": "<access-token>",
  "user": {
    "userId": "...",
    "name": "Alice",
    "issuedAt": "..."
  }
}
```
- `userId` 可选：提供则查找现有用户，不存在则自动注册
- `name` 可选：注册时不提供则自动生成 `guest-xxxxxx`
- 返回 `token` 用于后续请求的 `Authorization: Bearer <token>` header

### GET `/api/v1/user/me`
返回当前登录用户信息。

**Headers**: `Authorization: Bearer <token>`

### GET `/api/v1/tables`
返回大厅列表（过滤掉私人桌）。

**Headers**: `Authorization: Bearer <token>`

### GET `/api/v1/tables/private/:capability`
查询私人桌邀请信息。

### POST `/api/v1/tables/create`
创建私人桌。

**请求体**：
```json
{
  "displayName": "My Table",
  "ttlSeconds?": 3600,
  "maxUses?": 6
}
```
**响应**：
```json
{
  "inviteUrl": "/t/<capability>",
  "displayName": "My Table",
  "createdAt": "...",
  "expiresAt": "...",
  "revokeCapability": "<token>"
}
```

## Security Notes（前端必读）
1. `clientSeq` 必须严格递增，否则服务器拒绝并可能拉黑 IP
2. `clientSeed` 在每手牌开局时由用户端生成，影响洗牌结果
3. 每次 `JOIN`/`RECONNECT` 后把 `reconnectToken` 持久化，不要重复使用
4. 断线后应在 `ACTION_TIMEOUT_MS` 内重连，否则自动 ALLOW 处理（系统不会永久等待）
5. `PRIVATE_CARDS`、`STREET` reveals 中的 `proof` 数组用于客户端做 Merkle 包含证明验证
6. 登录后 `Authorization: Bearer <token>` 是最推荐的鉴权方式；`token` 在 7 天内有效

## CORS
- HTTP API：`ALLOWED_ORIGINS` 环境变量控制，默认 `*`
- WebSocket：握手 origin 通过同一环境变量校验
