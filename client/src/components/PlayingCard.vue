<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ card?: string; hidden?: boolean; compact?: boolean }>(), {
  card: undefined,
  hidden: false,
  compact: false,
})

const parsed = computed(() => {
  if (!props.card) return { rank: '?', suit: '?', color: '#dc2626' }
  const rank = props.card.slice(0, -1) === 'T' ? '10' : props.card.slice(0, -1)
  const suitCode = props.card.at(-1) ?? '?'
  const suitMap: Record<string, { symbol: string; color: string }> = {
    s: { symbol: '♠', color: '#18181b' },
    h: { symbol: '♥', color: '#dc2626' },
    d: { symbol: '♦', color: '#dc2626' },
    c: { symbol: '♣', color: '#18181b' },
  }
  const suit = suitMap[suitCode] ?? { symbol: '?', color: '#dc2626' }
  return { rank, symbol: suit.symbol, color: suit.color }
})
</script>

<template>
  <div
    class="flex shrink-0 flex-col justify-between rounded-lg border border-gray-200 bg-white font-serif font-bold shadow-[0_2px_8px_rgba(0,0,0,.18),_0_0_1px_rgba(0,0,0,.12)] transition-transform duration-200 hover:-translate-y-0.5"
    :class="[
      compact ? 'h-11 w-8 p-0.5 text-[10px]' : 'h-20 w-14 sm:h-24 sm:w-16',
      hidden ? 'bg-gradient-to-br from-[#1e3a5f] to-[#0f1f3a] border-blue-300/60 text-blue-100 shadow-[0_2px_8px_rgba(30,58,95,.35)]' : 'text-gray-900',
    ]"
  >
    <template v-if="hidden">
      <div class="flex h-full w-full items-center justify-center">
        <div class="h-6 w-6 rounded-full border border-blue-200/60" />
      </div>
    </template>
    <template v-else>
      <span class="leading-none" :style="{ color: parsed.color }">{{ parsed.rank }}</span>
      <span class="self-center text-2xl sm:text-3xl leading-none drop-shadow-sm" :style="{ color: parsed.color }">{{ parsed.symbol }}</span>
      <span class="self-end leading-none rotate-180" :style="{ color: parsed.color }">{{ parsed.rank }}</span>
    </template>
  </div>
</template>
