import { computed, ref } from 'vue'

export interface UserProfile {
  id: string
  name: string
  balance: number
}

export type SessionStatus = 'idle' | 'loading' | 'ready' | 'unauthenticated' | 'unavailable'

const user = ref<UserProfile | null>(null)
const status = ref<SessionStatus>('idle')

function setUser(profile: UserProfile): void {
  user.value = profile
  status.value = 'ready'
}

function clear(): void {
  user.value = null
  status.value = 'unauthenticated'
}

export const sessionStore = {
  user,
  balance: computed(() => user.value?.balance ?? null),
  status,
  setUser,
  clear,
}
