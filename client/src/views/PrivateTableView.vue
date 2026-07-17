<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import BettingPanel from '../components/BettingPanel.vue'
import PokerTable from '../components/PokerTable.vue'
import { pokerStore } from '../stores/pokerStore'
import { toastStore } from '../stores/toastStore'
import { api } from '../lib/api'

const route = useRoute()
const router = useRouter()
const nameInput = ref(pokerStore.playerName.value)
const connected = computed(() => pokerStore.connectionStatus.value === 'CONNECTED')
const activePlayerId = computed(() => pokerStore.state.actionRequest?.playerId ?? null)
const isSpectator = computed(() => pokerStore.playerId.value === null && connected.value)
const showConnectPanel = computed(() => !connected.value || pokerStore.playerId.value === null)

/** 从路由参数中提取 slug */
const slug = computed(() => {
  const raw = route.params.slug
  return (typeof raw === 'string' && raw.length > 0) ? raw : null
})

/** 通过 slug 解析出的真实 tableId */
const resolvedTableId = ref<string | null>(null)
const resolving = ref(true)
const resolveError = ref<string | null>(null)
const displayName = ref('私人牌桌')

/** 调用 HTTP API 将 slug 解析为 tableId */
async function resolveSlug(s: string): Promise<void> {
  resolving.value = true
  resolveError.value = null
  try {
    const data = await api.get<{ slug: string; tableId: string; displayName: string }>(
      `/api/v1/tables/private/${encodeURIComponent(s)}`,
    )
    resolvedTableId.value = data.tableId
    displayName.value = data.displayName
  } catch (error) {
    resolveError.value = '私人牌桌不存在或已过期'
    resolvedTableId.value = null
    console.error('[PrivateTable] resolve slug failed', error)
  } finally {
    resolving.value = false
  }
}

function connect(): void {
  if (!resolvedTableId.value) return
  pokerStore.connect(nameInput.value, resolvedTableId.value)
}

watch(
  () => pokerStore.state.error,
  (error) => {
    if (error) toastStore.push(error, 'error')
  },
)

watch(slug, (next) => {
  if (next) {
    pokerStore.disconnect()
    void resolveSlug(next)
  } else {
    router.replace({ name: 'lobby' })
  }
})

onMounted(() => {
  if (slug.value) {
    void resolveSlug(slug.value)
  } else {
    router.replace({ name: 'lobby' })
  }
})

onUnmounted(pokerStore.disconnect)
</script>

<template>
  <main class="min-h-screen bg-[radial-gradient(circle_at_top,_#2a1a3f,_#080d18_56%)] px-3 py-4 text-slate-100 sm:px-6 sm:py-6">
    <div class="mx-auto max-w-6xl">
      <header class="mb-4 flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <RouterLink class="font-mono text-[10px] tracking-[.24em] text-slate-500 hover:text-white" to="/">← LOBBY</RouterLink>
          <p class="mt-3 text-xs font-bold tracking-[.28em] text-amber-300">PRIVATE TABLE</p>
          <h1 class="mt-1 text-xl font-black tracking-wide text-white">{{ displayName }}</h1>
          <p v-if="slug" class="mt-1 font-mono text-[10px] tracking-[.2em] text-purple-400">邀请码 / {{ slug }}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <span
            v-if="resolving"
            class="rounded-full bg-amber-400/15 px-3 py-1 font-bold text-amber-200"
          >
            解析中…
          </span>
          <span
            v-else-if="resolveError"
            class="rounded-full bg-red-400/15 px-3 py-1 font-bold text-red-200"
          >
            {{ resolveError }}
          </span>
          <span
            v-else
            class="rounded-full px-3 py-1 font-bold"
            :class="connected ? 'bg-emerald-400/15 text-emerald-200' : 'bg-amber-400/15 text-amber-200'"
          >
            {{ pokerStore.connectionStatus }}
            <span v-if="pokerStore.reconnectAttempt.value > 0"> ({{ pokerStore.reconnectAttempt.value }})</span>
          </span>
          <span v-if="resolvedTableId" class="rounded-full bg-white/5 px-3 py-1 text-slate-400">桌号: {{ resolvedTableId }}</span>
          <span class="rounded-full bg-white/5 px-3 py-1 text-slate-300">事件 #{{ pokerStore.lastSeq }}</span>
          <span v-if="pokerStore.playerId" class="rounded-full bg-white/5 px-3 py-1 text-slate-400">已入座</span>
          <span v-else-if="connected" class="rounded-full bg-amber-400/10 px-3 py-1 text-amber-300">旁观</span>
        </div>
      </header>

      <div v-if="resolveError" class="flex flex-col items-center justify-center py-20">
        <p class="text-6xl">🔒</p>
        <p class="mt-4 text-lg font-bold text-red-300">无法加入私人牌桌</p>
        <p class="mt-2 text-sm text-slate-400">{{ resolveError }}</p>
        <RouterLink
          class="mt-6 rounded-lg bg-emerald-500 px-6 py-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-400"
          to="/"
        >
          返回大厅
        </RouterLink>
      </div>

      <div v-else-if="resolving" class="flex flex-col items-center justify-center py-20">
        <div class="h-10 w-10 animate-spin rounded-full border-4 border-purple-400/20 border-t-purple-400" />
        <p class="mt-4 text-lg font-bold text-purple-200">正在解析邀请链接…</p>
      </div>

      <div v-else class="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div class="relative min-w-[320px] overflow-x-auto">
          <PokerTable
            :seats="pokerStore.state.seats"
            :board="pokerStore.state.board"
            :pot="pokerStore.state.pot"
            :street="pokerStore.state.street"
            :player-id="pokerStore.playerId.value"
            :acting-player-id="activePlayerId"
            :action-version="pokerStore.actionVersion.value"
            :hole-cards="pokerStore.state.holeCards"
            :revealed-cards="pokerStore.state.revealedCards"
          />

          <div
            v-if="pokerStore.frozen.value || pokerStore.connectionStatus.value === 'RECONNECTING'"
            class="absolute inset-0 z-50 flex select-none flex-col items-center justify-center rounded-[3rem] bg-slate-950/80 backdrop-blur-sm"
          >
            <div class="h-10 w-10 animate-spin rounded-full border-4 border-emerald-400/20 border-t-emerald-400" />
            <p class="mt-4 text-lg font-bold text-emerald-200">Reconnecting…</p>
            <p v-if="pokerStore.reconnectAttempt.value > 0" class="mt-1 text-sm text-slate-400">
              第 {{ pokerStore.reconnectAttempt.value }} 次重连尝试
            </p>
            <p class="mt-1 text-xs text-slate-500">请勿刷新页面</p>
          </div>
        </div>

        <aside class="space-y-4">
          <section v-if="showConnectPanel" class="rounded-2xl border border-white/10 bg-slate-950/80 p-4 shadow-xl">
            <label class="text-xs font-bold uppercase tracking-wider text-slate-400" for="name">玩家昵称</label>
            <div class="mt-2 flex gap-2">
              <input
                id="name"
                v-model="nameInput"
                :disabled="Boolean(pokerStore.playerId) && connected"
                class="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none ring-amber-300 focus:ring-2 disabled:opacity-60"
                maxlength="24"
              />
              <button
                class="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-bold text-emerald-950 disabled:opacity-50"
                :disabled="connected && Boolean(pokerStore.playerId)"
                @click="connect"
              >
                {{ connected && isSpectator ? '加入' : '连接' }}
              </button>
            </div>
            <button
              class="mt-3 w-full rounded-lg border border-amber-300/30 bg-amber-400/15 px-3 py-2 text-sm font-bold text-amber-100 disabled:opacity-40"
              :disabled="!connected || pokerStore.state.seats.length < 2 || !pokerStore.playerId"
              @click="pokerStore.start"
            >
              开始下一局
            </button>
            <p v-if="isSpectator" class="mt-2 text-center text-xs text-amber-300/70">旁观模式 · 输入昵称后点击"加入"入座</p>
          </section>

          <BettingPanel
            :connected="connected && !pokerStore.frozen.value"
            :request="pokerStore.isMyTurn ? pokerStore.state.actionRequest : null"
            :seat="pokerStore.mySeat.value"
            @action="pokerStore.action"
          />

          <section class="rounded-2xl border border-white/10 bg-slate-950/80 p-4 text-xs shadow-xl">
            <p class="font-bold tracking-wider text-slate-300">原始事件流</p>
            <ol class="mt-2 space-y-1 font-mono text-slate-400">
              <li v-for="event in pokerStore.state.eventLog" :key="event">{{ event }}</li>
              <li v-if="pokerStore.state.eventLog.length === 0" class="text-slate-600">等待服务端事件</li>
            </ol>
          </section>
        </aside>
      </div>
    </div>
  </main>
</template>