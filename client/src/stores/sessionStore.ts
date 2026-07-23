import { computed, ref } from 'vue'

export interface UserProfile {
  id: string
  name: string
  balance: number
}

export type SessionStatus = 'idle' | 'loading' | 'ready' | 'unauthenticated' | 'unavailable'

const user = ref<UserProfile | null>(null)
const status = ref<SessionStatus>('idle')
const tokenStorageKey = 'poker.session.token'
const token = ref<string | null>(localStorage.getItem(tokenStorageKey))

function setUser(profile: UserProfile): void {
  user.value = profile
  status.value = 'ready'
}

function clear(): void {
  user.value = null
  token.value = null
  localStorage.removeItem(tokenStorageKey)
  status.value = 'unauthenticated'
}

function beginAuthentication(): void {
  status.value = 'loading'
}

function setToken(nextToken: string): void {
  token.value = nextToken
  localStorage.setItem(tokenStorageKey, nextToken)
}

export const sessionStore = {
  user,
  token,
  balance: computed(() => user.value?.balance ?? null),
  status,
  setUser,
  clear,
  beginAuthentication,
  setToken,
}
