import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { privateTableService } from './PrivateTableService.js';
import { TableManager } from './TableManager.js';
import { UserService } from './UserService.js';
import { ErrorCode } from '../domain/errors/ErrorCode.js';
import { SupabaseAuthVerifier } from '../infrastructure/security/supabaseAuth.js';

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()) ?? ['*'];

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0] === '*' ? '*' : ALLOWED_ORIGINS[0]);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Private-Invite-Revoke');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

function jsonResponse(res: ServerResponse, status: number, data: unknown): void {
  setCorsHeaders(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

export interface HttpApiDeps {
  tableManager: TableManager;
  redisUrl?: string;
}

const AUTH_KEY = (token: string): string => `auth:token:${token}`;
const AUTH_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface AuthTokenPayload {
  userId: string;
  name: string;
  issuedAt: string;
}

/**
 * 轻量 HTTP API 服务，与 WebSocket 服务同进程运行。
 * 提供 REST 接口用于健康检查、认证、用户管理和牌桌操作。
 */
export class HttpApiServer {
  private server = createServer((req, res) => this.handleRequest(req, res));
  private readonly userService?: UserService;
  private readonly tokenRedis?: Redis;
  private readonly supabaseVerifier?: SupabaseAuthVerifier;

  constructor(private readonly deps: HttpApiDeps) {
    if (deps.redisUrl) {
      this.userService = new UserService({ redisUrl: deps.redisUrl });
      try {
        this.tokenRedis = new (require('ioredis').default)(deps.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 });
      } catch {
        this.tokenRedis = undefined;
      }
    }
    const jwtSecret = process.env.SUPABASE_JWT_SECRET
    if (jwtSecret) {
      this.supabaseVerifier = new SupabaseAuthVerifier(jwtSecret)
    }
  }

  listen(port: number, host?: string): void {
    this.server.listen(port, host ?? '127.0.0.1', () => {
      console.log(`[HTTP API] listening on http://${host ?? '127.0.0.1'}:${port}`);
    });
  }

  async close(): Promise<void> {
    await new Promise<void>(resolve => this.server.close(() => resolve()));
    if (this.tokenRedis && this.tokenRedis.status !== 'end') {
      await this.tokenRedis.quit();
    }
    await this.userService?.close();
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      setCorsHeaders(res);
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    try {
      // POST /api/v1/auth/login — 登录/注册并颁发访问令牌
      if (method === 'POST' && url === '/api/v1/auth/login') {
        await this.handleLogin(req, res);
        return;
      }

      // POST /api/v1/auth/supabase — 用 Supabase JWT 换取内部会话令牌
      if (method === 'POST' && url === '/api/v1/auth/supabase') {
        await this.handleSupabaseLogin(req, res);
        return;
      }

      // GET /healthz — 健康检查
      if (method === 'GET' && url === '/healthz') {
        jsonResponse(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
        return;
      }

      // POST /api/v1/users/register — 用户注册
      if (method === 'POST' && url === '/api/v1/users/register') {
        await this.handleRegister(req, res);
        return;
      }

      // GET /api/v1/user/me — 获取当前用户信息
      if (method === 'GET' && url.startsWith('/api/v1/user/me')) {
        await this.handleGetMe(req, res, url);
        return;
      }

      // POST /api/v1/tables/create — 创建私人牌桌
      if (method === 'POST' && url === '/api/v1/tables/create') {
        await this.handleCreateTable(req, res);
        return;
      }

      // GET /api/v1/tables — 获取大厅列表（过滤掉私人桌）
      if (method === 'GET' && url === '/api/v1/tables') {
        await this.handleListTables(res);
        return;
      }

      // GET /api/v1/tables/private/:capability — capability 解析后的最小桌面元数据。
      const privateMatch = url.match(/^\/api\/v1\/tables\/private\/([A-Za-z0-9_-]{43,128})$/);
      if (method === 'GET' && privateMatch) {
        await this.handleGetPrivateTable(privateMatch[1], res);
        return;
      }
      if (method === 'DELETE' && privateMatch) {
        this.handleRevokePrivateTable(privateMatch[1], req, res);
        return;
      }

      jsonResponse(res, 404, { error: ErrorCode.TABLE_NOT_FOUND, message: '接口不存在', traceId: randomUUID() });
    } catch (error) {
      console.error('[HTTP API] error', error);
      jsonResponse(res, 500, { error: ErrorCode.INTERNAL_ERROR, message: '服务器内部错误', traceId: randomUUID() });
    }
  }

  private async handleCreateTable(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: unknown;
    try {
      body = await parseBody(req);
    } catch {
      jsonResponse(res, 400, { error: ErrorCode.INVALID_JSON, message: '请求体必须是合法的 JSON', traceId: randomUUID() });
      return;
    }

    const { displayName, ttlSeconds, maxUses } = body as Record<string, unknown>;
    if (ttlSeconds !== undefined && (typeof ttlSeconds !== 'number' || !Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 604_800)) {
      jsonResponse(res, 400, { error: ErrorCode.INVALID_JSON, message: 'ttlSeconds 必须在 60 到 604800 之间', traceId: randomUUID() });
      return;
    }
    if (maxUses !== undefined && (typeof maxUses !== 'number' || !Number.isInteger(maxUses) || maxUses < 1 || maxUses > 6)) {
      jsonResponse(res, 400, { error: ErrorCode.INVALID_JSON, message: 'maxUses 必须在 1 到 6 之间', traceId: randomUUID() });
      return;
    }
    // Private IDs are server-generated. A client must never choose a routable private table ID.
    const tableId = `private-${randomUUID().replaceAll('-', '')}`;

    // 预热创建桌子（如果尚未存在）
    try {
      await this.deps.tableManager.getOrCreate(tableId);
    } catch (error) {
      console.error(`[HTTP API] failed to create private table`, error);
      jsonResponse(res, 500, { error: ErrorCode.TABLE_UNAVAILABLE, message: '牌桌创建失败', traceId: randomUUID() });
      return;
    }

    const invite = privateTableService.create(tableId, {
      displayName: typeof displayName === 'string' ? displayName : undefined,
      ttlMs: typeof ttlSeconds === 'number' ? ttlSeconds * 1_000 : undefined,
      maxUses: typeof maxUses === 'number' ? maxUses : undefined,
    });

    console.info(JSON.stringify({
      type: 'PRIVATE_TABLE_CREATED',
      tableId: invite.tableId,
      displayName: invite.displayName,
      expiresAt: invite.expiresAt,
      at: new Date().toISOString(),
    }));

    jsonResponse(res, 201, {
      inviteUrl: `/t/${invite.capability}`,
      displayName: invite.displayName,
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt,
      purpose: invite.purpose,
      version: invite.version,
      maxUses: invite.maxUses,
      revokeCapability: invite.revokeCapability,
    });
  }

  private async handleListTables(res: ServerResponse): Promise<void> {
    const tables: Array<{
      id: string;
      smallBlind: number;
      bigBlind: number;
      players: number;
      maxPlayers: number;
      status: 'OPEN' | 'FULL' | 'RUNNING';
    }> = [];

    // 遍历 TableManager 中所有活跃桌子，过滤掉私人桌
    for (const [tableId, session] of this.deps.tableManager.entries()) {
      // 跳过私人桌
      if (privateTableService.isPrivate(tableId)) continue;

      const seatCount = session.engine.seats.length;
      const maxPlayers = 6; // 固定最大人数
      const handInProgress = session.engine.handInProgress;

      let status: 'OPEN' | 'FULL' | 'RUNNING';
      if (seatCount >= maxPlayers) {
        status = 'FULL';
      } else if (handInProgress) {
        status = 'RUNNING';
      } else {
        status = 'OPEN';
      }

      tables.push({
        id: tableId,
        smallBlind: 5,
        bigBlind: 10,
        players: seatCount,
        maxPlayers,
        status,
      });
    }

    jsonResponse(res, 200, { tables });
  }

  private async handleGetPrivateTable(capability: string, res: ServerResponse): Promise<void> {
    const result = privateTableService.resolve(capability);
    if (!result.ok) {
      jsonResponse(res, 404, { error: ErrorCode.TABLE_NOT_FOUND, message: '私人牌桌不存在或已过期', traceId: randomUUID() });
      return;
    }

    jsonResponse(res, 200, {
      tableId: result.invite.tableId,
      displayName: result.invite.displayName,
      expiresAt: result.invite.expiresAt,
      purpose: result.invite.purpose,
      version: result.invite.version,
      remainingUses: result.invite.remainingUses,
    });
  }

  private handleRevokePrivateTable(capability: string, req: IncomingMessage, res: ServerResponse): void {
    const rawToken = req.headers['x-private-invite-revoke'];
    const revokeCapability = typeof rawToken === 'string' ? rawToken : null;
    if (!privateTableService.revoke(capability, revokeCapability)) {
      // Keep the response indistinguishable for unknown, already-revoked, and unauthorized invites.
      jsonResponse(res, 404, { error: ErrorCode.TABLE_NOT_FOUND, message: '私人牌桌不存在或已过期', traceId: randomUUID() });
      return;
    }
    jsonResponse(res, 200, { revoked: true });
  }

  private async handleRegister(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.userService) {
      jsonResponse(res, 501, { error: ErrorCode.REDIS_UNAVAILABLE, message: '用户服务未配置', traceId: randomUUID() });
      return;
    }
    let body: unknown;
    try {
      body = await parseBody(req);
    } catch {
      jsonResponse(res, 400, { error: ErrorCode.INVALID_JSON, message: '请求体必须是合法的 JSON', traceId: randomUUID() });
      return;
    }
    const { name, userId } = body as Record<string, unknown>;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      jsonResponse(res, 400, { error: ErrorCode.MISSING_FIELD, message: 'name 是必填字段', traceId: randomUUID() });
      return;
    }
    try {
      const user = await this.userService.register(name, typeof userId === 'string' ? userId : undefined);
      jsonResponse(res, 201, { id: user.id, name: user.name, balance: user.balance, createdAt: user.createdAt });
    } catch (error) {
      console.error('[HTTP API] register failed', error);
      jsonResponse(res, 500, { error: ErrorCode.INTERNAL_ERROR, message: '注册失败', traceId: randomUUID() });
    }
  }

  private async handleGetMe(req: IncomingMessage, res: ServerResponse, rawUrl: string): Promise<void> {
    let userId: string | undefined;
    if (req.headers['x-user-id'] && typeof req.headers['x-user-id'] === 'string') {
      userId = req.headers['x-user-id'];
    } else {
      let token: string | undefined;
      const authHeader = req.headers['authorization'];
      if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      } else {
        token = req.headers['x-access-token'] as string | undefined;
      }
      if (token && this.tokenRedis) {
        const raw = await this.tokenRedis.get(AUTH_KEY(token));
        if (raw) {
          try {
            const payload = JSON.parse(raw) as AuthTokenPayload;
            userId = payload.userId;
          } catch {
            // ignore invalid payload
          }
        }
      }
      if (!userId) {
        try {
          const parsed = new URL(rawUrl, 'http://internal');
          userId = parsed.searchParams.get('userId') ?? undefined;
        } catch {
          // ignore parse errors
        }
      }
    }
    if (!userId) {
      jsonResponse(res, 400, { error: ErrorCode.MISSING_FIELD, message: '缺少 userId', traceId: randomUUID() });
      return;
    }
    if (!this.userService) {
      jsonResponse(res, 501, { error: ErrorCode.REDIS_UNAVAILABLE, message: '用户服务未配置', traceId: randomUUID() });
      return;
    }
    const user = await this.userService.getMe(userId);
    if (!user) {
      jsonResponse(res, 404, { error: ErrorCode.USER_NOT_FOUND, message: '用户不存在', traceId: randomUUID() });
      return;
    }
    jsonResponse(res, 200, { id: user.id, name: user.name, balance: user.balance, createdAt: user.createdAt });
  }

  private async handleSupabaseLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.supabaseVerifier) {
      jsonResponse(res, 501, { error: ErrorCode.REDIS_UNAVAILABLE, message: 'Supabase 认证服务未配置', traceId: randomUUID() });
      return;
    }
    let body: unknown;
    try {
      body = await parseBody(req);
    } catch {
      jsonResponse(res, 400, { error: ErrorCode.INVALID_JSON, message: '请求体必须是合法的 JSON', traceId: randomUUID() });
      return;
    }
    const { access_token } = body as Record<string, unknown>;
    const token = typeof access_token === 'string' && access_token.trim().length > 0 ? access_token.trim() : undefined;
    if (!token) {
      jsonResponse(res, 400, { error: ErrorCode.MISSING_FIELD, message: '缺少 access_token', traceId: randomUUID() });
      return;
    }
    let identity;
    try {
      const verified = this.supabaseVerifier.verify(token);
      identity = this.supabaseVerifier.extractIdentity(verified);
    } catch (error) {
      console.error('[HTTP API] supabase jwt verify failed', error);
      jsonResponse(res, 401, { error: ErrorCode.INVALID_JSON, message: 'Supabase 令牌无效或已过期', traceId: randomUUID() });
      return;
    }
    if (!this.userService) {
      jsonResponse(res, 501, { error: ErrorCode.REDIS_UNAVAILABLE, message: '用户服务未配置', traceId: randomUUID() });
      return;
    }
    try {
      let user = await this.userService.getMe(identity.userId);
      if (!user) {
        user = await this.userService.register(identity.name, identity.userId);
      }
      if (!this.tokenRedis) {
        jsonResponse(res, 200, { token: null, user: { id: user.id, name: user.name, balance: user.balance } });
        return;
      }
      const sessionToken = randomUUID() + randomUUID().replaceAll('-', '');
      const payload: AuthTokenPayload = {
        userId: user.id,
        name: user.name,
        issuedAt: new Date().toISOString(),
      };
      await this.tokenRedis.set(AUTH_KEY(sessionToken), JSON.stringify(payload), 'EX', AUTH_TTL_SECONDS);
      jsonResponse(res, 200, { token: sessionToken, user: payload });
    } catch (error) {
      console.error('[HTTP API] supabase login failed', error);
      jsonResponse(res, 500, { error: ErrorCode.INTERNAL_ERROR, message: '登录失败', traceId: randomUUID() });
    }
  }

  private async handleLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: unknown;
    try {
      body = await parseBody(req);
    } catch {
      jsonResponse(res, 400, { error: ErrorCode.INVALID_JSON, message: '请求体必须是合法的 JSON', traceId: randomUUID() });
      return;
    }
    const { name, userId } = body as Record<string, unknown>;
    if (!this.userService) {
      jsonResponse(res, 501, { error: ErrorCode.REDIS_UNAVAILABLE, message: '用户服务未配置', traceId: randomUUID() });
      return;
    }
    let resolvedUserId = typeof userId === 'string' && userId.trim().length > 0 ? userId.trim() : undefined;
    try {
      let user;
      if (resolvedUserId) {
        user = await this.userService.getMe(resolvedUserId);
        if (!user) {
          const userName = typeof name === 'string' && name.trim().length > 0 ? name.trim() : `user-${resolvedUserId.slice(0, 6)}`;
          user = await this.userService.register(userName, resolvedUserId);
        }
      } else {
        const userName = typeof name === 'string' && name.trim().length > 0 ? name.trim() : `guest-${randomUUID().slice(0, 6)}`;
        const created = await this.userService.register(userName);
        resolvedUserId = created.id;
        user = created;
      }
    } catch (error) {
      console.error('[HTTP API] login failed', error);
      jsonResponse(res, 500, { error: ErrorCode.INTERNAL_ERROR, message: '登录失败', traceId: randomUUID() });
      return;
    }
    if (!this.tokenRedis) {
      jsonResponse(res, 200, { token: null, user: { id: resolvedUserId } });
      return;
    }
    const token = randomUUID() + randomUUID().replaceAll('-', '');
    const payload: AuthTokenPayload = {
      userId: resolvedUserId,
      name: (await this.userService.getMe(resolvedUserId))?.name ?? '',
      issuedAt: new Date().toISOString(),
    };
    await this.tokenRedis.set(AUTH_KEY(token), JSON.stringify(payload), 'EX', AUTH_TTL_SECONDS);
    jsonResponse(res, 200, { token, user: payload });
  }
}
