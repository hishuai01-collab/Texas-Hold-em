import type {
  EventStore,
  StoredTableEvent,
  TableSnapshotRecord,
} from "./EventStore.js";

/** 纯内存事件溯源：Map 存储事件流与快照，无需 Redis。 */
export class MemoryEventStore implements EventStore {
  private readonly streams = new Map<string, StoredTableEvent[]>();
  private readonly snapshots = new Map<string, TableSnapshotRecord>();
  private readonly counters = new Map<string, number>();

  async appendEvents(
    tableId: string,
    events: { msg: Record<string, unknown>; privateTo?: string }[],
  ): Promise<string> {
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

  async readEventsAfter(
    tableId: string,
    afterId: string,
  ): Promise<StoredTableEvent[]> {
    const stream = this.streams.get(tableId) ?? [];
    const after = Number(afterId);
    return stream.filter((e) => Number(e.id) > after);
  }

  async writeSnapshot(
    tableId: string,
    record: TableSnapshotRecord,
  ): Promise<void> {
    this.snapshots.set(tableId, record);
  }

  async readSnapshot(tableId: string): Promise<TableSnapshotRecord | null> {
    return this.snapshots.get(tableId) ?? null;
  }

  async trimBefore(tableId: string, id: string): Promise<void> {
    const stream = this.streams.get(tableId);
    if (!stream) return;
    const cutoff = Number(id);
    this.streams.set(
      tableId,
      stream.filter((e) => Number(e.id) > cutoff),
    );
  }

  async close(): Promise<void> {
    this.streams.clear();
    this.snapshots.clear();
    this.counters.clear();
  }
}
