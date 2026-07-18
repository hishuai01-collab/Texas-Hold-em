<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import BettingPanel from '../components/BettingPanel.vue'
import PokerTable from '../components/PokerTable.vue'
import NumberRoller from '../components/ui/NumberRoller.vue'
import ChipStack from '../components/ui/ChipStack.vue'
import { pokerStore } from '../stores/pokerStore'
import { toastStore } from '../stores/toastStore'

const route = useRoute()
const nameInput = ref(pokerStore.playerName.value)
const connected = computed(() => pokerStore.connectionStatus.value === 'CONNECTED')
const activePlayerId = computed(() => pokerStore.state.actionRequest?.playerId ?? null)
const tableId = computed(() => {
  const raw = route.params.id
  return (typeof raw === 'string' && raw.length > 0) ? raw : 'default'
})
const isSpectator = computed(() => pokerStore.playerId.value === null && connected.value)
const showConnectPanel = computed(() => !connected.value || pokerStore.playerId.value === null)

// Simple demo toggles for NumberRoller / ChipStack
const demoAmount = ref(42_357)
const demoStack = ref(8)
function bumpAmount() { demoAmount.value = Math.round(Math.random() * 999_999) }
function bumpStack() { demoStack.value = Math.min(20, Math.max(0, demoStack.value + (Math.random() > 0.5 ? 3 : -2))) }

function connect(): void {
  pokerStore.connect(nameInput.value, tableId.value)
}

watch(
  () => pokerStore.state.error,
  (error) => {
    if (error) toastStore.push(error, 'error')
  },
)

watch(tableId, (next, previous) => {
  if (next === previous) return
  pokerStore.disconnect()
  connect()
})

onMounted(connect)
onUnmounted(pokerStore.disconnect)
</script>

<template>
  <!-- ═══ 纯黑白基调：bg-gray-950, text-gray-100/200, border-gray-800 ═══ -->
  <main class="min-h-screen bg-gray-950 px-3 py-4 text-gray-100 sm:px-6 sm:py-6">
    <div class="mx-auto max-w-6xl">
      <!-- ── 头部 ── -->
      <header class="mb-4 flex flex-col gap-3 border-b border-gray-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <RouterLink class="font-mono text-[10px] tracking-[.24em] text-gray-500 hover:text-gray-100" to="/">← LOBBY</RouterLink>
          <p class="mt-3 text-xs font-bold tracking-[.28em] text-gray-400">TABLE / {{ tableId }}</p>
          <h1 class="mt-1 text-xl font-black tracking-wide text-gray-100">德州扑克</h1>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <span
            class="rounded-full px-3 py-1 font-bold"
            :class="connected ? 'bg-gray-800 text-gray-300' : 'bg-gray-800 text-gray-400'"
          >
            {{ pokerStore.connectionStatus }}
            <span v-if="pokerStore.reconnectAttempt.value > 0"> ({{ pokerStore.reconnectAttempt.value }})</span>
          </span>
          <span class="rounded-full bg-gray-900 px-3 py-1 text-gray-400">事件 #{{ pokerStore.lastSeq }}</span>
          <span v-if="pokerStore.playerId" class="rounded-full bg-gray-900 px-3 py-1 text-gray-400">已入座</span>
          <span v-else-if="connected" class="rounded-full bg-gray-900 px-3 py-1 text-gray-400">旁观</span>
        </div>
      </header>

      <div class="grid gap-4 lg:grid-cols-[1fr_280px]">
        <!-- ── 牌桌区域 ── -->
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

          <!-- ── 组件演示区域 ── -->
          <section class="mt-4 rounded-2xl border border-gray-800 bg-gray-950 p-4 shadow-xl">
            <p class="mb-3 text-xs font-bold tracking-wider text-gray-400">MONOCHROME UI COMPONENTS</p>
            <div class="flex flex-wrap items-end gap-6">
              <!-- NumberRoller 演示 -->
              <div class="space-y-2">
                <p class="text-[10px] text-gray-500">NumberRoller</p>
                <div class="flex items-baseline gap-3">
                  <NumberRoller :value="demoAmount" class="text-2xl font-bold tracking-tight" />
                  <button
                    class="rounded border border-gray-700 bg-gray-900 px-2 py-0.5 text-[11px] text-gray-400 hover:bg-gray-800"
                    @click="bumpAmount"
                  >RAND</button>
                </div>
              </div>
              <!-- ChipStack 演示 -->
              <div class="space-y-2">
                <p class="text-[10px] text-gray-500">ChipStack</p>
                <div class="flex items-center gap-3">
                  <ChipStack :value="demoStack" />
                  <button
                    class="rounded border border-gray-700 bg-gray-900 px-2 py-0.5 text-[11px] text-gray-400 hover:bg-gray-800"
                    @click="bumpStack"
                  >TOGGLE</button>
                </div>
              </div>
            </div>
          </section>

          <!-- ── 重连覆盖层（保留原始逻辑） ── -->
          <div
            v-if="pokerStore.frozen.value || pokerStore.connectionStatus.value === 'RECONNECTING'"
            class="absolute inset-0 z-50 flex select-none flex-col items-center justify-center rounded-[3rem] bg-gray-950/90 backdrop-blur-sm"
          >
            <div class="h-10 w-10 animate-spin rounded-full border-4 border-gray-700 border-t-gray-300" />
            <p class="mt-4 text-lg font-bold text-gray-300">Reconnecting…</p>
            <p v-if="pokerStore.reconnectAttempt.value > 0" class="mt-1 text-sm text-gray-500">
              第 {{ pokerStore.reconnectAttempt.value }} 次重连尝试
            </p>
            <p class="mt-1 text-xs text-gray-600">请勿刷新页面</p>
          </div>
        </div>

        <!-- ── 侧栏 ── -->
        <aside class="space-y-4">
          <!-- 连接面板（黑白化） -->
          <section v-if="showConnectPanel" class="rounded-2xl border border-gray-800 bg-gray-950 p-4 shadow-xl">
            <label class="text-xs font-bold uppercase tracking-wider text-gray-400" for="name">玩家昵称</label>
            <div class="mt-2 flex gap-2">
              <input
                id="name"
                v-model="nameInput"
                :disabled="Boolean(pokerStore.playerId) && connected"
                class="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 outline-none ring-gray-500 focus:ring-2 disabled:opacity-60"
                maxlength="24"
              />
              <button
                class="rounded-lg bg-gray-700 px-3 py-2 text-sm font-bold text-gray-200 disabled:opacity-50 hover:bg-gray-600"
                :disabled="connected && Boolean(pokerStore.playerId)"
                @click="connect"
              >
                {{ connected && isSpectator ? '加入' : '连接' }}
              </button>
            </div>
            <button
              class="mt-3 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm font-bold text-gray-300 disabled:opacity-40 hover:bg-gray-800"
              :disabled="!connected || pokerStore.state.seats.length < 2 || !pokerStore.playerId"
              @click="pokerStore.start"
            >
              开始下一局
            </button>
            <p v-if="isSpectator" class="mt-2 text-center text-xs text-gray-500">旁观模式 · 输入昵称后点击“加入”入座</p>
          </section>

          <BettingPanel
            :connected="connected && !pokerStore.frozen.value"
            :request="pokerStore.isMyTurn ? pokerStore.state.actionRequest : null"
            :seat="pokerStore.mySeat.value"
            @action="pokerStore.action"
          />

          <section class="rounded-2xl border border-gray-800 bg-gray-950 p-4 text-xs shadow-xl">
            <p class="font-bold tracking-wider text-gray-400">原始事件流</p>
            <ol class="mt-2 space-y-1 font-mono text-gray-500">
              <li v-for="event in pokerStore.state.eventLog" :key="event">{{ event }}</li>
              <li v-if="pokerStore.state.eventLog.length === 0" class="text-gray-600">等待服务端事件</li>
            </ol>
          </section>
        </aside>
      </div>
    </div>
  </main>
</template>