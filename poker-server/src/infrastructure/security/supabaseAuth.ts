import { createHmac, timingSafeEqual } from 'node:crypto'

export interface VerifiedSupabaseToken {
  aud?: string
  exp?: number
  iat?: number
  sub: string
  email?: string
  phone?: string
  emailVerified?: boolean
  phoneVerified?: boolean
  userMetadata?: Record<string, unknown>
  appMetadata?: Record<string, unknown>
  [key: string]: unknown
}

export interface SupabaseIdentity {
  userId: string
  name: string
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return Buffer.from(padded, 'base64')
}

export class SupabaseAuthVerifier {
  constructor(private readonly secret: string) {}

  verify(token: string): VerifiedSupabaseToken {
    const parts = token.split('.')
    if (parts.length !== 3) throw new Error('Invalid JWT format')

    const headerB64 = parts[0]!
    const payloadB64 = parts[1]!
    const signatureB64 = parts[2]!

    const message = `${headerB64}.${payloadB64}`
    const expected = createHmac('sha256', this.secret).update(message).digest()
    const given = Buffer.from(signatureB64, 'base64url')

    if (given.length !== expected.length) throw new Error('JWT signature length mismatch')

    const valid = timingSafeEqual(Buffer.alloc(expected.length, 0), Buffer.from(given))
    if (!valid) throw new Error('Invalid JWT signature')

    const payload: VerifiedSupabaseToken = JSON.parse(base64UrlDecode(payloadB64).toString())

    if (!payload.sub) throw new Error('JWT missing sub claim')

    if (payload.exp && Date.now() >= payload.exp * 1000) {
      throw new Error('JWT expired')
    }

    return payload
  }

  extractIdentity(payload: VerifiedSupabaseToken): SupabaseIdentity {
    const metadata = (payload.userMetadata ?? {}) as Record<string, unknown>
    const getString = (value: unknown): string | undefined => (typeof value === 'string' && value.trim()) ? value.trim() : undefined
    const name =
      getString(metadata.full_name) ??
      getString(metadata.name) ??
      getString(payload.phone) ??
      getString(payload.email) ??
      `user-${payload.sub.slice(0, 8)}`

    return { userId: payload.sub, name }
  }
}
