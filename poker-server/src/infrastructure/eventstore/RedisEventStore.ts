import Redis from 'ioredis';
import type { EventStore, StoredTableEvent, TableSnapshotRecord } from './EventStore.js';
import { InMemoryEventStore } from './EventStore.js';

const streamKey = (tableId: string): string => `poker:stream:${tableId}`;
const snapshotKey = (tableId: string): string => `poker:snapshot:${tableId}`;

/** The immediate successor of a Redis Stream ID (`<ms>-<seq>`), used to make XTRIM MINID exclusive. */
function nextStreamId(id: string): string {
  const [ms, seq] = id.split('-');
  if (!ms || seq === undefined) return id; // not a real stream id (e.g. '0'): nothing to trim past
  return `${ms}-${BigInt(seq) + 1n}`;
}

/** Redis Stream 事件溯源 + 快照存取。连接策略与 RedisReconnectTokenStore 一致（lazyConnect + 有限重试）。 */
export class RedisEventStore implements EventStore {
  private readonly redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 });
  }

  async appendEvents(tableId: string, events: { msg: Record<string, unknown>; privateTo?: string }[]): Promise<string> {
    await this.ensureConnected();
    if (events.length === 0) {
      // No new events: report the current tail so callers can still compute a valid cursor.
      const last = await this.redis.xrevrange(streamKey(tableId), '+', '-', 'COUNT', 1);
      return last[0]?.[0] ?? '0';
    }
    const key = streamKey(tableId);
    let lastId = '0';
    // XADD is per-entry; entries within one Job must land in the exact emitted order.
    for (const e of events) {
      const id = await this.redis.xadd(key, '*', 'data', JSON.stringify({ msg: e.msg, privateTo: e.privateTo ?? null }));
      if (!id) throw new Error(`XADD returned no id for ${key}`);
      lastId = id;
    }
    return lastId;
  }

  async readEventsAfter(tableId: string, afterId: string): Promise<StoredTableEvent[]> {
    await this.ensureConnected();
    const start = afterId === '0' ? '-' : `(${afterId}`;
    const entries = await this.redis.xrange(streamKey(tableId), start, '+');
    return entries.map(([id, fields]) => {
      const raw = fields[1] ?? '{}'; // fields = ['data', '<json>']
      const parsed = JSON.parse(raw) as { msg: Record<string, unknown>; privateTo: string | null };
      return { id, msg: parsed.msg, privateTo: parsed.privateTo ?? undefined };
    });
  }

  async writeSnapshot(tableId: string, record: TableSnapshotRecord): Promise<void> {
    await this.ensureConnected();
    await this.redis.set(snapshotKey(tableId), JSON.stringify(record));
  }

  async readSnapshot(tableId: string): Promise<TableSnapshotRecord | null> {
    await this.ensureConnected();
    const raw = await this.redis.get(snapshotKey(tableId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as TableSnapshotRecord;
    } catch {
      return null;
    }
  }

  async trimBefore(tableId: string, id: string): Promise<void> {
    await this.ensureConnected();
    // XTRIM MINID keeps entries with id >= threshold (inclusive), but readEventsAfter's
    // contract is exclusive (id > cutoff) to match InMemoryEventStore exactly. Trimming at
    // the cutoff's immediate successor keeps both implementations behaviorally identical.
    await this.redis.xtrim(streamKey(tableId), 'MINID', nextStreamId(id));
  }

  async close(): Promise<void> {
    if (this.redis.status !== 'end') await this.redis.quit();
  }

  private async ensureConnected(): Promise<void> {
    if (this.redis.status === 'wait') await this.redis.connect();
  }
}

export function createEventStore(): EventStore {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) return new RedisEventStore(redisUrl);
  if (process.env.NODE_ENV === 'production') {
    throw new Error('生产环境必须配置 REDIS_URL，拒绝以内存事件流启动（重启即丢失牌局）');
  }
  console.warn('[eventstore] REDIS_URL 未配置，开发环境使用内存事件流；不支持跨进程或重启恢复。');
  return new InMemoryEventStore();
}
