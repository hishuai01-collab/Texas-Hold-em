import { TableSession } from './TableSession.js';
import type { EventStore } from '../infrastructure/eventstore/EventStore.js';
import type { TableRegistry } from '../infrastructure/registry/TableRegistry.js';
import type { PokerMetrics } from '../infrastructure/observability/PrometheusMetrics.js';

export interface TableManagerOptions {
  eventStore: EventStore;
  registry: TableRegistry;
  metrics: PokerMetrics;
  /** 无 socket 且无进行中手牌，持续多久后回收（默认 10 分钟） */
  idleMs?: number;
  /** 回收巡检间隔（默认 60s） */
  reapIntervalMs?: number;
  actorOptions?: { jobTimeoutMs?: number; breakerThreshold?: number };
}

/**
 * 多桌路由与生命周期管理（Group A 收尾）。
 * 单 PM2 fork 实例内以 tableId 为键维护本地 Map<string, TableSession>；Redis 注册表
 * （TableRegistry）只作「重启后预热哪些桌」的索引，不参与实时路由——真正的运行时状态
 * 始终只活在本进程内存，符合「单实例、无跨进程分片」的部署现实（见 ecosystem.config.js）。
 */
export class TableManager {
  private readonly tables = new Map<string, TableSession>();
  /** In-flight hydrations, keyed by tableId. Without this, two connections racing to create
   *  the same brand-new table would each build their own TableSession/GameEngine — only one
   *  wins the `tables` map, and the other silently keeps mutating an orphaned engine forever. */
  private readonly hydrating = new Map<string, Promise<TableSession>>();
  private reaperTimer: NodeJS.Timeout | null = null;
  private readonly idleMs: number;
  private readonly reapIntervalMs: number;

  constructor(private readonly opts: TableManagerOptions) {
    this.idleMs = opts.idleMs ?? 10 * 60_000;
    this.reapIntervalMs = opts.reapIntervalMs ?? 60_000;
  }

  get size(): number {
    return this.tables.size;
  }

  get(tableId: string): TableSession | undefined {
    return this.tables.get(tableId);
  }

  /** 遍历所有活跃桌子（用于 HTTP API 列表展示）。 */
  entries(): IterableIterator<[string, TableSession]> {
    return this.tables.entries();
  }

  totalSockets(): number {
    let n = 0;
    for (const s of this.tables.values()) n += s.sockets.size;
    return n;
  }

  /**
   * 动态创建或复用：本地缓存命中直接返回；未命中则从 Redis 快照+事件流冷启动重建。
   * 并发的首次访问（同一 tableId 的多个连接同时到达）共享同一个 hydrate Promise，
   * 绝不会各自建出独立的 TableSession/GameEngine——那会导致其中一个连接的操作
   * 永远作用在一个从未被路由表接纳的孤儿引擎上（例如两个玩家各自"入座"了不同的桌子）。
   */
  async getOrCreate(tableId: string, opts: { seedBots?: number } = {}): Promise<TableSession> {
    const existing = this.tables.get(tableId);
    if (existing) {
      existing.touch();
      return existing;
    }

    let pending = this.hydrating.get(tableId);
    if (!pending) {
      pending = this.hydrate(tableId, opts.seedBots ?? 0).then(session => {
        this.tables.set(tableId, session);
        this.hydrating.delete(tableId);
        this.ensureReaperRunning();
        this.refreshOnlineTablesGauge();
        void this.opts.registry.register(tableId).catch(error => {
          console.error(`[TableManager] registry register failed for ${tableId} (non-fatal)`, error);
        });
        return session;
      }).catch(error => {
        this.hydrating.delete(tableId);
        throw error;
      });
      this.hydrating.set(tableId, pending);
    }

    const session = await pending;
    session.touch();
    return session;
  }

  private async hydrate(tableId: string, seedBots: number): Promise<TableSession> {
    const session = new TableSession({
      tableId,
      eventStore: this.opts.eventStore,
      metrics: this.opts.metrics,
      actorOptions: this.opts.actorOptions,
      onBreakerTrip: id => this.handleBreakerTrip(id),
    });

    const snapshot = await this.opts.eventStore.readSnapshot(tableId).catch(error => {
      console.error(`[TableManager] readSnapshot failed for ${tableId}; starting the table fresh`, error);
      return null;
    });

    if (snapshot) {
      const restored = session.engine.restore(snapshot.engine);
      if (!restored) {
        console.error(JSON.stringify({
          type: 'TABLE_SNAPSHOT_CORRUPT', tableId, at: new Date().toISOString(),
          note: '快照未通过完整性校验，拒绝在可能丢失牌局状态的情况下沿用；改以空桌重新开始',
        }));
      } else {
        session.armPendingActionAfterRestore();
        console.info(JSON.stringify({ type: 'TABLE_SNAPSHOT_RESTORED', tableId, savedAt: snapshot.savedAt }));
        const trailing = await this.opts.eventStore.readEventsAfter(tableId, snapshot.streamCursor).catch(() => []);
        if (trailing.length > 0) {
          // A hand had progressed past the last SETTLE checkpoint when the process died
          // (crash, not a graceful shutdown — a graceful shutdown always snapshots the
          // exact live state, leaving nothing trailing). That hand's private shuffle
          // entropy was never durably captured, so it cannot be safely resumed mid-play.
          // Restoring the last SETTLE snapshot IS the safe recovery: chips reflect the
          // consistent state from right before that interrupted hand ever touched them.
          console.warn(JSON.stringify({
            type: 'TABLE_RECOVERY_DISCARDED_TRAILING_EVENTS', tableId,
            discardedCount: trailing.length, at: new Date().toISOString(),
          }));
        }
      }
    } else if (seedBots > 0) {
      session.seedBots(seedBots);
    }

    return session;
  }

  /**
   * 熔断跳闸：最近几次持久化连续失败，内存状态可能已与 Redis 不一致（"tainted"）。
   * 立即从路由表摘除，让下一次访问触发全新 hydrate（从最近一次成功的快照重建）——
   * 绝不在此同步等待旧 TableActor 的队列 drain：本回调正是从那个 Job 失败处理内部
   * 同步触发的，等待会与 TableActor 自身的处理循环互相死锁。
   */
  private handleBreakerTrip(tableId: string): void {
    const session = this.tables.get(tableId);
    if (!session) return;
    this.tables.delete(tableId);
    session.timeoutManager.stop();
    console.error(JSON.stringify({ type: 'TABLE_BREAKER_TRIPPED', tableId, at: new Date().toISOString() }));
    void this.opts.registry.deregister(tableId).catch(() => undefined);
    this.refreshOnlineTablesGauge();
  }

  private ensureReaperRunning(): void {
    if (this.reaperTimer) return;
    this.reaperTimer = setInterval(() => { void this.reapIdle(); }, this.reapIntervalMs);
    this.reaperTimer.unref?.();
  }

  private async reapIdle(): Promise<void> {
    const idleIds = [...this.tables.entries()]
      .filter(([, session]) => session.isIdle(this.idleMs))
      .map(([id]) => id);
    for (const id of idleIds) {
      const session = this.tables.get(id);
      if (!session) continue;
      this.tables.delete(id);
      try {
        await session.close();
      } catch (error) {
        console.error(`[TableManager] close failed while reaping idle table ${id}`, error);
      }
      void this.opts.registry.deregister(id).catch(() => undefined);
      console.info(JSON.stringify({ type: 'TABLE_REAPED_IDLE', tableId: id, at: new Date().toISOString() }));
    }
    if (idleIds.length > 0) this.refreshOnlineTablesGauge();
  }

  /** 供外部（server.ts）在座位数可能变化的时刻主动刷新（JOIN/LEAVE/离桌清理）。 */
  refreshOnlineTablesGauge(): void {
    let seated = 0;
    for (const session of this.tables.values()) if (session.engine.seats.length > 0) seated += 1;
    this.opts.metrics.onlineTables.set(seated);
  }

  /** 优雅关闭：逐桌 drain 队列并落一次兜底快照，即使当前恰好卡在手牌中途也保留完整状态。 */
  async shutdownAll(): Promise<void> {
    if (this.reaperTimer) clearInterval(this.reaperTimer);
    for (const session of this.tables.values()) {
      session.timeoutManager.stop();
      await session.actor.drain();
      try {
        await session.persistSnapshotNow();
      } catch (error) {
        console.error(`[TableManager] final snapshot failed for ${session.tableId}`, error);
      }
    }
  }
}
