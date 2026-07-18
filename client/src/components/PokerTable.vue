<script setup lang="ts">
import { computed } from 'vue'
import PlayerSeat from './PlayerSeat.vue'
import PlayingCard from './PlayingCard.vue'
import PotDisplay from './PotDisplay.vue'
import type { Card, SeatView } from '../types/protocol'

const props = defineProps<{
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

function seatTransform(seatIndex: number, total: number): { x: string; y: string } {
  const rx = 38
  const ry = 28
  const angle = (seatIndex / total) * Math.PI * 2 - Math.PI / 2
  const x = 50 + rx * Math.cos(angle)
  const y = 50 + ry * Math.sin(angle)
  return { x: `${x.toFixed(1)}%`, y: `${y.toFixed(1)}%` }
}

const seatStyles = computed(() => {
  const total = props.seats.length
  if (total === 0) return []
  return props.seats.map((seat) => {
    const pos = seatTransform(seat.seatIndex, total)
    return { left: pos.x, top: pos.y }
  })
})

const boardCardStyle = (index: number) => ({
  transitionDelay: `${index * 80}ms`,
})
</script>

<template>
  <section class="relative min-h-[520px] overflow-hidden rounded-[3rem] border-[14px] border-[#1c1108] p-3 sm:min-h-[620px] bg-gradient-to-b from-[#241609] to-[#160d05] shadow-felt">
    <!-- 桌面背景：绒面墨绿 + 金色滚边 -->
    <div class="absolute inset-0 rounded-[2.2rem] border-2 border-gold-500/70 bg-[radial-gradient(ellipse_at_center,_theme(colors.felt.600)_0%,_theme(colors.felt.800)_55%,_theme(colors.felt.950)_100%)] shadow-felt" />
    <div class="absolute left-1/2 top-1/2 h-[44%] w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-gold-400/40 bg-black/10 shadow-inner" />

    <!-- 中央信息区 -->
    <div class="absolute left-1/2 top-1/2 z-10 w-full -translate-x-1/2 -translate-y-1/2 text-center">
      <PotDisplay :pot="pot" :street="street" />
      <TransitionGroup
        name="street"
        tag="div"
        class="mt-5 flex justify-center gap-1.5 sm:gap-2"
      >
        <PlayingCard
          v-for="(card, index) in board"
          :key="`${street}-${index}-${card}`"
          :card="card"
          :style="boardCardStyle(index)"
        />
      </TransitionGroup>
      <p v-if="board.length === 0" class="mt-8 text-sm text-gold-200/60">等待翻牌</p>
    </div>

    <!-- 动态座位 -->
    <div
      v-for="(seat, idx) in seats"
      :key="seat.id"
      class="absolute z-20 -translate-x-1/2 -translate-y-1/2 transition-all duration-500"
      :style="seatStyles[idx]"
    >
      <PlayerSeat
        :seat="seat"
        :is-me="seat.id === playerId"
        :is-acting="seat.id === actingPlayerId"
        :action-version="actionVersion"
        :visible-cards="seat.id === playerId ? holeCards : revealedCards[seat.id]"
      />
    </div>

    <!-- 空状态 -->
    <p v-if="seats.length === 0" class="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 translate-y-24 text-sm text-gold-200/60">牌桌空无一人，等待玩家加入…</p>
  </section>
</template>

<style scoped>
.street-enter-active { transition: all .42s cubic-bezier(.2, .8, .2, 1); }
.street-enter-from { opacity: 0; transform: translateY(-24px) scale(.7) rotate(-8deg); }
.street-enter-to { opacity: 1; transform: translateY(0) scale(1) rotate(0); }
</style>