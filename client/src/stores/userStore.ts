import { ApiError, api } from '../lib/api'
import { sessionStore, type UserProfile } from './sessionStore'
import { authHelpers as supabaseAuth } from '../lib/supabase'

interface UserMeResponse {
  id?: string | number
  userId?: string | number
  name?: string
  username?: string
  balance?: string | number
  data?: UserMeResponse
}

function parseProfile(payload: UserMeResponse): UserProfile {
  const source = payload.data ?? payload
  const balance = Number(source.balance)
  if (!Number.isFinite(balance)) throw new Error('Invalid balance returned by /api/v1/user/me')
  return {
    id: String(source.id ?? source.userId ?? 'user'),
    name: String(source.name ?? source.username ?? 'Player'),
    balance,
  }
}

async function loadMe(): Promise<void> {
  if (sessionStore.status.value === 'loading') return
  if (!sessionStore.token.value) {
    sessionStore.clear()
    return
  }
  sessionStore.status.value = 'loading'
  try {
    const payload = await api.get<UserMeResponse>('/api/v1/user/me')
    sessionStore.setUser(parseProfile(payload))
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      sessionStore.clear()
      return
    }
    sessionStore.status.value = error instanceof ApiError && error.status === 404
      ? 'unavailable'
      : 'unavailable'
  }
}

async function loginWithSupabase(): Promise<void> {
  sessionStore.beginAuthentication()
  try {
    await supabaseAuth.restoreSupabaseSession()
  } catch (error) {
    sessionStore.clear()
    throw error
  }
}

export const userStore = {
  ...sessionStore,
  loadMe,
  sendPhoneOtp: supabaseAuth.sendPhoneOtp,
  verifyPhoneOtp: supabaseAuth.verifyPhoneOtp,
  sendEmailOtp: supabaseAuth.sendEmailOtp,
  verifyEmailOtp: supabaseAuth.verifyEmailOtp,
  loginWithOAuth: supabaseAuth.signInWithOAuth,
  loginWithSupabase,
}