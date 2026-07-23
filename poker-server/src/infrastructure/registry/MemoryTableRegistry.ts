import type { TableRegistry } from "./TableRegistry.js";

/** 纯内存桌注册表：Set 存储活跃桌 ID。 */
export class MemoryTableRegistry implements TableRegistry {
  private readonly active = new Set<string>();

  async register(tableId: string): Promise<void> {
    this.active.add(tableId);
  }
  async deregister(tableId: string): Promise<void> {
    this.active.delete(tableId);
  }
  async listActive(): Promise<string[]> {
    return [...this.active];
  }
  async close(): Promise<void> {
    this.active.clear();
  }
}
