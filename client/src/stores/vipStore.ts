import { computed, ref, watch } from 'vue'
import { profileStore } from './profileStore'

export interface VipLevel {
  key: string
  name: string
  minHands: number
  maxHands: number
  color: string
  badge: string
}

export const VIP_LEVELS: VipLevel[] = [
  { key: 'novice', name: '新秀', minHands: 0, maxHands: 49, color: '#9ca3af', badge: '🌱' },
  { key: 'amateur', name: '进阶', minHands: 50, maxHands: 199, color: '#34d399', badge: '🌿' },
  { key: 'elite', name: '精英', minHands: 200, maxHands: 499, color: '#60a5fa', badge: '⚡' },
  { key: 'master', name: '大师', minHands: 500, maxHands: 999, color: '#c084fc', badge: '👑' },
  { key: 'legend', name: '传奇', minHands: 1000, maxHands: Infinity, color: '#fbbf24', badge: '🏆' },
]

interface VipState {
  currentLevel: VipLevel
  nextLevel: VipLevel | null
  progress: number
  handsInCurrent: number
}

function resolveLevel(handsPlayed: number): VipLevel {
  for (let i = VIP_LEVELS.length - 1; i >= 0; i--) {
    const lvl = VIP_LEVELS[i]
    if (handsPlayed >= lvl.minHands) return lvl
  }
  return VIP_LEVELS[0]
}

function resolve(handsPlayed: number): VipState {
  const current = resolveLevel(handsPlayed)
  const currentIndex = VIP_LEVELS.findIndex((l) => l.key === current.key)
  const next = currentIndex < VIP_LEVELS.length - 1 ? VIP_LEVELS[currentIndex + 1] : null
  const range = current.maxHands - current.minHands
  const progress = next ? Math.max(0, Math.min(1, (handsPlayed - current.minHands) / (range > 0 ? range : 1))) : 1
  return { currentLevel: current, nextLevel: next, progress, handsInCurrent: handsPlayed - current.minHands }
}

const initial = resolve(profileStore.stats.value.handsPlayed)
const state = ref<VipState>(initial)

watch(
  () => profileStore.stats.value.handsPlayed,
  (hands) => { state.value = resolve(hands) }
)

const level = computed(() => state.value.currentLevel)
const next = computed(() => state.value.nextLevel)
const progress = computed(() => state.value.progress)
const handsInCurrent = computed(() => state.value.handsInCurrent)

export const vipStore = {
  level,
  next,
  progress,
  handsInCurrent,
  levels: VIP_LEVELS,
}
