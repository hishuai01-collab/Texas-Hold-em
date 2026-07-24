<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { RouterLink } from 'vue-router'
import PlatformTabBar from '../components/PlatformTabBar.vue'
import { lobbyStore } from '../stores/lobbyStore'
import { userStore } from '../stores/userStore'

const router = useRouter()

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

function goBack(): void {
  void router.back()
}

onMounted(() => {
  void lobbyStore.refresh()
})
</script>

<template>
  <main class="ui-page lobby-page">
    <div class="mx-auto max-w-6xl">
      <header class="flex flex-col gap-5 border-b border-amber-300/20 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <button class="back-btn" type="button" @click="goBack" aria-label="返回上一页">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
          </button>
          <RouterLink class="font-mono text-[11px] font-semibold tracking-[.3em] text-amber-300/90 hover:text-amber-200" :to="{ name: 'app-home' }">德州扑克</RouterLink>
          <h1 class="mt-3 text-3xl font-semibold tracking-tight text-white">选择房间</h1>
          <p class="mt-2 text-sm text-gray-400">选择房间后确认坐下，再加入牌桌。</p>
        </div>
        <section class="border border-amber-400/25 bg-gradient-to-br from-gray-900 to-gray-800 px-4 py-3 sm:min-w-52 shadow-[0_4px_20px_rgba(251,191,36,.08)]">
          <p class="font-mono text-[10px] tracking-[.24em] text-amber-300/80">玩家钱包</p>
          <div class="mt-2 flex items-baseline justify-between gap-4">
            <span class="text-sm text-gray-200">{{ userStore.user.value?.name ?? '访客' }}</span>
            <span class="font-mono text-lg text-amber-200">{{ balanceLabel }}</span>
          </div>
          <p class="mt-1 text-right font-mono text-[10px] text-gray-500">余额</p>
        </section>
      </header>

      <section class="mt-8" aria-labelledby="tables-title">
        <div class="mb-3 flex items-center justify-between">
          <div>
            <h2 id="tables-title" class="font-mono text-xs tracking-[.2em] text-amber-200/90">可加入牌桌</h2>
            <p class="mt-1 text-xs text-gray-400">已发现 {{ lobbyStore.tables.value.length }} 张牌桌</p>
          </div>
          <button
            class="font-mono text-xs text-amber-300/85 transition hover:text-white disabled:cursor-wait disabled:opacity-50"
            :disabled="loading"
            @click="lobbyStore.refresh"
          >
            {{ loading ? '正在同步…' : '刷新' }}
          </button>
        </div>

        <div class="overflow-x-auto border border-amber-400/20 bg-gradient-to-b from-gray-900/95 to-gray-800/95">
          <table class="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead class="border-b border-amber-300/15 font-mono text-[10px] tracking-[.16em] text-amber-200/80">
              <tr>
                <th class="px-5 py-4 font-medium">牌桌</th>
                <th class="px-5 py-4 font-medium">盲注</th>
                <th class="px-5 py-4 font-medium">玩家</th>
                <th class="px-5 py-4 font-medium">状态</th>
                <th class="px-5 py-4 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-amber-300/10">
              <tr v-for="table in tables" :key="table.id" class="group transition hover:bg-white/[.03]">
                <td class="px-5 py-5 font-mono text-amber-100">{{ table.id }}</td>
                <td class="px-5 py-5 font-mono text-gray-300">{{ table.smallBlind }} / {{ table.bigBlind }}</td>
                <td class="px-5 py-5 font-mono text-gray-300">{{ table.players }} / {{ table.maxPlayers }}</td>
                <td class="px-5 py-5">
                  <span
                    class="font-mono text-[11px]"
                    :class="statusLabel(table) === '开放' ? 'text-emerald-300 shadow-[0_0_8px_rgba(52,211,153,.3)]' : 'text-gray-500'"
                  >
                    {{ statusLabel(table) }}
                  </span>
                </td>
                <td class="px-5 py-5 text-right">
                  <RouterLink
                    v-if="statusLabel(table) === '开放'"
                    class="font-mono text-xs font-bold text-amber-200 underline decoration-amber-400/50 underline-offset-4 transition hover:text-white hover:decoration-amber-300"
                    :to="{ name: 'room-seat', params: { id: table.id } }"
                  >
                    加入 →
                  </RouterLink>
                  <span v-else class="font-mono text-xs text-gray-600">暂不可用</span>
                </td>
              </tr>
              <tr v-if="tables.length === 0 && !loading">
                <td colspan="5" class="px-5 py-12 text-center font-mono text-xs text-gray-600">暂无可加入的牌桌</td>
              </tr>
              <tr v-if="loading">
                <td colspan="5" class="px-5 py-5"><div class="h-10 w-full animate-skeleton rounded bg-gray-800 border border-amber-300/15" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <PlatformTabBar />
  </main>
</template>

<style scoped>
.back-btn { display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface-raised); color: var(--color-text-muted); cursor: pointer; transition: border-color 180ms ease, color 180ms ease; margin-bottom: 8px; }
.back-btn:hover { border-color: var(--color-border-strong); color: var(--color-text); }
.back-btn svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.lobby-page { padding-bottom: 80px; }
</style>
