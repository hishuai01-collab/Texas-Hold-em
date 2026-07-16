<script setup lang="ts">
import PlayingCard from './PlayingCard.vue'
import type { SeatView } from '../types/protocol'

defineProps<{
  seat: SeatView
  isMe: boolean
  isActing: boolean
  actionVersion: number
  visibleCards?: string[]
}>()
</script>

<template>
  <article
    class="relative w-36 rounded-2xl border px-3 py-2 text-left shadow-lg transition duration-300 sm:w-44"
    :class="[
      seat.folded ? 'border-white/10 bg-slate-950/65 opacity-45 grayscale' : 'border-white/15 bg-slate-950/85',
      isMe ? 'ring-2 ring-amber-300/80' : '',
      isActing ? 'seat-active border-amber-300 bg-slate-900 ring-2 ring-amber-200' : '',
    ]"
  >
    <div v-if="isActing" :key="actionVersion" class="turn-timer" aria-label="轮到该玩家行动" />
    <div class="flex items-center gap-1.5 pr-5">
      <span class="h-2.5 w-2.5 rounded-full" :class="seat.folded ? 'bg-slate-500' : seat.allIn ? 'bg-violet-400' : 'bg-emerald-400'" />
      <p class="truncate text-sm font-bold text-white">{{ seat.name }}<span v-if="isMe" class="ml-1 text-amber-200">你</span></p>
    </div>
    <p class="mt-1 text-xs tabular-nums text-emerald-200">筹码 {{ seat.chips.toLocaleString() }}</p>
    <p class="text-[11px] text-slate-400">本街 {{ seat.betThisStreet }} · 总投入 {{ seat.contributed }}</p>
    <p v-if="seat.folded" class="mt-1 text-[10px] font-semibold tracking-widest text-slate-400">FOLDED</p>
    <p v-else-if="seat.allIn" class="mt-1 text-[10px] font-semibold tracking-widest text-violet-300">ALL IN</p>
    <div class="mt-2 flex -space-x-1.5">
      <PlayingCard v-for="(card, index) in visibleCards?.length ? visibleCards : ['hidden-1', 'hidden-2']" :key="`${card}-${index}`" :card="card" :hidden="!visibleCards?.length" compact />
    </div>
  </article>
</template>

<style scoped>
.seat-active { animation: seat-glow 1.3s ease-in-out infinite alternate; }
.turn-timer { position: absolute; top: -7px; right: -7px; width: 28px; height: 28px; border-radius: 9999px; background: conic-gradient(#fcd34d 0deg, #fcd34d 360deg, transparent 360deg); mask: radial-gradient(transparent 51%, #000 54%); animation: countdown 15s linear forwards; }
@keyframes countdown { from { background: conic-gradient(#fcd34d 360deg, transparent 0deg); } to { background: conic-gradient(#fcd34d 0deg, transparent 0deg); } }
@keyframes seat-glow { from { box-shadow: 0 0 8px rgba(252, 211, 77, .45); } to { box-shadow: 0 0 28px rgba(252, 211, 77, .9); } }
</style>
