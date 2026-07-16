<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import BettingPanel from './components/BettingPanel.vue'
import PokerTable from './components/PokerTable.vue'
import { pokerStore } from './stores/pokerStore'

const nameInput = ref(pokerStore.playerName.value)
const connected = computed(() => pokerStore.connectionStatus.value === 'CONNECTED')
const activePlayerId = computed(() => pokerStore.state.actionRequest?.playerId ?? null)

function connect(): void {
  pokerStore.connect(nameInput.value)
}

onMounted(connect)
onUnmounted(pokerStore.disconnect)
</script>

<template>
  <main class="min-h-screen bg-[radial-gradient(circle_at_top,_#1f3f52,_#080d18_56%)] px-3 py-4 text-slate-100 sm:px-6 sm:py-6">
    <div class="mx-auto max-w-6xl">
      <header class="mb-4 flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 shadow-xl backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="text-xs font-bold tracking-[.28em] text-amber-300">EVENT SOURCED TABLE</p>
          <h1 class="text-xl font-black tracking-wide text-white">德州扑克</h1>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <span class="rounded-full px-3 py-1 font-bold" :class="connected ? 'bg-emerald-400/15 text-emerald-200' : 'bg-amber-400/15 text-amber-200'">{{ pokerStore.connectionStatus }}</span>
          <span class="rounded-full bg-white/5 px-3 py-1 text-slate-300">事件 #{{ pokerStore.lastSeq }}</span>
          <span v-if="pokerStore.playerId" class="rounded-full bg-white/5 px-3 py-1 text-slate-400">已入座</span>
        </div>
      </header>

      <div class="grid gap-4 lg:grid-cols-[1fr_280px]">
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

        <aside class="space-y-4">
          <section class="rounded-2xl border border-white/10 bg-slate-950/80 p-4 shadow-xl">
            <label class="text-xs font-bold uppercase tracking-wider text-slate-400" for="name">玩家昵称</label>
            <div class="mt-2 flex gap-2">
              <input id="name" v-model="nameInput" :disabled="Boolean(pokerStore.playerId)" class="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none ring-amber-300 focus:ring-2 disabled:opacity-60" maxlength="24" />
              <button class="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-bold text-emerald-950 disabled:opacity-50" :disabled="connected" @click="connect">连接</button>
            </div>
            <button class="mt-3 w-full rounded-lg border border-amber-300/30 bg-amber-400/15 px-3 py-2 text-sm font-bold text-amber-100 disabled:opacity-40" :disabled="!connected || pokerStore.state.seats.length < 2" @click="pokerStore.start">开始下一局</button>
          </section>

          <BettingPanel
            :connected="connected"
            :request="pokerStore.isMyTurn ? pokerStore.state.actionRequest : null"
            :seat="pokerStore.mySeat.value"
            @action="pokerStore.action"
          />

          <section class="rounded-2xl border border-white/10 bg-slate-950/80 p-4 text-xs shadow-xl">
            <p class="font-bold tracking-wider text-slate-300">原始事件流</p>
            <p v-if="pokerStore.state.error" class="mt-2 rounded bg-rose-500/15 p-2 text-rose-200">{{ pokerStore.state.error }}</p>
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
