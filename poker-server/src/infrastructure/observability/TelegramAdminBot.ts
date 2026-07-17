import os from 'node:os';

export interface AdminBotDependencies {
  blocklist: {
    ban(ip: string): void;
    release(ip: string): void;
    isBlocked(ip: string): boolean;
  };
  redisPing?: () => Promise<unknown>;
  tableCount: () => number;
  connectionCount: () => number;
}

export interface TelegramAdminBotOptions {
  botToken: string;
  adminTgId: string;
  deps: AdminBotDependencies;
  pollIntervalMs?: number;
}

export class TelegramAdminBot {
  private readonly botToken: string;
  private readonly adminTgId: string;
  private readonly deps: AdminBotDependencies;
  private readonly pollIntervalMs: number;
  private readonly baseUrl: string;
  private running = false;
  private offset = 0;

  constructor(opts: TelegramAdminBotOptions) {
    this.botToken = opts.botToken;
    this.adminTgId = opts.adminTgId;
    this.deps = opts.deps;
    this.pollIntervalMs = opts.pollIntervalMs ?? 2_000;
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  static async startAdminBot(opts: TelegramAdminBotOptions): Promise<() => void> {
    const bot = new TelegramAdminBot(opts);
    await bot.run();
    return () => { bot.running = false; };
  }

  private async run(): Promise<void> {
    this.running = true;
    while (this.running) {
      try {
        await this.poll();
      } catch {
        // 静默降级：长轮询超时或网络抖动不影响主循环
      }
      if (this.running) await sleep(this.pollIntervalMs);
    }
  }

  private async poll(): Promise<void> {
    const params = new URLSearchParams({ timeout: '30' });
    if (this.offset > 0) params.set('offset', String(this.offset));
    const res = await fetch(`${this.baseUrl}/getUpdates?${params.toString()}`, {
      signal: AbortSignal.timeout(35_000),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { ok: boolean; result: Array<{ update_id: number; message?: { from?: { id: number }; text?: string; chat?: { id: number } } }> };
    if (!data.ok || !Array.isArray(data.result)) return;
    for (const update of data.result) {
      this.offset = update.update_id + 1;
      await this.handle(update);
    }
  }

  private async handle(update: { update_id: number; message?: { from?: { id: number }; text?: string; chat?: { id: number } } }): Promise<void> {
    const msg = update.message;
    if (!msg?.from?.id || !msg.text || !msg.chat) return;
    if (String(msg.from.id) !== this.adminTgId) return;
    const text = msg.text.trim();
    const chatId = msg.chat.id;
    const parts = text.split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    let reply = '';
    switch (cmd) {
      case '/status':
        reply = this.formatStatus();
        break;
      case '/ban':
        reply = this.handleBan(parts[1]);
        break;
      case '/unban':
        reply = this.handleUnban(parts[1]);
        break;
      case '/health':
        reply = await this.handleHealth();
        break;
      default:
        return;
    }
    await this.reply(chatId, reply);
  }

  private formatStatus(): string {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPct = ((usedMem / totalMem) * 100).toFixed(1);
    const load = cpus.length > 0 ? ((cpus[0]?.times?.user ?? 0) / 1000).toFixed(2) : '0.00';
    const uptime = process.uptime();
    const d = Math.floor(uptime / 86400);
    const h = Math.floor((uptime % 86400) / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    return `CPU: ${load}s | MEM: ${formatBytes(usedMem)}/${formatBytes(totalMem)} (${memPct}%) | UPTIME: ${d}d ${h}h ${m}m | TABLES: ${this.deps.tableCount()} | CONNS: ${this.deps.connectionCount()}`;
  }

  private handleBan(ip?: string): string {
    if (!ip || !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return '[FAIL] Usage: /ban <ip>';
    this.deps.blocklist.ban(ip);
    return `[OK] IP ${ip} Banned`;
  }

  private handleUnban(ip?: string): string {
    if (!ip || !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return '[FAIL] Usage: /unban <ip>';
    this.deps.blocklist.release(ip);
    return `[OK] IP ${ip} Unbanned`;
  }

  private async handleHealth(): Promise<string> {
    if (this.deps.redisPing) {
      try {
        await this.deps.redisPing();
        return '[OK] Redis PONG | Server Running';
      } catch {
        return '[WARN] Redis Unreachable | WS Server Running';
      }
    }
    return '[OK] WS Server Running';
  }

  private async reply(chatId: number, text: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
    } catch {
      // 静默降级
    }
  }
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}K`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)}M`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(1)}G`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
