<script setup lang="ts">
import { ref, watch } from 'vue'
import PlayingCard from './PlayingCard.vue'
import type { SeatView } from '../types/protocol'

const props = defineProps<{
  seat: SeatView
  isMe: boolean
  isActing: boolean
  actionVersion: number
  visibleCards?: string[]
}>()

/** 筹码数字变化动画 */
const chipsAnimating = ref(false)
const prevChips = ref(props.seat.chips)
watch(
  () => props.seat.chips,
  (newVal, oldVal) => {
    if (oldVal !== undefined && newVal !== oldVal) {
      prevChips.value = oldVal
      chipsAnimating.value = true
      setTimeout(() => (chipsAnimating.value = false), 400)
    }
  },
)

/** 发牌飞行动画 */
const cardFlyKey = ref(0)
watch(
  () => props.visibleCards,
  () => { cardFlyKey.value += 1 },
  { deep: true },
)
</script>

<template>
  <article
    class="relative min-w-[140px] rounded-xl border border-gray-600/40 bg-gray-900/95 px-3 py-2.5 text-left shadow-[0_4px_12px_rgba(0,0,0,.4)] backdrop-blur-sm transition duration-300"
    :class="[
      seat.folded ? 'opacity-50 grayscale' : '',
      isMe ? 'ring-2 ring-amber-400/80 shadow-[0_0_20px_rgba(251,191,36,.3)]' : '',
      isActing ? 'seat-active border-amber-400' : '',
    ]"
  >
    <!-- 行动倒计时圆环 -->
    <div v-if="isActing" :key="actionVersion" class="turn-timer" aria-label="轮到该玩家行动" />

    <!-- 玩家信息 -->
    <div class="flex items-center gap-1.5">
      <div class="relative h-6 w-6 overflow-hidden rounded-full border border-gray-500 bg-gradient-to-br from-gray-600 to-gray-800">
        <span class="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white">{{ seat.name.charAt(0) }}</span>
      </div>
      <p class="truncate text-sm font-bold text-gray-100">
        {{ seat.name }}<span v-if="isMe" class="ml-1 text-amber-300">(你)</span>
      </p>
    </div>

    <!-- 筹码 - 真实筹码堆叠视觉 -->
    <div class="mt-1.5 flex items-baseline gap-1.5">
      <div class="flex -space-x-1">
        <div class="h-2.5 w-5 rounded-full border border-blue-300 bg-gradient-to-b from-blue-400 to-blue-700 shadow-[0_1px_2px_rgba(0,0,0,.4)]" />
        <div class="h-2.5 w-5 rounded-full border border-red-300 bg-gradient-to-b from-red-400 to-red-700 shadow-[0_1px_2px_rgba(0,0,0,.4)]" />
        <div class="h-2.5 w-5 rounded-full border border-green-300 bg-gradient-to-b from-green-400 to-green-700 shadow-[0_1px_2px_rgba(0,0,0,.4)]" />
      </div>
      <p
        class="text-xs font-bold tabular-nums text-amber-100"
        :class="{ 'animate-chip-up': chipsAnimating }"
      >
        {{ seat.chips.toLocaleString() }}
      </p>
    </div>
    <p class="text-[10px] text-gray-400">本街 {{ seat.betThisStreet }} · 总投入 {{ seat.contributed }}</p>
    <p v-if="seat.folded" class="mt-1 text-[10px] font-semibold tracking-widest text-gray-500">已弃牌</p>
    <p v-else-if="seat.allIn" class="mt-1 text-[10px] font-semibold tracking-widest text-red-400">全押</p>

    <!-- 手牌 - 真实牌面 -->
    <div :key="cardFlyKey" class="mt-2 flex -space-x-2">
      <div
        v-for="(card, index) in visibleCards?.length ? visibleCards : ['hidden-hidden', 'hidden-hidden']"
        :key="`${card}-${index}`"
        class="animate-card-fly"
        :style="{ '--fly-x': `${(index - 0.5) * 60}px`, '--fly-y': '-40px', animationDelay: `${index * 60}ms` }"
      >
        <PlayingCard :card="card" :hidden="!visibleCards?.length" compact />
      </div>
    </div>
  </article>
</template>

<style scoped>
.seat-active {
  animation: seat-glow 1.3s ease-in-out infinite alternate;
}
.turn-timer {
  position: absolute;
  top: -7px;
  right: -7px;
  width: 28px;
  height: 28px;
  border-radius: 9999px;
  background: conic-gradient(#fbbf24 0deg, #fbbf24 360deg, transparent 360deg);
  mask: radial-gradient(transparent 51%, #000 54%);
  animation: countdown 15s linear forwards;
}
@keyframes countdown {
  from { background: conic-gradient(#fbbf24 360deg, transparent 0deg); }
  to { background: conic-gradient(#fbbf24 0deg, transparent 0deg); }
}
@keyframes seat-glow {
  from { box-shadow: 0 0 8px rgba(251, 191, 36, .45); }
  to { box-shadow: 0 0 28px rgba(251, 191, 36, .85); }
}
</style>