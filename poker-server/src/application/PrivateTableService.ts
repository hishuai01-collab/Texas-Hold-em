export interface PrivateTableMeta {
  slug: string;
  tableId: string;
  displayName: string;
  createdAt: string;
  createdBy?: string;
}

/**
 * 私人牌桌服务：管理专属邀请码（slug）与 tableId 的映射。
 * 当前使用内存存储，生产环境可替换为 Redis 持久化。
 */
export class PrivateTableService {
  /** slug → meta */
  private readonly slugIndex = new Map<string, PrivateTableMeta>();
  /** tableId → slug (反向索引，用于去重) */
  private readonly tableIndex = new Map<string, string>();
  private slugCounter = 0;

  /**
   * 生成唯一 slug（格式 vip-001, vip-002, ...）。
   * 若 tableId 已注册过私人桌，直接返回已有 slug。
   */
  create(tableId: string, displayName?: string, createdBy?: string): PrivateTableMeta {
    const existing = this.tableIndex.get(tableId);
    if (existing) {
      const meta = this.slugIndex.get(existing);
      if (meta) return meta;
    }

    this.slugCounter += 1;
    const slug = `vip-${String(this.slugCounter).padStart(3, '0')}`;
    const meta: PrivateTableMeta = {
      slug,
      tableId,
      displayName: displayName ?? `私人牌桌 #${this.slugCounter}`,
      createdAt: new Date().toISOString(),
      createdBy,
    };
    this.slugIndex.set(slug, meta);
    this.tableIndex.set(tableId, slug);
    return meta;
  }

  /** 通过 slug 查找私人桌元信息。 */
  findBySlug(slug: string): PrivateTableMeta | undefined {
    return this.slugIndex.get(slug);
  }

  /** 通过 tableId 查找私人桌元信息。 */
  findByTableId(tableId: string): PrivateTableMeta | undefined {
    const slug = this.tableIndex.get(tableId);
    if (!slug) return undefined;
    return this.slugIndex.get(slug);
  }

  /** 判断 tableId 是否为私人桌。 */
  isPrivate(tableId: string): boolean {
    return this.tableIndex.has(tableId);
  }

  /** 获取所有私人桌 slug 列表。 */
  listSlugs(): string[] {
    return [...this.slugIndex.keys()];
  }

  /** 获取所有私人桌元信息。 */
  listAll(): PrivateTableMeta[] {
    return [...this.slugIndex.values()];
  }

  /** 删除私人桌映射。 */
  remove(tableId: string): void {
    const slug = this.tableIndex.get(tableId);
    if (slug) {
      this.slugIndex.delete(slug);
      this.tableIndex.delete(tableId);
    }
  }
}

/** 全局单例 */
export const privateTableService = new PrivateTableService();