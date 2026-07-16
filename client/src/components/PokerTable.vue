<script setup lang="ts">
import PlayerSeat from './PlayerSeat.vue'
import PlayingCard from './PlayingCard.vue'
import type { Card, SeatView } from '../types/protocol'

defineProps<{
  seats: SeatView[]
  board: Card[]
  pot: number
  street: string
  playerId: string | null
  actingPlayerId: string | null
  actionVersion: number
  holeCards: Card[]
  revealedCards: Record<string, Card[]>
}>()

const seatPositions = ['top-2 left-1/2 -translate-x-1/2', 'top-16 right-1 sm:right-8', 'bottom-20 right-1 sm:right-8', 'bottom-2 left-1/2 -translate-x-1/2', 'bottom-20 left-1 sm:left-8', 'top-16 left-1 sm:left-8']
</script>

<template>
  <section class="relative min-h-[620px] overflow-hidden rounded-[3rem] border-[14px] border-amber-950 bg-emerald-800 p-3 shadow-felt sm:min-h-[680px]">
    <div class="absolute inset-0 rounded-[2.2rem] border border-emerald-300/20 bg-[radial-gradient(ellipse_at_center,_rgba(35,151,93,.5),_rgba(1,55,37,.9))]" />
    <div class="absolute left-1/2 top-1/2 h-[44%] w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-4 border-amber-200/30 bg-emerald-700/45 shadow-inner" />
    <div class="absolute left-1/2 top-1/2 z-10 w-full -translate-x-1/2 -translate-y-1/2 text-center">
      <p class="text-xs font-bold tracking-[.35em] text-emerald-100/70">{{ street }}</p>
      <p class="mt-1 text-xl font-black tracking-wide text-amber-100">底池 <span class="tabular-nums text-amber-300">{{ pot }}</span></p>
      <TransitionGroup name="street" tag="div" class="mt-5 flex justify-center gap-1.5 sm:gap-2">
        <PlayingCard v-for="(card, index) in board" :key="`${street}-${index}-${card}`" :card="card" />
      </TransitionGroup>
      <p v-if="board.length === 0" class="mt-8 text-sm text-emerald-100/60">等待翻牌</p>
    </div>
    <div v-for="seat in seats" :key="seat.id" class="absolute z-20" :class="seatPositions[seat.seatIndex % seatPositions.length]">
      <PlayerSeat :seat="seat" :is-me="seat.id === playerId" :is-acting="seat.id === actingPlayerId" :action-version="actionVersion" :visible-cards="seat.id === playerId ? holeCards : revealedCards[seat.id]" />
    </div>
    <p v-if="seats.length === 0" class="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 translate-y-24 text-sm text-emerald-100/70">正在等候玩家入座…</p>
  </section>
</template>

<style scoped>
.street-enter-active { transition: all .42s cubic-bezier(.2, .8, .2, 1); }
.street-enter-from { opacity: 0; transform: translateY(-24px) scale(.7) rotate(-8deg); }
.street-enter-to { opacity: 1; transform: translateY(0) scale(1) rotate(0); }
</style>
