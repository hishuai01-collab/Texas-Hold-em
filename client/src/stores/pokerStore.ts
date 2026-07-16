import { computed, reactive, ref } from 'vue'
import type { Card, ClientPayload, SeatView, ServerEvent, ServerMsg } from '../types/protocol'

export type ConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING'
type Street = 'WAITING' | 'PREFLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'SHOWDOWN' | 'COMPLETE'

interface ActionRequest {
  playerId: string
  toCall: number
  minRaiseTo: number
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
const actionVersion = ref(0)
let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempt = 0
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
  if (!('seq' in event) || event.type === 'JOINED' || event.type === 'PLAYER_JOINED') return true
  if (event.type === 'HAND_STARTED') {
    lastSeq.value = event.seq
    return true
  }
  if (event.seq <= lastSeq.value) return false
  lastSeq.value = event.seq
  return true
}

/** The only game-state writer: fold each uppercase server event into local state. */
function reduce(event: ServerEvent): void {
  if (!acceptsSequence(event)) return
  addLog(event)

    switch (event.type) {
      case 'JOINED':
        playerId.value = event.you
        reconnectToken.value = event.reconnectToken
        localStorage.setItem(storageKeys.playerId, event.you)
        localStorage.setItem(storageKeys.reconnectToken, event.reconnectToken)
        setSeats(event.seats)
        break
      case 'RECONNECTED':
        reconnectToken.value = event.reconnectToken
        localStorage.setItem(storageKeys.reconnectToken, event.reconnectToken)
        setSeats(event.seats)
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
      .forEach(reduce)
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
  return import.meta.env.VITE_POKER_WS_URL ?? `ws://${window.location.hostname || 'localhost'}:8080`
}

function scheduleReconnect(): void {
  if (disposed || reconnectTimer) return
  const delay = Math.min(1000 * 2 ** reconnectAttempt, 10_000)
  reconnectAttempt += 1
  connectionStatus.value = 'RECONNECTING'
  state.eventLog = [] // preserve player identity and hand snapshot, clear connection-local diagnostics
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, delay)
}

function connect(name = playerName.value): void {
  disposed = false
  playerName.value = name.trim() || 'Player'
  localStorage.setItem(storageKeys.name, playerName.value)
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return

  connectionStatus.value = playerId.value ? 'RECONNECTING' : 'CONNECTING'
  socket = new WebSocket(socketUrl())
  socket.onopen = () => {
    outboundClientSeq = 0
    connectionStatus.value = 'CONNECTED'
    reconnectAttempt = 0
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
  actionVersion,
  mySeat,
  isMyTurn,
  connect,
  disconnect,
  start: () => send({ type: 'START' }),
  action: (action: 'FOLD' | 'CHECK' | 'CALL' | 'RAISE' | 'ALL_IN', amount?: number) =>
    send({ type: 'ACTION', action, ...(amount === undefined ? {} : { amount }) }),
}
