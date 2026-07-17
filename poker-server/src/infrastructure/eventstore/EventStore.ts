// Event Sourcing 持久层（Group B）：牌桌的不可变事件流 + 手牌结束（SETTLE）快照。
//
// 设计边界（刻意，非疏漏）：
// - Stream 只记录「已经下发给客户端的公开事件」（HAND_STARTED/ACTION_APPLIED/STREET/...），
//   不包含 shuffleKey/deck 等服务端机密——这些只存在于快照里（与旧版文件快照
//   同样的机密边界，见 GameEngine.snapshot() 注释）。
// - 快照只在每手牌 SETTLE（HAND_ENDED）时落盘一次，代表一个「筹码守恒、无进行中手牌」的
//   一致检查点。崩溃恢复时只需回滚到最近一次快照——被打断的那一手牌从未持久化其私有熵，
//   本就无法安全续玩，回滚等价于安全丢弃该手牌（不产生筹码增减）。
// - Stream 中快照点之后的残留事件仅用于运维可观测性（审计"崩溃前发生了什么"），不参与
//   状态重建的正确性判定。

export interface StoredTableEvent {
  /** Redis Stream 条目 ID（或内存实现的等价游标），单调递增，可用作 readEventsAfter 的游标 */
  id: string;
  /** 与 GameEngine.dispatch() 广播/私发给客户端的同一份负载（不含机密） */
  msg: Record<string, unknown>;
  /** 私有事件（如 PRIVATE_CARDS）的目标 playerId；广播事件为 undefined */
  privateTo?: string;
}

export interface TableSnapshotRecord {
  version: 1;
  tableId: string;
  savedAt: string;
  /** 落盘时刻对应的 Stream 游标；恢复时用于判断快照之后是否有残留（被打断的）事件 */
  streamCursor: string;
  /** GameEngine.snapshot() 的不透明负载，交由 GameEngine.restore() 解读 */
  engine: unknown;
}

export interface EventStore {
  /** 追加一批公开事件（同一 Job 产生的事件按顺序整体写入），返回写入后的最新游标 */
  appendEvents(tableId: string, events: { msg: Record<string, unknown>; privateTo?: string }[]): Promise<string>;
  /** 读取游标之后的全部事件（升序），afterId 为 '0' 表示从头读取 */
  readEventsAfter(tableId: string, afterId: string): Promise<StoredTableEvent[]>;
  writeSnapshot(tableId: string, record: TableSnapshotRecord): Promise<void>;
  readSnapshot(tableId: string): Promise<TableSnapshotRecord | null>;
  /** 快照落盘后裁剪掉快照游标之前的事件，防止 Stream 无界增长 */
  trimBefore(tableId: string, id: string): Promise<void>;
  close(): Promise<void>;
}

/** 开发/测试用内存实现：与 RedisEventStore 行为等价，仅持久层不同（无需真实 Redis 即可验证全部业务逻辑）。 */
export class InMemoryEventStore implements EventStore {
  private readonly streams = new Map<string, StoredTableEvent[]>();
  private readonly snapshots = new Map<string, TableSnapshotRecord>();
  private readonly counters = new Map<string, number>();

  async appendEvents(tableId: string, events: { msg: Record<string, unknown>; privateTo?: string }[]): Promise<string> {
    const stream = this.streams.get(tableId) ?? [];
    let cursor = this.counters.get(tableId) ?? 0;
    for (const e of events) {
      cursor += 1;
      stream.push({ id: String(cursor), msg: e.msg, privateTo: e.privateTo });
    }
    this.streams.set(tableId, stream);
    this.counters.set(tableId, cursor);
    return String(cursor);
  }

  async readEventsAfter(tableId: string, afterId: string): Promise<StoredTableEvent[]> {
    const stream = this.streams.get(tableId) ?? [];
    const after = Number(afterId);
    return stream.filter(e => Number(e.id) > after);
  }

  async writeSnapshot(tableId: string, record: TableSnapshotRecord): Promise<void> {
    this.snapshots.set(tableId, record);
  }

  async readSnapshot(tableId: string): Promise<TableSnapshotRecord | null> {
    return this.snapshots.get(tableId) ?? null;
  }

  async trimBefore(tableId: string, id: string): Promise<void> {
    const stream = this.streams.get(tableId);
    if (!stream) return;
    const cutoff = Number(id);
    this.streams.set(tableId, stream.filter(e => Number(e.id) > cutoff));
  }

  async close(): Promise<void> {
    this.streams.clear();
    this.snapshots.clear();
    this.counters.clear();
  }
}
