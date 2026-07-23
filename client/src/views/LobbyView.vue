<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { lobbyStore } from '../stores/lobbyStore'
import { userStore } from '../stores/userStore'

const { tables, loading } = lobbyStore

const balanceLabel = computed(() => {
  if (userStore.status.value === 'loading') return '正在加载'
  if (userStore.balance.value === null) return '—'
  return userStore.balance.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
})

function statusLabel(table: { status: string; players: number; maxPlayers: number }): string {
  if (table.status === 'FULL' || table.players >= table.maxPlayers) return '已满'
  if (table.status === 'RUNNING') return '进行中'
  return '开放'
}

onMounted(() => {
  void lobbyStore.refresh()
})
</script>

<template>
  <main class="ui-page px-4 py-5 sm:px-8 sm:py-8">
    <div class="mx-auto max-w-6xl">
      <header class="flex flex-col gap-5 border-b border-gray-700/40 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <RouterLink class="font-mono text-[11px] font-semibold tracking-[.3em] text-gray-400" :to="{ name: 'game-hub' }">德州扑克</RouterLink>
          <h1 class="mt-3 text-3xl font-semibold tracking-tight text-white">选择房间</h1>
          <p class="mt-2 text-sm text-gray-500">选择房间后确认坐下，再加入牌桌。</p>
        </div>
        <section class="border border-gray-700/40 bg-gray-950 px-4 py-3 sm:min-w-52" aria-label="User Wallet">
          <p class="font-mono text-[10px] tracking-[.24em] text-gray-500">玩家钱包</p>
          <div class="mt-2 flex items-baseline justify-between gap-4">
            <span class="text-sm text-gray-400">{{ userStore.user.value?.name ?? '访客' }}</span>
            <span class="font-mono text-lg text-gray-200">{{ balanceLabel }}</span>
          </div>
          <p class="mt-1 text-right font-mono text-[10px] text-gray-600">余额</p>
        </section>
      </header>

      <section class="mt-8" aria-labelledby="tables-title">
        <div class="mb-3 flex items-center justify-between">
          <div>
            <h2 id="tables-title" class="font-mono text-xs tracking-[.2em] text-slate-400">可加入牌桌</h2>
            <p class="mt-1 text-xs text-slate-600">已发现 {{ lobbyStore.tables.value.length }} 张牌桌</p>
          </div>
          <button
            class="font-mono text-xs text-slate-500 transition hover:text-white disabled:cursor-wait disabled:opacity-50"
              :disabled="loading"
              @click="lobbyStore.refresh"
          >
            {{ loading ? '正在同步…' : '刷新' }}
          </button>
        </div>

        <div class="overflow-x-auto border border-gray-700/30 bg-gray-950/60">
          <table class="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead class="border-b border-gray-700/30 font-mono text-[10px] tracking-[.16em] text-gray-500/80">
              <tr>
                <th class="px-5 py-4 font-medium">牌桌</th>
                <th class="px-5 py-4 font-medium">盲注</th>
                <th class="px-5 py-4 font-medium">玩家</th>
                <th class="px-5 py-4 font-medium">状态</th>
                <th class="px-5 py-4 text-right font-medium">操作</th>
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
                    :class="statusLabel(table) === '开放' ? 'text-emerald-400' : 'text-slate-600'"
                  >
                    {{ statusLabel(table) }}
                  </span>
                </td>
                <td class="px-5 py-5 text-right">
                  <RouterLink
                    v-if="statusLabel(table) === '开放'"
                    class="font-mono text-xs font-bold text-gray-300 underline decoration-gray-700 underline-offset-4 transition hover:text-white hover:decoration-gray-500"
                    :to="{ name: 'room-seat', params: { id: table.id } }"
                  >
                    加入 →
                  </RouterLink>
                  <span v-else class="font-mono text-xs text-slate-700">暂不可用</span>
                </td>
              </tr>
              <tr v-if="tables.length === 0 && !loading">
                <td colspan="5" class="px-5 py-12 text-center font-mono text-xs text-slate-600">暂无可加入的牌桌</td>
              </tr>
              <tr v-if="loading">
                <td colspan="5" class="px-5 py-5"><div class="h-10 w-full animate-skeleton rounded bg-slate-800" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </main>
</template>
