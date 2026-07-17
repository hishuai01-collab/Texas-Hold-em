export interface TimeoutAction {
  playerId: string;
  toCall: number;
}

export interface TimeoutManagerOptions {
  actionMs?: number;
  disconnectedTimeBankMs?: number;
  onTimeout: (action: TimeoutAction) => void;
  onTimeBankStarted?: (action: TimeoutAction) => void;
}

interface PendingAction extends TimeoutAction {
  actionTimer?: NodeJS.Timeout;
  bankTimer?: NodeJS.Timeout;
  disconnected: boolean;
}

/**
 * Owns exactly one clock per acting player. A connected player times out after
 * actionMs; a player that is already disconnected gets one additional Time Bank
 * window before the engine receives its deterministic FOLD/CHECK command.
 */
export class TimeoutManager {
  private readonly pending = new Map<string, PendingAction>();
  private readonly actionMs: number;
  private readonly disconnectedTimeBankMs: number;

  constructor(private readonly options: TimeoutManagerOptions) {
    this.actionMs = options.actionMs ?? 15_000;
    this.disconnectedTimeBankMs = options.disconnectedTimeBankMs ?? 15_000;
  }

  arm(playerId: string, toCall: number): void {
    this.clear(playerId);
    const pending: PendingAction = { playerId, toCall, disconnected: false };
    pending.actionTimer = setTimeout(() => this.onActionDeadline(playerId), this.actionMs);
    pending.actionTimer.unref?.();
    this.pending.set(playerId, pending);
  }

  clear(playerId: string): void {
    const pending = this.pending.get(playerId);
    if (!pending) return;
    if (pending.actionTimer) clearTimeout(pending.actionTimer);
    if (pending.bankTimer) clearTimeout(pending.bankTimer);
    this.pending.delete(playerId);
  }

  markDisconnected(playerId: string): void {
    const pending = this.pending.get(playerId);
    if (pending) pending.disconnected = true;
  }

  markConnected(playerId: string): void {
    const pending = this.pending.get(playerId);
    if (!pending) return;
    pending.disconnected = false;
    // A successful reconnect during Time Bank restores a normal turn clock.
    if (pending.bankTimer) {
      clearTimeout(pending.bankTimer);
      pending.bankTimer = undefined;
      pending.actionTimer = setTimeout(() => this.onActionDeadline(playerId), this.actionMs);
      pending.actionTimer.unref?.();
    }
  }

  stop(): void {
    for (const playerId of this.pending.keys()) this.clear(playerId);
  }

  private onActionDeadline(playerId: string): void {
    const pending = this.pending.get(playerId);
    if (!pending) return;
    pending.actionTimer = undefined;
    if (!pending.disconnected) return this.fire(playerId);

    this.options.onTimeBankStarted?.({ playerId, toCall: pending.toCall });
    pending.bankTimer = setTimeout(() => this.fire(playerId), this.disconnectedTimeBankMs);
    pending.bankTimer.unref?.();
  }

  private fire(playerId: string): void {
    const pending = this.pending.get(playerId);
    if (!pending) return;
    const action = { playerId: pending.playerId, toCall: pending.toCall };
    this.clear(playerId);
    this.options.onTimeout(action);
  }
}
