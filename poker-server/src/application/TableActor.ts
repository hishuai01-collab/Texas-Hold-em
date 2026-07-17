export interface TableActorOptions {
  /** 单 Job（含其异步持久化尾段）允许的最长耗时，超时视为失败 */
  jobTimeoutMs?: number;
  /** 连续失败达到该次数即熔断（此后新 Job 立即快速失败，不再进入引擎） */
  breakerThreshold?: number;
  /** 熔断触发时的回调（用于通知 TableManager 淘汰并重建该桌） */
  onBreakerTrip?: () => void;
}

/**
 * 单线程串行执行器：并发 ws 消息入队，逐个执行，同一时刻仅一个命令改动牌桌状态。
 * Job 可以是同步引擎变更，也可以是「同步变更 + 异步持久化尾段」的组合（TableSession 用法）；
 * 无论哪种，都由这里统一注入单 Job try/catch 与超时熔断，调用方（server.ts）无需关心。
 */
export class TableActor {
  private queue: (() => void | Promise<void>)[] = [];
  private processing = false;
  private consecutiveFailures = 0;
  private breakerOpen = false;
  private readonly jobTimeoutMs: number;
  private readonly breakerThreshold: number;

  constructor(private readonly opts: TableActorOptions = {}) {
    this.jobTimeoutMs = opts.jobTimeoutMs ?? 5_000;
    this.breakerThreshold = opts.breakerThreshold ?? 3;
  }

  /** false 表示熔断已跳闸：桌子暂不可用，调用方应快速失败而非入队等待。 */
  get isHealthy(): boolean {
    return !this.breakerOpen;
  }

  /** 手动复位熔断（TableManager 重建该桌的会话后调用，避免旧熔断状态污染新实例——实际上新桌是新 TableActor 实例，此方法主要供测试使用）。 */
  resetBreaker(): void {
    this.breakerOpen = false;
    this.consecutiveFailures = 0;
  }

  /** 入队并尽快开始处理；不等待 Job 完成（fire-and-forget，失败已在内部兜底，不会向调用方抛出）。 */
  run(fn: () => void | Promise<void>): void {
    this.queue.push(fn);
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      if (this.breakerOpen) {
        console.error('[TableActor] job dropped: circuit breaker open');
        continue;
      }
      try {
        await this.withTimeout(job);
        this.consecutiveFailures = 0;
      } catch (e) {
        console.error('[TableActor] job failed:', e);
        this.consecutiveFailures += 1;
        if (this.consecutiveFailures >= this.breakerThreshold) {
          this.breakerOpen = true;
          console.error(`[TableActor] circuit breaker OPEN after ${this.consecutiveFailures} consecutive failures`);
          this.opts.onBreakerTrip?.();
        }
      }
    }
    this.processing = false;
  }

  private withTimeout(fn: () => void | Promise<void>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`TableActor job timed out after ${this.jobTimeoutMs}ms`));
      }, this.jobTimeoutMs);
      timer.unref?.();
      Promise.resolve()
        .then(fn)
        .then(() => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve();
        })
        .catch(error => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /** Resolves only after all work accepted before the call has finished (or the breaker trips and drains the rest). */
  async drain(): Promise<void> {
    while (this.processing || this.queue.length > 0) {
      await new Promise<void>(resolve => setImmediate(resolve));
    }
  }
}
