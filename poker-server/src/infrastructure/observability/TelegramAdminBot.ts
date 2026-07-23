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

/**
 * RBAC 角色定义。
 * admin: 全部命令可用（/status /ban /unban /health /shutdown /broadcast）
 * operator: 仅查看类命令（/status /health）
 * admin 由 ADMIN_TG_ID 唯一标识。
 */
type Role = 'admin' | 'viewer';

export interface AdminUser {
  tgId: string;
  role: Role;
  name?: string;
}

export interface TelegramAdminBotOptions {
  botToken: string;
  adminTgId: string;
  /** 可选：额外允许的管理员列表 */
  extraAdmins?: AdminUser[];
  deps: AdminBotDependencies;
  pollIntervalMs?: number;
}

/** 命令权限映射：admin 可执行所有命令，viewer 仅可执行查看类命令。 */
const ADMIN_ONLY_COMMANDS = new Set(['/ban', '/unban', '/shutdown', '/broadcast']);
const VIEWER_COMMANDS = new Set(['/status', '/health']);

export class TelegramAdminBot {
  private readonly botToken: string;
  private readonly adminTgId: string;
  private readonly deps: AdminBotDependencies;
  private readonly pollIntervalMs: number;
  private readonly baseUrl: string;
  private readonly extraAdmins: AdminUser[];
  private running = false;
  private offset = 0;

  constructor(opts: TelegramAdminBotOptions) {
    this.botToken = opts.botToken;
    this.adminTgId = opts.adminTgId;
    this.deps = opts.deps;
    this.pollIntervalMs = opts.pollIntervalMs ?? 2_000;
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
    this.extraAdmins = opts.extraAdmins ?? [];
  }

  static async startAdminBot(opts: TelegramAdminBotOptions): Promise<() => void> {
    const bot = new TelegramAdminBot(opts);
    await bot.run();
    return () => { bot.running = false; };
  }

  /** 检查用户是否具有执行命令的权限。 */
  private getUserRole(userId: string): Role | null {
    // 主管理员始终为 admin
    if (userId === this.adminTgId) return 'admin';
    // 检查额外授权列表
    const extra = this.extraAdmins.find(a => a.tgId === userId);
    if (extra) return extra.role;
    return null;
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
    const data = (await res.json()) as {
      ok: boolean;
      result: Array<{
        update_id: number;
        message?: { from?: { id: number }; text?: string; chat?: { id: number } };
      }>;
    };
    if (!data.ok || !Array.isArray(data.result)) return;
    for (const update of data.result) {
      this.offset = update.update_id + 1;
      await this.handle(update);
    }
  }

  private async handle(update: {
    update_id: number;
    message?: { from?: { id: number }; text?: string; chat?: { id: number } };
  }): Promise<void> {
    const msg = update.message;
    if (!msg?.from?.id || !msg.text || !msg.chat) return;

    const userId = String(msg.from.id);
    const role = this.getUserRole(userId);
    if (!role) return; // 未授权用户静默忽略

    const text = msg.text.trim();
    const chatId = msg.chat.id;
    const parts = text.split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    if (!cmd || (!ADMIN_ONLY_COMMANDS.has(cmd) && !VIEWER_COMMANDS.has(cmd))) return;

    // RBAC 权限校验：admin-only 命令需要 admin 角色
    if (ADMIN_ONLY_COMMANDS.has(cmd) && role !== 'admin') {
      await this.reply(chatId, `[FORBIDDEN] 命令 ${cmd} 需要管理员权限`);
      return;
    }

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