<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { seatStore } from '../stores/seatStore'

const route = useRoute()
const router = useRouter()
const tableId = computed(() => typeof route.params.id === 'string' ? route.params.id : '')

function confirmSeat(): void {
  if (!tableId.value) return
  seatStore.confirm(tableId.value)
  void router.push({ name: 'table', params: { id: tableId.value } })
}
</script>

<template>
  <main class="ui-page seat-page">
    <section class="ui-panel seat-panel" aria-labelledby="seat-title">
      <RouterLink class="back-btn" :to="{ name: 'room-list' }">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
        <span>返回房间</span>
      </RouterLink>
      <p class="eyebrow">德州扑克 / 房间确认</p>
      <h1 id="seat-title">确认坐下</h1>

      <div class="seat-preview">
        <div class="seat-preview__table">
          <span class="seat-preview__button" />
          <span class="seat-preview__label">TABLE</span>
          <span class="seat-preview__id">{{ tableId }}</span>
        </div>
        <dl class="seat-meta">
          <div><dt>盲注</dt><dd>5 / 10</dd></div>
          <div><dt>人数</dt><dd>自动分配</dd></div>
          <div><dt>座位</dt><dd>由牌桌自动分配</dd></div>
        </dl>
      </div>

      <p class="intro">确认后才会连接牌桌并占用座位。连接中断时，客户端会保护当前操作并尝试恢复。</p>
      <button class="ui-button ui-button--primary" type="button" @click="confirmSeat">确认坐下</button>
    </section>
  </main>
</template>

<style scoped>
.seat-page { display: grid; min-height: 100dvh; place-items: center; padding: 24px; }
.seat-panel { width: min(100%, 520px); padding: 32px; }
.back-btn { display: inline-flex; align-items: center; gap: 8px; color: var(--color-text-muted); font-size: 12px; text-decoration: none; }
.back-btn:hover { color: var(--color-text); }
.back-btn svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.eyebrow { margin: 28px 0 0; color: var(--color-text-muted); font-family: var(--font-mono, monospace); font-size: 11px; font-weight: 700; letter-spacing: .16em; }
h1 { margin: 12px 0 0; font-family: var(--font-display, sans-serif); font-size: 32px; line-height: 1.1; }

.seat-preview { display: grid; gap: 16px; margin: 24px 0; }
.seat-preview__table { position: relative; overflow: hidden; border: 1px solid var(--color-border); border-radius: 999px; padding: 18px 12px; text-align: center; background: linear-gradient(180deg, var(--color-surface-raised), var(--color-surface)); }
.seat-preview__button { display: block; margin: 0 auto 10px; width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--color-border); background: var(--color-surface); }
.seat-preview__label { display: block; color: var(--color-text-muted); font-family: var(--font-mono, monospace); font-size: 10px; letter-spacing: .18em; }
.seat-preview__id { display: block; margin-top: 4px; color: var(--color-text); font-family: var(--font-mono, monospace); font-size: 13px; }
.seat-meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.seat-meta div { border-top: 1px solid var(--color-border); padding-top: 12px; text-align: center; }
.seat-meta dt { color: var(--color-text-muted); font-size: 11px; }
.seat-meta dd { margin: 6px 0 0; color: var(--color-text); font-family: var(--font-mono, monospace); font-size: 13px; }

.intro { margin: 20px 0; color: var(--color-text-muted); font-size: 14px; line-height: 1.5; }
.ui-button { width: 100%; }
</style>
