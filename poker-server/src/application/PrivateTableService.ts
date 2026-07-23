import { createHash, randomBytes, randomUUID } from 'node:crypto';

export const PRIVATE_INVITE_PURPOSE = 'private-table-join' as const;
export const PRIVATE_INVITE_VERSION = 1;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_MAX_USES = 6;
const MIN_TTL_MS = 60 * 1_000;
const MAX_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_USES = 6;
const PRIVATE_TABLE_ID_PATTERN = /^private-[a-f0-9]{32}$/;

export type PrivateInvitePurpose = typeof PRIVATE_INVITE_PURPOSE;
export type PrivateInviteFailure = 'INVALID' | 'EXPIRED' | 'REVOKED' | 'EXHAUSTED' | 'WRONG_TABLE';

interface StoredPrivateInvite {
  id: string;
  tokenHash: string;
  revokeTokenHash: string;
  tableId: string;
  displayName: string;
  createdAt: string;
  expiresAt: string;
  purpose: PrivateInvitePurpose;
  version: number;
  maxUses: number;
  uses: number;
  revokedAt?: string;
}

export interface PrivateTableInvite {
  /** Returned only when the invite is created. Never persist or log it. */
  capability: string;
  /** Creator-only bearer capability for revocation. Never add it to an invite URL. */
  revokeCapability: string;
  tableId: string;
  displayName: string;
  createdAt: string;
  expiresAt: string;
  purpose: PrivateInvitePurpose;
  version: number;
  maxUses: number;
}

export interface ResolvedPrivateInvite {
  tableId: string;
  displayName: string;
  createdAt: string;
  expiresAt: string;
  purpose: PrivateInvitePurpose;
  version: number;
  remainingUses: number;
}

export interface CreatePrivateInviteOptions {
  displayName?: string;
  ttlMs?: number;
  maxUses?: number;
}

export type PrivateInviteResult =
  | { ok: true; invite: ResolvedPrivateInvite }
  | { ok: false; reason: PrivateInviteFailure };

function hashCapability(capability: string): string {
  return createHash('sha256').update(capability).digest('hex');
}

function isSafeDuration(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_TTL_MS && value <= MAX_TTL_MS;
}

function isSafeMaxUses(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= MAX_USES;
}

/**
 * In-memory private-table invite registry.
 *
 * Invite links are opaque 256-bit bearer capabilities. The raw capability is
 * never stored or logged, so tampering becomes a failed hash lookup. HMAC key
 * rotation intentionally does not apply here: it is needed only for a future
 * stateless, self-describing token format.
 */
export class PrivateTableService {
  private readonly invitesByHash = new Map<string, StoredPrivateInvite>();
  private readonly inviteHashesByTable = new Map<string, Set<string>>();

  create(tableId: string, options: CreatePrivateInviteOptions = {}): PrivateTableInvite {
    const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    const maxUses = options.maxUses ?? DEFAULT_MAX_USES;
    if (!isSafeDuration(ttlMs)) throw new Error('邀请有效期必须在 1 分钟到 7 天之间');
    if (!isSafeMaxUses(maxUses)) throw new Error(`邀请使用次数必须在 1 到 ${MAX_USES} 之间`);

    const capability = randomBytes(32).toString('base64url');
    const revokeCapability = randomBytes(32).toString('base64url');
    const now = new Date();
    const stored: StoredPrivateInvite = {
      id: randomUUID(),
      tokenHash: hashCapability(capability),
      revokeTokenHash: hashCapability(revokeCapability),
      tableId,
      displayName: options.displayName?.trim() || '私人牌桌',
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      purpose: PRIVATE_INVITE_PURPOSE,
      version: PRIVATE_INVITE_VERSION,
      maxUses,
      uses: 0,
    };
    this.invitesByHash.set(stored.tokenHash, stored);
    const tableInvites = this.inviteHashesByTable.get(tableId) ?? new Set<string>();
    tableInvites.add(stored.tokenHash);
    this.inviteHashesByTable.set(tableId, tableInvites);

    return {
      capability,
      revokeCapability,
      tableId: stored.tableId,
      displayName: stored.displayName,
      createdAt: stored.createdAt,
      expiresAt: stored.expiresAt,
      purpose: stored.purpose,
      version: stored.version,
      maxUses: stored.maxUses,
    };
  }

  resolve(capability: string): PrivateInviteResult {
    const stored = this.invitesByHash.get(hashCapability(capability));
    return this.validate(stored);
  }

  /** Consume exactly one initial JOIN admission. Reconnect uses its own token. */
  consumeForJoin(tableId: string, capability: string | null): PrivateInviteResult {
    if (!capability) return { ok: false, reason: 'INVALID' };
    const stored = this.invitesByHash.get(hashCapability(capability));
    const result = this.validate(stored, tableId);
    if (!result.ok || !stored) return result;
    stored.uses += 1;
    return { ok: true, invite: this.toResolved(stored) };
  }

  /** Undo a consumed admission if the game engine rejects the attempted seat. */
  releaseJoin(tableId: string, capability: string | null): void {
    if (!capability) return;
    const stored = this.invitesByHash.get(hashCapability(capability));
    if (stored?.tableId === tableId && stored.uses > 0) stored.uses -= 1;
  }

  revoke(capability: string, revokeCapability: string | null): boolean {
    if (!revokeCapability) return false;
    const stored = this.invitesByHash.get(hashCapability(capability));
    if (!stored || stored.revokedAt || stored.revokeTokenHash !== hashCapability(revokeCapability)) return false;
    stored.revokedAt = new Date().toISOString();
    return true;
  }

  isPrivate(tableId: string): boolean {
    // After a process restart the in-memory registry is empty. The generated
    // private ID namespace keeps those tables fail-closed instead of public.
    return PRIVATE_TABLE_ID_PATTERN.test(tableId) || this.inviteHashesByTable.has(tableId);
  }

  remove(tableId: string): void {
    const hashes = this.inviteHashesByTable.get(tableId);
    if (!hashes) return;
    for (const hash of hashes) this.invitesByHash.delete(hash);
    this.inviteHashesByTable.delete(tableId);
  }

  private validate(stored: StoredPrivateInvite | undefined, tableId?: string): PrivateInviteResult {
    if (!stored) return { ok: false, reason: 'INVALID' };
    if (tableId && stored.tableId !== tableId) return { ok: false, reason: 'WRONG_TABLE' };
    if (stored.revokedAt) return { ok: false, reason: 'REVOKED' };
    if (Date.parse(stored.expiresAt) <= Date.now()) return { ok: false, reason: 'EXPIRED' };
    if (stored.uses >= stored.maxUses) return { ok: false, reason: 'EXHAUSTED' };
    return { ok: true, invite: this.toResolved(stored) };
  }

  private toResolved(stored: StoredPrivateInvite): ResolvedPrivateInvite {
    return {
      tableId: stored.tableId,
      displayName: stored.displayName,
      createdAt: stored.createdAt,
      expiresAt: stored.expiresAt,
      purpose: stored.purpose,
      version: stored.version,
      remainingUses: stored.maxUses - stored.uses,
    };
  }
}

export const privateTableService = new PrivateTableService();
