import { ApiError, api } from '../lib/api'
import { sessionStore, type UserProfile } from './sessionStore'

interface UserMeResponse {
  id?: string | number
  userId?: string | number
  name?: string
  username?: string
  balance?: string | number
  data?: UserMeResponse
}

interface LoginResponse {
  token: string | null
  user: {
    id?: string | number
    userId?: string | number
    name?: string
  }
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

/** The server issues a seven-day Bearer token persisted for the returning player. */
async function login(name: string, userId?: string): Promise<void> {
  sessionStore.beginAuthentication()
  try {
    const payload = await api.post<LoginResponse>('/api/v1/auth/login', {
      name,
      ...(userId ? { userId } : {}),
    })
    if (!payload.token) throw new Error('登录服务未返回访问令牌')
    sessionStore.setToken(payload.token)
    const profile = await api.get<UserMeResponse>('/api/v1/user/me')
    sessionStore.setUser(parseProfile(profile))
  } catch (error) {
    sessionStore.clear()
    throw error
  }
}

export const userStore = {
  ...sessionStore,
  loadMe,
  login,
}
