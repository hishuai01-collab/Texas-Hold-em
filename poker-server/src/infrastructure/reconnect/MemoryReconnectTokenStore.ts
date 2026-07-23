import { randomBytes } from "node:crypto";
import type {
  ReconnectTokenRecord,
  ReconnectTokenStore,
} from "./RedisReconnectTokenStore.js";

const TOKEN_TTL_SECONDS = 300;

/** 纯内存重连令牌：Map 存储，过期自动清理。 */
export class MemoryReconnectTokenStore implements ReconnectTokenStore {
  private readonly records = new Map<
    string,
    { record: ReconnectTokenRecord; expiresAt: number }
  >();

  async issue(record: ReconnectTokenRecord): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    this.records.set(token, {
      record,
      expiresAt: Date.now() + TOKEN_TTL_SECONDS * 1_000,
    });
    return token;
  }

  async consume(token: string): Promise<ReconnectTokenRecord | null> {
    const entry = this.records.get(token);
    this.records.delete(token);
    if (!entry) return null;
    return entry.expiresAt > Date.now() ? entry.record : null;
  }

  async close(): Promise<void> {
    this.records.clear();
  }
}
