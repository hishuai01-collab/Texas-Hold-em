import { createClient, type Session, type User, AuthError, type Provider } from '@supabase/supabase-js'
import { sessionStore } from '../stores/sessionStore'
import { api } from '../lib/api'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})

export type { Session, User, AuthError, Provider }

async function getBackendSession(accessToken: string): Promise<void> {
  const payload = await api.post<{ token: string | null; user: { id: string; name: string; balance: number } }>('/api/v1/auth/supabase', {
    access_token: accessToken,
  })
  if (!payload.token) throw new Error('登录服务未返回访问令牌')
  sessionStore.setToken(payload.token)
  sessionStore.setUser({
    id: payload.user.id,
    name: payload.user.name,
    balance: payload.user.balance ?? 0,
  })
}

export async function sendPhoneOtp(phone: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({ phone })
  if (error) throw new AuthError(error.message, error.status)
}

export async function verifyPhoneOtp(phone: string, token: string): Promise<void> {
  const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' })
  if (error) throw new AuthError(error.message, error.status)
  if (data.session?.access_token) {
    await getBackendSession(data.session.access_token)
  }
}

export async function sendEmailOtp(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({ email })
  if (error) throw new AuthError(error.message, error.status)
}

export async function verifyEmailOtp(email: string, token: string): Promise<void> {
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
  if (error) throw new AuthError(error.message, error.status)
  if (data.session?.access_token) {
    await getBackendSession(data.session.access_token)
  }
}

export async function signInWithOAuth(provider: Provider): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: window.location.origin + '/app',
    },
  })
  if (error) throw new AuthError(error.message, error.status)
}

export async function restoreSupabaseSession(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('No active Supabase session')
  }
  await getBackendSession(session.access_token)
}

export async function supabaseSignOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw new AuthError(error.message, error.status)
  sessionStore.clear()
}

export const authHelpers = {
  sendPhoneOtp,
  verifyPhoneOtp,
  sendEmailOtp,
  verifyEmailOtp,
  signInWithOAuth,
  restoreSupabaseSession,
  supabaseSignOut,
}
