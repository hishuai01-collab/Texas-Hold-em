import { Redis } from 'ioredis';

export interface TelegramNotifierOptions {
  botToken: string;
  chatId: string;
  timeoutMs?: number;
}

export interface AlertPayload {
  title: string;
  message: string;
  severity?: 'info' | 'warning' | 'critical';
}

export class TelegramNotifier {
  private readonly botToken: string;
  private readonly chatId: string;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(opts: TelegramNotifierOptions) {
    this.botToken = opts.botToken;
    this.chatId = opts.chatId;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  static fromEnv(): TelegramNotifier | null {
    const botToken = process.env.TG_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) return null;
    return new TelegramNotifier({ botToken, chatId });
  }

  async send(payload: AlertPayload): Promise<boolean> {
    const emoji = payload.severity === 'critical' ? '\u26a0\ufe0f' : payload.severity === 'warning' ? '\u2139\ufe0f' : '\u2705';
    const text = `${emoji} <b>${escapeHtml(payload.title)}</b>\n${escapeHtml(payload.message)}`;
    try {
      const res = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: this.chatId, text, parse_mode: 'HTML' }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async notifyPM2Restart(tableId: string, reason: string, restartCount: number): Promise<boolean> {
    return this.send({
      title: `PM2 进程重启告警`,
      message: `桌: ${tableId}\n原因: ${reason}\n重启次数: ${restartCount}\n时间: ${new Date().toLocaleString()}`,
      severity: 'critical',
    });
  }

  async notifyAbnormalFlow(tableId: string, playerId: string, amount: number, reason: string): Promise<boolean> {
    return this.send({
      title: `超大筹码异常流水`,
      message: `桌: ${tableId}\n玩家: ${playerId}\n金额: ${amount}\n原因: ${reason}\n时间: ${new Date().toLocaleString()}`,
      severity: 'warning',
    });
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
