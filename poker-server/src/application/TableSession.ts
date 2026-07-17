import { randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';
import { GameEngine } from '../domain/services/GameEngine.js';
import { TableActor } from './TableActor.js';
import { TimeoutManager } from './TimeoutManager.js';
import { newTableEpoch } from '../infrastructure/security/ActionRiskControl.js';
import { validateOutbound } from '../infrastructure/security/schema.js';
import type { EventStore, TableSnapshotRecord } from '../infrastructure/eventstore/EventStore.js';
import type { PokerMetrics } from '../infrastructure/observability/PrometheusMetrics.js';
import type { ServerMsg } from '../shared/protocol.js';

export interface TableSessionDeps {
  tableId: string;
  eventStore: EventStore;
  metrics: PokerMetrics;
  actorOptions?: { jobTimeoutMs?: number; breakerThreshold?: number };
  onBreakerTrip?: (tableId: string) => void;
}

interface BufferedEvent { msg: ServerMsg; privateTo?: string }

/**
 * 单桌运行时：把 GameEngine（纯同步、对 Redis 无感知）与持久化/投递编排在一起。
 * 每条命令走 mutate（同步）→ persist（Redis，异步）→ deliver（socket/计时器/机器人，同步）
 * 三段管线，由 TableActor 整体串行化并注入超时熔断——持久化先于投递，保证「已广播的事件
 * 必已落盘」，崩溃恢复时不会出现客户端看到了但 Redis 没记录的状态。
 */
export class TableSession {
  readonly tableId: string;
  readonly engine: GameEngine;
  readonly actor: TableActor;
  readonly timeoutManager: TimeoutManager;
  readonly sockets = new Map<string, WebSocket>();
  readonly botIds = new Set<string>();
  tableEpoch: string;
  lastActivityAt = Date.now();
  private streamCursor = '0';
  private pendingEvents: BufferedEvent[] = [];

  constructor(private readonly deps: TableSessionDeps) {
    this.tableId = deps.tableId;
    this.tableEpoch = newTableEpoch();
    this.actor = new TableActor({
      ...deps.actorOptions,
      onBreakerTrip: () => deps.onBreakerTrip?.(deps.tableId),
    });
    this.timeoutManager = new TimeoutManager({
      onTimeout: ({ playerId, toCall }) => this.runCommand(() => {
        if (this.engine.autoAct(playerId)) {
          this.deps.metrics.actionTimeouts.inc();
          console.warn(JSON.stringify({ type: 'AFK_AUTO_ACTION', tableId: this.tableId, playerId, action: toCall > 0 ? 'FOLD' : 'CHECK', at: new Date().toISOString() }));
        }
      }),
      onTimeBankStarted: ({ playerId }) => console.info(JSON.stringify({ type: 'TIME_BANK_STARTED', tableId: this.tableId, playerId, seconds: 15 })),
    });
    this.engine = new GameEngine(
      (msg, privateTo) => this.pendingEvents.push({ msg, privateTo }),
      undefined, undefined,
      () => { this.tableEpoch = newTableEpoch(); },
    );
  }

  touch(): void {
    this.lastActivityAt = Date.now();
  }

  /** 无人连接、无进行中手牌，且已连续空闲 idleMs——安全回收，不会丢失任何已结算的筹码状态。 */
  isIdle(idleMs: number): boolean {
    return this.sockets.size === 0 && !this.engine.handInProgress && Date.now() - this.lastActivityAt > idleMs;
  }

  seedBots(count: number): void {
    for (let i = 0; i < count; i++) {
      const id = `bot-${i + 1}`;
      this.botIds.add(id);
      this.engine.addPlayer(id, `Bot·${i + 1}号`, randomBytes(8).toString('hex'));
    }
  }

  /** 崩溃恢复：进程重启后没有任何 socket，若快照里恰好卡在等待某玩家行动，先挂上计时器（离线态），复用 TimeoutManager 既有的「离线 Time Bank」语义。 */
  armPendingActionAfterRestore(): void {
    const pending = this.engine.pendingAction;
    if (!pending) return;
    this.timeoutManager.arm(pending.playerId, pending.toCall);
    this.timeoutManager.markDisconnected(pending.playerId);
  }

  /**
   * 会话级广播（如 PLAYER_JOINED/PLAYER_LEFT）：这些事件不经过 GameEngine.dispatch()
   * （入座/离座本身不是牌局领域事件），但仍需和当前 Job 里的引擎事件一起持久化+投递，
   * 保持顺序一致。只应在 runCommand 传入的 fn 内部同步调用。
   */
  broadcastSessionEvent(msg: ServerMsg, privateTo?: string): void {
    this.pendingEvents.push({ msg, privateTo });
  }

  /** 把一段同步引擎变更包装为「变更→持久化→投递」的整体 Job，交给 TableActor 串行执行。 */
  runCommand(fn: () => void): void {
    this.touch();
    this.actor.run(async () => {
      this.pendingEvents = [];
      fn();
      const batch = this.pendingEvents;
      this.pendingEvents = [];

      if (batch.length > 0) {
        this.streamCursor = await this.deps.eventStore.appendEvents(
          this.tableId,
          batch.map(e => ({ msg: e.msg as unknown as Record<string, unknown>, privateTo: e.privateTo })),
        );
      }

      // SETTLE 检查点：HAND_ENDED 是 settleHand() 的最后一条广播，此刻筹码已守恒、无进行中手牌。
      if (batch.some(e => e.msg.type === 'HAND_ENDED')) {
        const record: TableSnapshotRecord = {
          version: 1,
          tableId: this.tableId,
          savedAt: new Date().toISOString(),
          streamCursor: this.streamCursor,
          engine: this.engine.snapshot(),
        };
        await this.deps.eventStore.writeSnapshot(this.tableId, record);
        try {
          await this.deps.eventStore.trimBefore(this.tableId, this.streamCursor);
        } catch (error) {
          console.error('[TableSession] stream trim failed (non-fatal)', error);
        }
      }

      for (const e of batch) this.deliver(e.msg, e.privateTo);
    });
  }

  /** 手动落一次快照（用于优雅关闭兜底，语义等价于「立刻发生了一次 SETTLE 检查点」）。 */
  async persistSnapshotNow(): Promise<void> {
    const record: TableSnapshotRecord = {
      version: 1,
      tableId: this.tableId,
      savedAt: new Date().toISOString(),
      streamCursor: this.streamCursor,
      engine: this.engine.snapshot(),
    };
    await this.deps.eventStore.writeSnapshot(this.tableId, record);
  }

  async close(): Promise<void> {
    this.timeoutManager.stop();
    await this.actor.drain();
  }

  private deliver(msg: ServerMsg, privateTo?: string): void {
    const [ok, reason] = validateOutbound(msg);
    if (!ok) console.error(`[emit] outbound schema violation: ${reason} type=${msg.type} table=${this.tableId}`);

    if (msg.type === 'ACTION_REQUIRED') {
      this.timeoutManager.arm(msg.playerId, msg.toCall);
      if (this.botIds.has(msg.playerId)) {
        setTimeout(() => this.runCommand(() => {
          try { this.engine.act(msg.playerId, msg.toCall > 0 ? 'CALL' : 'CHECK'); } catch { /* action already advanced */ }
        }), 400).unref?.();
      }
    }
    if (msg.type === 'ACTION_APPLIED') this.timeoutManager.clear(msg.playerId);

    const data = JSON.stringify(msg);
    if (privateTo) this.sockets.get(privateTo)?.send(data);
    else for (const ws of this.sockets.values()) if (ws.readyState === WebSocket.OPEN) ws.send(data);

    if (msg.type === 'PLAYER_LEFT' && msg.reason === 'BUSTED') {
      const departed = this.sockets.get(msg.playerId);
      setTimeout(() => departed?.close(1000, 'busted'), 50).unref?.();
    }
  }
}
