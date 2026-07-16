import type { ClientMsg, ClientPayload } from '../../shared/protocol.js';

export const MAX_MESSAGE_BYTES = 8 * 1024;
export const MAX_MESSAGES_PER_SECOND = 10;
export const MAX_SECURITY_VIOLATIONS = 3;

export type GatewayRejectReason = 'PAYLOAD_TOO_LARGE' | 'RATE_LIMITED' | 'INVALID_JSON' | 'INVALID_PROTOCOL' | 'CLIENT_SEQ_OUT_OF_ORDER';

export interface SecurityEvent {
  type: 'WSS_SECURITY_REJECTED';
  reason: GatewayRejectReason;
  violations: number;
  disconnect: boolean;
  bytes: number;
}

export type SecurityAuditHook = (event: SecurityEvent) => void;

export type GatewayResult =
  | { ok: true; message: ClientMsg }
  | { ok: false; reason: GatewayRejectReason; violations: number; disconnect: boolean; bytes: number };

const actionNames = new Set(['FOLD', 'CHECK', 'CALL', 'RAISE', 'ALL_IN']);
type ActionName = Extract<ClientPayload, { type: 'ACTION' }>['action'];

function byteLength(payload: unknown): number {
  if (Buffer.isBuffer(payload)) return payload.length;
  if (payload instanceof ArrayBuffer) return payload.byteLength;
  if (Array.isArray(payload)) return payload.reduce((size, chunk) => size + chunk.length, 0);
  return Buffer.byteLength(String(payload));
}

function decode(payload: unknown): string {
  if (Buffer.isBuffer(payload)) return payload.toString('utf8');
  if (payload instanceof ArrayBuffer) return Buffer.from(payload).toString('utf8');
  if (Array.isArray(payload)) return Buffer.concat(payload).toString('utf8');
  return String(payload);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function parsePayload(value: Record<string, unknown>): ClientPayload | null {
  switch (value.type) {
    case 'JOIN':
      return isText(value.name, 24) && isText(value.clientSeed, 256)
        ? { type: 'JOIN', name: value.name, clientSeed: value.clientSeed }
        : null;
    case 'START':
      return { type: 'START' };
    case 'ACTION':
      if (typeof value.action !== 'string' || !actionNames.has(value.action)) return null;
      if (value.amount !== undefined && (!isSafeInteger(value.amount) || value.amount < 0)) return null;
      return value.amount === undefined
        ? { type: 'ACTION', action: value.action as ActionName }
        : { type: 'ACTION', action: value.action as ActionName, amount: value.amount };
    case 'RECONNECT':
      return isText(value.playerId, 128)
        && isText(value.reconnectToken, 256)
        && isSafeInteger(value.lastSeq)
        && value.lastSeq >= -1
        ? { type: 'RECONNECT', playerId: value.playerId, reconnectToken: value.reconnectToken, lastSeq: value.lastSeq }
        : null;
    default:
      return null;
  }
}

/** Per-socket ingress guard. The audit hook is a future Telegram/SIEM integration point. */
export class WebSocketGateway {
  private timestamps: number[] = [];
  private expectedClientSeq = 0;
  private violations = 0;

  constructor(private readonly audit: SecurityAuditHook = () => undefined) {}

  inspect(raw: unknown, now = Date.now()): GatewayResult {
    const bytes = byteLength(raw);
    if (bytes > MAX_MESSAGE_BYTES) return this.reject('PAYLOAD_TOO_LARGE', bytes);

    this.timestamps = this.timestamps.filter((timestamp) => now - timestamp < 1_000);
    if (this.timestamps.length >= MAX_MESSAGES_PER_SECOND) return this.reject('RATE_LIMITED', bytes);
    this.timestamps.push(now);

    let decoded: unknown;
    try {
      decoded = JSON.parse(decode(raw));
    } catch {
      return this.reject('INVALID_JSON', bytes);
    }
    if (!isRecord(decoded) || !isSafeInteger(decoded.clientSeq) || decoded.clientSeq < 0) {
      return this.reject('INVALID_PROTOCOL', bytes);
    }
    const clientSeq = decoded.clientSeq;
    if (clientSeq !== this.expectedClientSeq) {
      return this.reject('CLIENT_SEQ_OUT_OF_ORDER', bytes);
    }

    const payload = parsePayload(decoded);
    if (!payload) return this.reject('INVALID_PROTOCOL', bytes);
    this.expectedClientSeq += 1;
    return { ok: true, message: { ...payload, clientSeq } };
  }

  private reject(reason: GatewayRejectReason, bytes: number): GatewayResult {
    this.violations += 1;
    const disconnect = this.violations >= MAX_SECURITY_VIOLATIONS;
    this.audit({ type: 'WSS_SECURITY_REJECTED', reason, violations: this.violations, disconnect, bytes });
    return { ok: false, reason, violations: this.violations, disconnect, bytes };
  }
}
