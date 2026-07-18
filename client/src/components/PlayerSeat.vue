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
    class="relative w-32 rounded-2xl border px-3 py-2 text-left shadow-lg transition duration-300 sm:w-40"
    :class="[
      seat.folded ? 'border-gray-800 bg-gray-950/70 opacity-45 grayscale' : 'border-gold-700/50 bg-gray-950/90',
      isMe ? 'ring-2 ring-gold-400/70' : '',
      isActing ? 'seat-active border-gold-400 bg-gray-900 ring-2 ring-gold-400' : '',
    ]"
  >
    <!-- 行动倒计时圆环 -->
    <div v-if="isActing" :key="actionVersion" class="turn-timer" aria-label="轮到该玩家行动" />

    <!-- 玩家信息 -->
    <div class="flex items-center gap-1.5 pr-5">
      <span
        class="h-2.5 w-2.5 rounded-full"
        :class="seat.folded ? 'bg-gray-600' : seat.allIn ? 'bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,.8)]' : 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,.7)]'"
      />
      <p class="truncate text-sm font-bold text-gray-100">
        {{ seat.name }}<span v-if="isMe" class="ml-1 text-gold-300">你</span>
      </p>
    </div>

    <!-- 筹码 -->
    <p
      class="mt-1 text-xs tabular-nums text-gold-200"
      :class="{ 'animate-chip-up': chipsAnimating }"
    >
      筹码 {{ seat.chips.toLocaleString() }}
    </p>
    <p class="text-[11px] text-gray-500">本街 {{ seat.betThisStreet }} · 总投入 {{ seat.contributed }}</p>
    <p v-if="seat.folded" class="mt-1 text-[10px] font-semibold tracking-widest text-gray-500">FOLDED</p>
    <p v-else-if="seat.allIn" class="mt-1 text-[10px] font-semibold tracking-widest text-rose-400">ALL IN</p>

    <!-- 手牌 -->
    <div :key="cardFlyKey" class="mt-2 flex -space-x-1.5">
      <div
        v-for="(card, index) in visibleCards?.length ? visibleCards : ['hidden-1', 'hidden-2']"
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
  background: conic-gradient(#e8bd4e 0deg, #e8bd4e 360deg, transparent 360deg);
  mask: radial-gradient(transparent 51%, #000 54%);
  animation: countdown 15s linear forwards;
}
@keyframes countdown {
  from { background: conic-gradient(#e8bd4e 360deg, transparent 0deg); }
  to { background: conic-gradient(#e8bd4e 0deg, transparent 0deg); }
}
@keyframes seat-glow {
  from { box-shadow: 0 0 8px rgba(232, 189, 78, .3); }
  to { box-shadow: 0 0 28px rgba(232, 189, 78, .6); }
}
</style>