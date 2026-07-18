<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { SeatView } from '../types/protocol'

const props = defineProps<{
  connected: boolean
  request: { playerId: string; toCall: number; minRaiseTo: number; raiseAllowed: boolean } | null
  seat: SeatView | null
}>()
const emit = defineEmits<{ action: [action: 'FOLD' | 'CHECK' | 'CALL' | 'RAISE' | 'ALL_IN', amount?: number] }>()

const maxRaiseTo = computed(() => props.seat ? props.seat.betThisStreet + props.seat.chips : 0)
const canRaise = computed(() => Boolean(props.request?.raiseAllowed && props.seat && props.request.minRaiseTo <= maxRaiseTo.value))
const raiseTo = ref(0)
watch([() => props.request?.minRaiseTo, maxRaiseTo], () => {
  raiseTo.value = canRaise.value && props.request ? props.request.minRaiseTo : maxRaiseTo.value
}, { immediate: true })

function submitRaise(): void {
  if (!props.request || !canRaise.value) return
  const amount = Math.max(props.request.minRaiseTo, Math.min(maxRaiseTo.value, raiseTo.value))
  emit('action', 'RAISE', amount)
}
</script>

<template>
  <section class="rounded-2xl border border-gold-700/40 bg-gray-950 p-4 shadow-xl">
    <template v-if="request && seat && connected">
      <div class="mb-3 flex items-center justify-between text-sm">
        <span class="font-semibold text-gold-200">轮到你行动</span>
        <span class="text-gray-400">{{ request.toCall ? `跟注 ${request.toCall}` : '可过牌' }}</span>
      </div>
      <div class="grid grid-cols-3 gap-2">
        <button class="action-button border-rose-800/60 bg-rose-950/40 text-rose-300 hover:bg-rose-900/50" @click="emit('action', 'FOLD')">弃牌</button>
        <button v-if="request.toCall === 0" class="action-button border-emerald-700/60 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50" @click="emit('action', 'CHECK')">过牌</button>
        <button v-else class="action-button border-emerald-700/60 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50" @click="emit('action', 'CALL')">跟注 {{ request.toCall }}</button>
        <button class="action-button border-rose-600 bg-rose-800/70 text-rose-100 hover:bg-rose-700" @click="emit('action', 'ALL_IN')">全下</button>
      </div>
      <div class="mt-3 border-t border-gold-700/30 pt-3" :class="{ 'opacity-45': !canRaise }">
        <div class="mb-1 flex justify-between text-xs text-gray-400"><span>加注到</span><strong class="text-gold-200">{{ raiseTo }}</strong></div>
        <input v-model.number="raiseTo" class="w-full accent-gold-400" type="range" :min="request.minRaiseTo" :max="maxRaiseTo" :disabled="!canRaise" />
        <div class="mt-1 flex justify-between text-[10px] text-gray-500"><span>最小 {{ request.minRaiseTo }}</span><span>最大 {{ maxRaiseTo }}</span></div>
        <button class="action-button mt-2 w-full border-gold-500 bg-gold-600/90 text-gray-950 disabled:cursor-not-allowed disabled:opacity-40 disabled:bg-gray-800 disabled:text-gray-500 hover:bg-gold-500" :disabled="!canRaise" @click="submitRaise">加注至 {{ raiseTo }}</button>
      </div>
    </template>
    <p v-else class="py-2 text-center text-sm text-gray-500">{{ connected ? '等待其他玩家行动' : '正在连接牌桌…' }}</p>
  </section>
</template>

<style scoped>
.action-button { min-height: 42px; border-width: 1px; border-radius: .75rem; font-size: .875rem; font-weight: 700; transition: transform .15s, background .15s; }
.action-button:hover:not(:disabled) { transform: translateY(-1px); }
</style>