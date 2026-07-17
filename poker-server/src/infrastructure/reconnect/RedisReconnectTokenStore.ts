import { randomBytes } from 'node:crypto';
import Redis from 'ioredis';

export interface ReconnectTokenRecord {
  playerId: string;
  tableId: string;
}

export interface ReconnectTokenStore {
  issue(record: ReconnectTokenRecord): Promise<string>;
  /** Atomically read and invalidate a one-time token. */
  consume(token: string): Promise<ReconnectTokenRecord | null>;
  close(): Promise<void>;
}

const TOKEN_TTL_SECONDS = 300;
const keyFor = (token: string): string => `poker:reconnect:${token}`;

export class RedisReconnectTokenStore implements ReconnectTokenStore {
  private readonly redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 });
  }

  async issue(record: ReconnectTokenRecord): Promise<string> {
    await this.ensureConnected();
    const token = randomBytes(32).toString('base64url');
    await this.redis.set(keyFor(token), JSON.stringify(record), 'EX', TOKEN_TTL_SECONDS, 'NX');
    return token;
  }

  async consume(token: string): Promise<ReconnectTokenRecord | null> {
    await this.ensureConnected();
    // GETDEL is not present on every supported Redis version, so use a tiny Lua
    // transaction: concurrent reconnect attempts can never both authenticate.
    const raw = await this.redis.eval(
      "local value=redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value",
      1,
      keyFor(token),
    ) as string | null;
    if (!raw) return null;
    try {
      const record = JSON.parse(raw) as ReconnectTokenRecord;
      if (!record.playerId || !record.tableId) return null;
      return record;
    } catch {
      return null;
    }
  }

  async close(): Promise<void> {
    if (this.redis.status !== 'end') await this.redis.quit();
  }

  private async ensureConnected(): Promise<void> {
    if (this.redis.status === 'wait') await this.redis.connect();
  }
}

/** Development-only fallback: production must provide REDIS_URL. */
export class InMemoryReconnectTokenStore implements ReconnectTokenStore {
  private readonly records = new Map<string, { record: ReconnectTokenRecord; expiresAt: number }>();

  async issue(record: ReconnectTokenRecord): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    this.records.set(token, { record, expiresAt: Date.now() + TOKEN_TTL_SECONDS * 1_000 });
    return token;
  }

  async consume(token: string): Promise<ReconnectTokenRecord | null> {
    const entry = this.records.get(token);
    this.records.delete(token);
    return entry && entry.expiresAt > Date.now() ? entry.record : null;
  }

  async close(): Promise<void> { this.records.clear(); }
}

export function createReconnectTokenStore(): ReconnectTokenStore {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) return new RedisReconnectTokenStore(redisUrl);
  if (process.env.NODE_ENV === 'production') {
    throw new Error('生产环境必须配置 REDIS_URL，拒绝以进程内 reconnectToken 启动');
  }
  console.warn('[reconnect] REDIS_URL 未配置，开发环境使用内存令牌；不支持跨实例或重启恢复。');
  return new InMemoryReconnectTokenStore();
}
