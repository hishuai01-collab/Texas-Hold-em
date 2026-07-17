import Redis from 'ioredis';

/**
 * 多桌注册表：记录「当前进程认为存活的桌子」，供进程重启后的预热加载与运维可观测使用。
 * 单 PM2 fork 实例部署下，真正的 TableSession 对象始终只活在本进程内存里——这里
 * 只是一份可在重启后查询「重启前有哪些桌子」的轻量索引，不承担跨实例路由职责。
 */
export interface TableRegistry {
  register(tableId: string): Promise<void>;
  deregister(tableId: string): Promise<void>;
  listActive(): Promise<string[]>;
  close(): Promise<void>;
}

const ACTIVE_SET_KEY = 'poker:tables:active';

export class RedisTableRegistry implements TableRegistry {
  private readonly redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 });
  }

  async register(tableId: string): Promise<void> {
    await this.ensureConnected();
    await this.redis.sadd(ACTIVE_SET_KEY, tableId);
  }

  async deregister(tableId: string): Promise<void> {
    await this.ensureConnected();
    await this.redis.srem(ACTIVE_SET_KEY, tableId);
  }

  async listActive(): Promise<string[]> {
    await this.ensureConnected();
    return this.redis.smembers(ACTIVE_SET_KEY);
  }

  async close(): Promise<void> {
    if (this.redis.status !== 'end') await this.redis.quit();
  }

  private async ensureConnected(): Promise<void> {
    if (this.redis.status === 'wait') await this.redis.connect();
  }
}

export class InMemoryTableRegistry implements TableRegistry {
  private readonly active = new Set<string>();

  async register(tableId: string): Promise<void> { this.active.add(tableId); }
  async deregister(tableId: string): Promise<void> { this.active.delete(tableId); }
  async listActive(): Promise<string[]> { return [...this.active]; }
  async close(): Promise<void> { this.active.clear(); }
}

export function createTableRegistry(): TableRegistry {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) return new RedisTableRegistry(redisUrl);
  if (process.env.NODE_ENV === 'production') {
    throw new Error('生产环境必须配置 REDIS_URL，拒绝以内存桌注册表启动');
  }
  console.warn('[registry] REDIS_URL 未配置，开发环境使用内存桌注册表；不支持重启后预热加载。');
  return new InMemoryTableRegistry();
}
