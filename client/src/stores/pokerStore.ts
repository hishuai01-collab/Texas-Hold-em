import { computed, reactive, ref } from 'vue'
import { soundStore } from '../lib/sound'
import type { Card, ClientPayload, SeatView, ServerEvent, ServerMsg } from '../types/protocol'

export type ConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING'
type Street = 'WAITING' | 'PREFLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'SHOWDOWN' | 'COMPLETE'

interface ActionRequest {
  playerId: string
  toCall: number
  minRaiseTo: number
  raiseAllowed: boolean
}

interface PokerState {
  seats: SeatView[]
  pot: number
  board: Card[]
  holeCards: Card[]
  revealedCards: Record<string, Card[]>
  street: Street
  handId: string | null
  button: number | null
  actionRequest: ActionRequest | null
  auditRoot: string | null
  error: string | null
  eventLog: string[]
}

const storageKeys = {
  name: 'poker.player.name',
  seed: 'poker.player.seed',
  playerId: 'poker.player.id',
  reconnectToken: 'poker.player.reconnectToken',
}

const createSeed = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
const storedName = localStorage.getItem(storageKeys.name) ?? 'Player'
const storedSeed = localStorage.getItem(storageKeys.seed) ?? createSeed()
localStorage.setItem(storageKeys.seed, storedSeed)

const state = reactive<PokerState>({
  seats: [],
  pot: 0,
  board: [],
  holeCards: [],
  revealedCards: {},
  street: 'WAITING',
  handId: null,
  button: null,
  actionRequest: null,
  auditRoot: null,
  error: null,
  eventLog: [],
})

const connectionStatus = ref<ConnectionStatus>('DISCONNECTED')
const lastSeq = ref(-1)
const playerId = ref<string | null>(localStorage.getItem(storageKeys.playerId))
const reconnectToken = ref<string | null>(localStorage.getItem(storageKeys.reconnectToken))
const playerName = ref(storedName)
const tableId = ref('default')
const inviteCapability = ref<string | null>(null)
const actionVersion = ref(0)
const showdownVersion = ref(0)
const showdownWinnings = ref<Record<string, number>>({})
/** 断线重连期间冻结 UI 交互 */
const frozen = ref(false)
/** 错误追踪号，用于 Toast 显示唯一标识 */
const errorCode = ref(0)
/** 当前重连尝试次数 */
const reconnectAttempt = ref(0)
let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let disposed = false
let outboundClientSeq = 0

function resetHand(): void {
  state.pot = 0
  state.board = []
  state.holeCards = []
  state.revealedCards = {}
  state.street = 'PREFLOP'
  state.actionRequest = null
  state.auditRoot = null
  showdownWinnings.value = {}
}

function setSeats(seats: SeatView[]): void {
  state.seats = [...seats].sort((a, b) => a.seatIndex - b.seatIndex)
}

function addLog(event: ServerEvent): void {
  const suffix = 'seq' in event ? ` #${event.seq}` : ''
  state.eventLog.unshift(`${event.type}${suffix}`)
  state.eventLog.splice(14)
}

function acceptsSequence(event: ServerEvent): boolean {
  // Action requests can intentionally share a transport sequence with the
  // preceding state event. They must refresh the betting panel every time.
  if (!('seq' in event) || event.type === 'JOINED' || event.type === 'PLAYER_JOINED' || event.type === 'ACTION_REQUIRED') return true
  if (event.type === 'HAND_STARTED') {
    lastSeq.value = event.seq
    return true
  }
  if (event.seq <= lastSeq.value) return false
  lastSeq.value = event.seq
  return true
}

function releaseFrozen(): void {
  frozen.value = false
}

function playEventSound(event: ServerEvent): void {
  switch (event.type) {
    case 'PRIVATE_CARDS':
      soundStore.play('deal')
      break
    case 'STREET':
      soundStore.play('street')
      break
    case 'ACTION_APPLIED': {
      const actionSounds = { CHECK: 'check', FOLD: 'fold', CALL: 'call', RAISE: 'raise', ALL_IN: 'raise' } as const
      const sound = actionSounds[event.action as keyof typeof actionSounds]
      if (sound) soundStore.play(sound)
      break
    }
    case 'SHOWDOWN':
      if (playerId.value) soundStore.play((event.winnings[playerId.value] ?? 0) > 0 ? 'win' : 'lose')
      break
  }
}

/** The only game-state writer: fold each uppercase server event into local state. */
function reduce(event: ServerEvent, replaying = false): boolean {
  if (!acceptsSequence(event)) return false
  addLog(event)

    switch (event.type) {
      case 'JOINED':
        playerId.value = event.you
        reconnectToken.value = event.reconnectToken
        localStorage.setItem(storageKeys.playerId, event.you)
        localStorage.setItem(storageKeys.reconnectToken, event.reconnectToken)
        setSeats(event.seats)
        releaseFrozen()
        break
      case 'RECONNECTED':
        reconnectToken.value = event.reconnectToken
        localStorage.setItem(storageKeys.reconnectToken, event.reconnectToken)
        setSeats(event.seats)
        releaseFrozen()
        break
    case 'HAND_STARTED':
      resetHand()
      state.handId = event.handId
      state.button = event.button
      setSeats(event.seats)
      break
    case 'PRIVATE_CARDS':
      state.holeCards = event.reveals.map(({ card }) => card)
      break
    case 'ACTION_APPLIED':
      state.pot = event.pot
      state.actionRequest = null
      setSeats(event.seats)
      break
    case 'ACTION_REQUIRED':
      state.actionRequest = event
      actionVersion.value += 1
      break
    case 'PLAYER_JOINED':
      setSeats(event.seats)
      break
    case 'PLAYER_LEFT':
      setSeats(event.seats)
      if (event.playerId === playerId.value && event.reason === 'BUSTED') {
        playerId.value = null
        reconnectToken.value = null
        localStorage.removeItem(storageKeys.playerId)
        localStorage.removeItem(storageKeys.reconnectToken)
      }
      break
    case 'STREET':
      state.street = event.street
      state.board = [...state.board, ...event.reveals.map(({ card }) => card)]
      break
    case 'REFUND':
      state.pot = Math.max(0, state.pot - event.amount)
      break
    case 'SHOWDOWN':
      state.street = 'SHOWDOWN'
      state.actionRequest = null
      showdownWinnings.value = { ...event.winnings }
      showdownVersion.value += 1
      state.revealedCards = Object.fromEntries(
        Object.entries(event.reveals).map(([id, cards]) => [id, cards.map(({ card }) => card)]),
      )
      setSeats(event.seats)
      break
    case 'HAND_ENDED':
      state.street = 'COMPLETE'
      state.actionRequest = null
      state.auditRoot = event.auditRoot
      break
      case 'ERROR':
        state.error = event.message
        errorCode.value += 1
        if (event.message.includes('重连校验失败') || event.message.includes('校验失败')) {
          playerId.value = null
          reconnectToken.value = null
          localStorage.removeItem(storageKeys.playerId)
          localStorage.removeItem(storageKeys.reconnectToken)
          lastSeq.value = -1
          send({ type: 'JOIN', name: playerName.value, clientSeed: storedSeed })
        }
        break
  }
  if (!replaying) playEventSound(event)
  return true
}

function handleMessage(payload: string): void {
  let message: ServerMsg
  try {
    message = JSON.parse(payload) as ServerMsg
  } catch {
    return
  }
  if (message.type === 'EVENT_REPLAY') {
    message.events
      .slice()
      .sort((a, b) => ('seq' in a ? a.seq : -1) - ('seq' in b ? b.seq : -1))
      .forEach((event) => reduce(event, true))
    // 重放完毕 → 解冻
    releaseFrozen()
    return
  }
  reduce(message)
}

function send(message: ClientPayload): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false
  socket.send(JSON.stringify({ ...message, clientSeq: outboundClientSeq++ }))
  return true
}

function socketUrl(): string {
  const base = import.meta.env.VITE_POKER_WS_URL ?? `ws://${window.location.hostname || 'localhost'}:8080`
  const separator = base.includes('?') ? '&' : '?'
  const tid = tableId.value.trim() || 'default'
  const invite = inviteCapability.value
  const inviteParam = invite ? `&invite=${encodeURIComponent(invite)}` : ''
  return `${base}${separator}tableId=${encodeURIComponent(tid)}${inviteParam}`
}

function scheduleReconnect(): void {
  if (disposed || reconnectTimer) return
  const delay = Math.min(1000 * 2 ** reconnectAttempt.value, 10_000)
  reconnectAttempt.value += 1
  connectionStatus.value = 'RECONNECTING'
  frozen.value = true
  state.eventLog = [] // preserve player identity and hand snapshot, clear connection-local diagnostics
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect(playerName.value, tableId.value, inviteCapability.value)
  }, delay)
}

function connect(name = playerName.value, requestedTableId = tableId.value, requestedInvite: string | null = null): void {
  disposed = false
  playerName.value = name.trim() || 'Player'
  tableId.value = requestedTableId.trim() || 'default'
  inviteCapability.value = requestedInvite
  localStorage.setItem(storageKeys.name, playerName.value)
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return

  connectionStatus.value = playerId.value ? 'RECONNECTING' : 'CONNECTING'
  if (playerId.value) frozen.value = true
  socket = new WebSocket(socketUrl())
  socket.onopen = () => {
    outboundClientSeq = 0
    connectionStatus.value = 'CONNECTED'
    reconnectAttempt.value = 0
    if (playerId.value && reconnectToken.value) {
      send({ type: 'RECONNECT', playerId: playerId.value, reconnectToken: reconnectToken.value, lastSeq: lastSeq.value })
    } else {
      send({ type: 'JOIN', name: playerName.value, clientSeed: storedSeed })
    }
  }
  socket.onmessage = (event) => handleMessage(String(event.data))
  socket.onerror = () => socket?.close()
  socket.onclose = () => {
    socket = null
    connectionStatus.value = 'DISCONNECTED'
    scheduleReconnect()
  }
}

function disconnect(): void {
  disposed = true
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = null
  socket?.close()
  socket = null
  connectionStatus.value = 'DISCONNECTED'
  frozen.value = false
}

const mySeat = computed(() => state.seats.find((seat) => seat.id === playerId.value) ?? null)
const isMyTurn = computed(() => state.actionRequest?.playerId === playerId.value)

export const pokerStore = {
  state,
  connectionStatus,
  lastSeq,
  playerId,
  reconnectToken,
  playerName,
  tableId,
  actionVersion,
  showdownVersion,
  showdownWinnings,
  frozen,
  errorCode,
  reconnectAttempt,
  mySeat,
  isMyTurn,
  connect,
  disconnect,
  start: () => send({ type: 'START' }),
  action: (action: 'FOLD' | 'CHECK' | 'CALL' | 'RAISE' | 'ALL_IN', amount?: number) =>
    send({ type: 'ACTION', action, ...(amount === undefined ? {} : { amount }) }),
}
