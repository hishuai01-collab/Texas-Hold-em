import { ref, computed } from 'vue'

interface ProfileStats {
  handsPlayed: number
  handsWon: number
  biggestWin: number
  totalWinnings: number
  currentStreak: number
  longestStreak: number
  lastPlayedAt: number
}

const STORAGE_KEY = 'poker.profile.stats'

const defaultStats: ProfileStats = {
  handsPlayed: 0,
  handsWon: 0,
  biggestWin: 0,
  totalWinnings: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastPlayedAt: 0,
}

function readStats(): ProfileStats {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...defaultStats }
    const parsed = JSON.parse(raw) as Partial<ProfileStats>
    return { ...defaultStats, ...parsed }
  } catch {
    return { ...defaultStats }
  }
}

function writeStats(stats: ProfileStats): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats))
}

const stats = ref<ProfileStats>(readStats())

const formatted = computed(() => ({
  handsPlayed: stats.value.handsPlayed.toLocaleString(),
  handsWon: stats.value.handsWon.toLocaleString(),
  winRate: stats.value.handsPlayed === 0 ? '0%' : `${Math.round((stats.value.handsWon / stats.value.handsPlayed) * 100)}%`,
  biggestWin: stats.value.biggestWin.toLocaleString(),
  totalWinnings: stats.value.totalWinnings === 0 ? '0' : `${stats.value.totalWinnings > 0 ? '+' : ''}${stats.value.totalWinnings.toLocaleString()}`,
  currentStreak: `${stats.value.currentStreak} 连胜`,
  longestStreak: `${stats.value.longestStreak} 连胜`,
}))

function recordHandResult(won: boolean, amount: number): void {
  const next = {
    handsPlayed: stats.value.handsPlayed + 1,
    handsWon: stats.value.handsWon + (won ? 1 : 0),
    biggestWin: won ? Math.max(stats.value.biggestWin, amount) : stats.value.biggestWin,
    totalWinnings: stats.value.totalWinnings + amount,
    currentStreak: won ? stats.value.currentStreak + 1 : 0,
    longestStreak: won ? Math.max(stats.value.longestStreak, stats.value.currentStreak + 1) : stats.value.longestStreak,
    lastPlayedAt: Date.now(),
  }
  stats.value = next
  writeStats(next)
}

function resetStats(): void {
  stats.value = { ...defaultStats }
  writeStats(stats.value)
}

export const profileStore = {
  stats,
  formatted,
  recordHandResult,
  resetStats,
}
