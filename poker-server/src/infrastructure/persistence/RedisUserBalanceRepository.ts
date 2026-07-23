import Redis from 'ioredis';
import type { User } from '../../domain/model/User.js';

const keyFor = (userId: string): string => `user:${userId}`;

export class RedisUserBalanceRepository {
  private readonly redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 });
  }

  async create(userId: string, name: string, initialBalance = 1000): Promise<User> {
    await this.ensureConnected();
    const key = keyFor(userId);
    const existing = await this.redis.exists(key);
    if (existing) {
      const raw = await this.redis.hgetall(key);
      return {
        id: userId,
        name: raw.name ?? name,
        balance: Number(raw.balance ?? initialBalance),
        createdAt: raw.createdAt ?? new Date().toISOString(),
      };
    }
    const now = new Date().toISOString();
    await this.redis.hset(key, {
      name,
      balance: String(initialBalance),
      createdAt: now,
    });
    return { id: userId, name, balance: initialBalance, createdAt: now };
  }

  async get(userId: string): Promise<User | null> {
    await this.ensureConnected();
    const raw = await this.redis.hgetall(keyFor(userId));
    if (!raw || Object.keys(raw).length === 0) return null;
    return {
      id: userId,
      name: raw.name ?? '',
      balance: Number(raw.balance ?? 0),
      createdAt: raw.createdAt ?? '',
    };
  }

  async setBalance(userId: string, balance: number): Promise<User | null> {
    await this.ensureConnected();
    const key = keyFor(userId);
    const exists = await this.redis.exists(key);
    if (!exists) return null;
    await this.redis.hset(key, 'balance', String(Math.max(0, balance)));
    return this.get(userId);
  }

  async addBalance(userId: string, delta: number): Promise<User | null> {
    await this.ensureConnected();
    const key = keyFor(userId);
    const exists = await this.redis.exists(key);
    if (!exists) return null;
    const updated = await this.redis.hincrbyfloat(key, 'balance', delta);
    const balance = Math.max(0, Math.floor(Number(updated)));
    await this.redis.hset(key, 'balance', String(balance));
    return this.get(userId);
  }

  async close(): Promise<void> {
    if (this.redis.status !== 'end') await this.redis.quit();
  }

  private async ensureConnected(): Promise<void> {
    if (this.redis.status === 'wait') await this.redis.connect();
  }
}
