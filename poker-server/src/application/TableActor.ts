/** 单线程串行执行器：并发 ws 消息入队，逐个同步执行，同一时刻仅一个命令改动牌桌状态 */
export class TableActor {
  private queue: (() => void)[] = [];
  private processing = false;

  run(fn: () => void): void {
    this.queue.push(fn);
    if (this.processing) return;
    this.processing = true;
    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      try {
        job();
      } catch (e) {
        console.error('[TableActor] job failed:', e);
      }
    }
    this.processing = false;
  }
}
