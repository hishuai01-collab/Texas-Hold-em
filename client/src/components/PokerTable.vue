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
  <section class="relative min-h-[540px] overflow-hidden rounded-[3rem] border-[18px] border-[#2a1a0e] p-3 sm:min-h-[640px] shadow-[0_20px_60px_rgba(0,0,0,.55)]" style="box-shadow: 0 20px 60px rgba(0,0,0,.55), inset 0 2px 0 rgba(251,191,36,.15);">
    <!-- 木质边框纹理 -->
    <div class="pointer-events-none absolute -inset-[18px] rounded-[3.2rem] bg-gradient-to-br from-[#3d2818] via-[#2a1a0e] to-[#3d2818]" aria-hidden="true" />
    <!-- 真实绿呢绒桌面纹理 -->
    <div class="absolute inset-0 rounded-[2.2rem] bg-[#1a6b3a] shadow-neonGold">
      <!-- 呢绒纤维纹理 -->
      <div class="absolute inset-0 rounded-[2.2rem] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PHBhdGggZD0iTTAgMGg0MHY0MEgwVjB6bTIgMjBoMnYyMEgyVjR6IiBmaWxsPSIjMWQ1OTNiIi8+PC9zdmc+')] opacity-35 mix-blend-overlay" />
      <!-- 径向光晕（桌面中心高光） -->
      <div class="absolute inset-0 rounded-[2.2rem] bg-[radial-gradient(ellipse_at_50%_45%,rgba(255,255,255,.14)_0%,transparent_55%)]" />
      <!-- 桌面凹陷效果 -->
      <div class="pointer-events-none absolute inset-3 rounded-[2rem] border border-black/25 shadow-[inset_0_4px_16px_rgba(0,0,0,.38),inset_0_-3px_10px_rgba(255,255,255,.05)]" />
      <!-- 金属边条 -->
      <div class="pointer-events-none absolute inset-0 rounded-[2.3rem] border-[3px] border-[#c9a85c]" />
    </div>

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
       <p v-if="board.length === 0" class="mt-8 text-sm text-white/60">等待翻牌</p>
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
     <p v-if="seats.length === 0" class="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 translate-y-24 text-sm text-white/60">牌桌空无一人，等待玩家加入…</p>
  </section>
</template>

<style scoped>
.street-enter-active { transition: all .42s cubic-bezier(.2, .8, .2, 1); }
.street-enter-from { opacity: 0; transform: translateY(-24px) scale(.7) rotate(-8deg); }
.street-enter-to { opacity: 1; transform: translateY(0) scale(1) rotate(0); }
</style>