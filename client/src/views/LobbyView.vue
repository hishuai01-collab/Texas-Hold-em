<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { lobbyStore } from '../stores/lobbyStore'
import { userStore } from '../stores/userStore'

const { tables, loading } = lobbyStore

const balanceLabel = computed(() => {
  if (userStore.status.value === 'loading') return 'LOADING'
  if (userStore.balance.value === null) return '—'
  return userStore.balance.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
})

function statusLabel(table: { status: string; players: number; maxPlayers: number }): string {
  if (table.status === 'FULL' || table.players >= table.maxPlayers) return 'FULL'
  if (table.status === 'RUNNING') return 'IN GAME'
  return 'OPEN'
}

onMounted(() => {
  void lobbyStore.refresh()
})
</script>

<template>
  <main class="min-h-screen bg-[#080d18] px-4 py-5 text-slate-100 sm:px-8 sm:py-8">
    <div class="mx-auto max-w-6xl">
      <header class="flex flex-col gap-5 border-b border-slate-800 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="font-mono text-[11px] font-semibold tracking-[.3em] text-slate-500">POKER / LOBBY</p>
          <h1 class="mt-3 text-3xl font-semibold tracking-tight text-white">游戏大厅</h1>
          <p class="mt-2 text-sm text-slate-500">选择一张牌桌加入游戏。</p>
        </div>
        <section class="border border-slate-800 bg-slate-950 px-4 py-3 sm:min-w-52" aria-label="User Wallet">
          <p class="font-mono text-[10px] tracking-[.24em] text-slate-600">USER WALLET</p>
          <div class="mt-2 flex items-baseline justify-between gap-4">
            <span class="text-sm text-slate-400">{{ userStore.user.value?.name ?? 'GUEST' }}</span>
            <span class="font-mono text-lg text-white">{{ balanceLabel }}</span>
          </div>
          <p class="mt-1 text-right font-mono text-[10px] text-slate-600">BALANCE</p>
        </section>
      </header>

      <section class="mt-8" aria-labelledby="tables-title">
        <div class="mb-3 flex items-center justify-between">
          <div>
            <h2 id="tables-title" class="font-mono text-xs tracking-[.2em] text-slate-400">AVAILABLE TABLES</h2>
            <p class="mt-1 text-xs text-slate-600">{{ lobbyStore.tables.value.length }} tables indexed</p>
          </div>
          <button
            class="font-mono text-xs text-slate-500 transition hover:text-white disabled:cursor-wait disabled:opacity-50"
              :disabled="loading"
              @click="lobbyStore.refresh"
          >
            {{ loading ? 'SYNCING...' : 'REFRESH' }}
          </button>
        </div>

        <div class="overflow-x-auto border border-slate-800 bg-slate-950/60">
          <table class="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead class="border-b border-slate-800 font-mono text-[10px] tracking-[.16em] text-slate-600">
              <tr>
                <th class="px-5 py-4 font-medium">TABLE</th>
                <th class="px-5 py-4 font-medium">BLINDS</th>
                <th class="px-5 py-4 font-medium">PLAYERS</th>
                <th class="px-5 py-4 font-medium">STATUS</th>
                <th class="px-5 py-4 text-right font-medium">ACTION</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-900">
              <tr v-for="table in tables" :key="table.id" class="group transition hover:bg-white/[.03]">
                <td class="px-5 py-5 font-mono text-slate-200">{{ table.id }}</td>
                <td class="px-5 py-5 font-mono text-slate-400">{{ table.smallBlind }} / {{ table.bigBlind }}</td>
                <td class="px-5 py-5 font-mono text-slate-400">{{ table.players }} / {{ table.maxPlayers }}</td>
                <td class="px-5 py-5">
                  <span
                    class="font-mono text-[11px]"
                    :class="statusLabel(table) === 'OPEN' ? 'text-emerald-400' : 'text-slate-600'"
                  >
                    {{ statusLabel(table) }}
                  </span>
                </td>
                <td class="px-5 py-5 text-right">
                  <RouterLink
                    v-if="statusLabel(table) === 'OPEN'"
                    class="font-mono text-xs text-white underline decoration-slate-700 underline-offset-4 transition hover:decoration-white"
                    :to="{ name: 'table', params: { id: table.id } }"
                  >
                    JOIN →
                  </RouterLink>
                  <span v-else class="font-mono text-xs text-slate-700">UNAVAILABLE</span>
                </td>
              </tr>
              <tr v-if="tables.length === 0">
                <td colspan="5" class="px-5 py-12 text-center font-mono text-xs text-slate-600">NO TABLES FOUND</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </main>
</template>
