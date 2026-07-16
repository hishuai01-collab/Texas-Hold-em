<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ card?: string; hidden?: boolean; compact?: boolean }>(), {
  card: undefined,
  hidden: false,
  compact: false,
})

const parsed = computed(() => {
  if (!props.card) return { rank: '?', suit: '?' }
  const rank = props.card.slice(0, -1) === 'T' ? '10' : props.card.slice(0, -1)
  const suit = props.card.at(-1) ?? '?'
  return { rank, suit: ({ s: '♠', h: '♥', d: '♦', c: '♣' } as Record<string, string>)[suit] ?? '?' }
})
const red = computed(() => ['♥', '♦'].includes(parsed.value.suit))
</script>

<template>
  <div
    class="flex shrink-0 flex-col justify-between rounded-md border font-serif font-bold shadow-sm"
    :class="[
      compact ? 'h-11 w-8 p-1 text-sm' : 'h-20 w-14 p-1.5 text-xl sm:h-24 sm:w-16',
      hidden ? 'border-emerald-300/40 bg-[repeating-linear-gradient(45deg,#0d5d43,#0d5d43_4px,#0a3d2e_4px,#0a3d2e_8px)] text-emerald-100' : 'border-stone-300 bg-stone-50',
      red && !hidden ? 'text-rose-600' : !hidden ? 'text-slate-900' : '',
    ]"
  >
    <template v-if="hidden"><span>♠</span><span class="self-end">♣</span></template>
    <template v-else><span>{{ parsed.rank }}</span><span class="self-end">{{ parsed.suit }}</span></template>
  </div>
</template>
