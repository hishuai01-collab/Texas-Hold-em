import { ref } from 'vue'
import { ApiError, api } from '../lib/api'

export interface LobbyTable {
  id: string
  smallBlind: number
  bigBlind: number
  players: number
  maxPlayers: number
  status: 'OPEN' | 'FULL' | 'RUNNING'
}

const fallbackTables: LobbyTable[] = [
  { id: 'default', smallBlind: 5, bigBlind: 10, players: 0, maxPlayers: 6, status: 'OPEN' },
]

const tables = ref<LobbyTable[]>(fallbackTables)
const loading = ref(false)
const lastUpdated = ref<Date | null>(null)

function normalizeTable(value: unknown): LobbyTable | null {
  if (typeof value !== 'object' || value === null) return null
  const table = value as Partial<LobbyTable>
  if (!table.id) return null
  const players = Number(table.players ?? 0)
  const maxPlayers = Number(table.maxPlayers ?? 6)
  return {
    id: String(table.id),
    smallBlind: Number(table.smallBlind ?? 5),
    bigBlind: Number(table.bigBlind ?? 10),
    players: Number.isFinite(players) ? players : 0,
    maxPlayers: Number.isFinite(maxPlayers) ? maxPlayers : 6,
    status: table.status === 'FULL' || table.status === 'RUNNING' ? table.status : 'OPEN',
  }
}

async function refresh(): Promise<void> {
  if (loading.value) return
  loading.value = true
  try {
    const payload = await api.get<unknown>(import.meta.env.VITE_LOBBY_TABLES_URL ?? '/api/v1/tables')
    const values = Array.isArray(payload)
      ? payload
      : typeof payload === 'object' && payload !== null && 'tables' in payload
        ? (payload.tables as unknown[])
        : []
    const next = values.map(normalizeTable).filter((table): table is LobbyTable => table !== null)
    if (next.length > 0) tables.value = next
  } catch (error) {
    // The current server exposes table access over WebSocket rather than HTTP.
    // Keep the default table usable until a lobby endpoint is deployed.
    if (!(error instanceof ApiError && error.status === 404)) tables.value = fallbackTables
  } finally {
    lastUpdated.value = new Date()
    loading.value = false
  }
}

export const lobbyStore = {
  tables,
  loading,
  lastUpdated,
  refresh,
}
