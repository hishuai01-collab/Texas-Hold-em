// IP 级动态黑名单（Group C：防 DoS / 防刷）。
// 单连接触发 3 次 clientSeq 跳号 / 速率超限 / 载荷异常后，将 X-Forwarded-For 提取的真实 IP
// 压入内存 LRU，实施 60 秒 HTTP 层 403 握手拒绝。
// 设计为纯内存 LRU（单实例），多实例应下沉 Redis（SETNX + EX 60）；此处保留接口语义不变。

import { Redis } from 'ioredis';

export interface IpBlocklistOptions {
  /** 连续触发多少次违规后拉黑该 IP */
  strikesToBan: number;
  /** 拉黑时长（毫秒） */
  banTtlMs: number;
  /** LRU 容量上限，超出后逐出最久未访问项 */
  capacity: number;
  /** Redis 实例（多实例共享黑名单时传入） */
  redis?: Redis;
  /** Pub/Sub 频道名（默认 poker:ipblocklist） */
  pubSubChannel?: string;
}

export interface IpBlocklistEvent {
  type: 'BAN' | 'RELEASE';
  ip: string;
  until?: number;
  at: number;
}

export type IpBlocklistHook = (event: IpBlocklistEvent) => void;

export class IpBlocklist {
  private strikes = new Map<string, number>();
  private bannedUntil = new Map<string, number>();
  /** LRU：最近访问时间，用于超出容量时逐出 */
  private lastSeen = new Map<string, number>();
  private redisPub?: Redis;
  private channel: string;

  constructor(
    private readonly opts: IpBlocklistOptions = {
      strikesToBan: 3,
      banTtlMs: 60_000,
      capacity: 10_000,
    },
    private readonly hooks: IpBlocklistHook[] = [],
  ) {
    this.channel = opts.pubSubChannel ?? 'poker:ipblocklist';
    if (opts.redis && opts.pubSubChannel !== '') {
      this.redisPub = opts.redis;
      this.subscribe(opts.redis, this.channel);
    }
  }

  onEvent(hook: IpBlocklistHook): void {
    this.hooks.push(hook);
  }

  private fire(event: IpBlocklistEvent): void {
    for (const h of this.hooks) h(event);
  }

  private async publish(event: IpBlocklistEvent): Promise<void> {
    if (!this.redisPub) return;
    try {
      await this.redisPub.publish(this.channel, JSON.stringify(event));
    } catch {
      // 静默降级：单实例或 Redis 故障时不影响本地黑名单
    }
  }

  private async subscribe(redis: Redis, channel: string): Promise<void> {
    try {
      const sub = new Redis(redis.options);
      await sub.subscribe(channel);
      sub.on('message', (_: string, raw: string) => {
        try {
          const event = JSON.parse(raw) as IpBlocklistEvent;
          if (event.type === 'BAN') {
            this.bannedUntil.set(event.ip, event.until ?? (event.at + this.opts.banTtlMs));
            this.touch(event.ip, event.at);
          } else if (event.type === 'RELEASE') {
            this.release(event.ip);
          }
        } catch {
          // 忽略损坏消息
        }
      });
    } catch {
      // 订阅失败不影响主流程
    }
  }

  /** 当前是否处于拉黑状态 */
  isBlocked(ip: string, now = Date.now()): boolean {
    const until = this.bannedUntil.get(ip);
    if (until === undefined) return false;
    if (now >= until) {
      this.bannedUntil.delete(ip);
      this.strikes.delete(ip);
      return false;
    }
    return true;
  }

  /** 距离解封剩余毫秒；未拉黑返回 0 */
  remainingMs(ip: string, now = Date.now()): number {
    const until = this.bannedUntil.get(ip);
    if (until === undefined) return 0;
    return Math.max(0, until - now);
  }

  /**
   * 记一次违规。返回触发拉黑后的解封时间戳（ms），未达阈值返回 null。
   * 达到阈值后清零累加计数，避免解封瞬间立即再被同一次累加判黑。
   */
  strike(ip: string, now = Date.now()): number | null {
    if (this.isBlocked(ip, now)) return this.bannedUntil.get(ip)!;

    const n = (this.strikes.get(ip) ?? 0) + 1;
    this.strikes.set(ip, n);
    this.touch(ip, now);

    if (n >= this.opts.strikesToBan) {
      const until = now + this.opts.banTtlMs;
      this.bannedUntil.set(ip, until);
      this.strikes.delete(ip);
      this.touch(ip, now);
      const event: IpBlocklistEvent = { type: 'BAN', ip, until, at: now };
      this.fire(event);
      void this.publish(event);
      return until;
    }
    return null;
  }

  /** 立即拉黑（如检测到明确攻击特征） */
  ban(ip: string, now = Date.now()): number {
    const until = now + this.opts.banTtlMs;
    this.bannedUntil.set(ip, until);
    this.strikes.delete(ip);
    this.touch(ip, now);
    const event: IpBlocklistEvent = { type: 'BAN', ip, until, at: now };
    this.fire(event);
    void this.publish(event);
    return until;
  }

  /** 主动解封（运维/测试用） */
  release(ip: string): void {
    this.bannedUntil.delete(ip);
    this.strikes.delete(ip);
    const event: IpBlocklistEvent = { type: 'RELEASE', ip, at: Date.now() };
    this.fire(event);
    void this.publish(event);
  }

  private touch(ip: string, now: number): void {
    this.lastSeen.set(ip, now);
    if (this.lastSeen.size > this.opts.capacity) this.evict(now);
  }

  /** 逐出最久未访问、且未处于拉黑态的项，收敛内存 */
  private evict(now: number): void {
    let oldestIp: string | null = null;
    let oldest = Infinity;
    for (const [ip, t] of this.lastSeen) {
      if (t < oldest) { oldest = t; oldestIp = ip; }
    }
    if (oldestIp) {
      this.lastSeen.delete(oldestIp);
      this.strikes.delete(oldestIp);
      if (this.isBlocked(oldestIp, now)) this.bannedUntil.delete(oldestIp);
    }
  }

  /** 调试/测试：当前受跟踪的 LRU 集合快照（未拉黑项 remainingMs 为 0）。 */
  snapshot(now = Date.now()): { ip: string; remainingMs: number }[] {
    const out: { ip: string; remainingMs: number }[] = [];
    for (const ip of this.lastSeen.keys()) {
      out.push({ ip, remainingMs: this.remainingMs(ip, now) });
    }
    return out;
  }
}

/**
 * 从请求头提取真实客户端 IP。优先级：X-Forwarded-For（首个，真实客户端）→ Remote - 直连回退。
 * 服务端生产环境只接受 Nginx 本机转发（nginx.conf 已透传 X-Forwarded-For），
 * 因此 XFF 可信；若直连（开发），回退 socket remoteAddress。
 */
export function extractClientIp(xForwardedFor: string | undefined, remoteAddress: string | undefined): string {
  if (xForwardedFor && xForwardedFor.length > 0) {
    const first = xForwardedFor.split(',')[0]!.trim();
    if (first) return first;
  }
  return remoteAddress ?? 'unknown';
}
