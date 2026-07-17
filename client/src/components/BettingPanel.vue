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
  <section class="rounded-2xl border border-white/10 bg-slate-950/85 p-4 shadow-xl backdrop-blur">
    <template v-if="request && seat && connected">
      <div class="mb-3 flex items-center justify-between text-sm">
        <span class="font-semibold text-amber-200">轮到你行动</span>
        <span class="text-slate-300">{{ request.toCall ? `跟注 ${request.toCall}` : '可过牌' }}</span>
      </div>
      <div class="grid grid-cols-3 gap-2">
        <button class="action-button border-rose-400/40 bg-rose-500/15 text-rose-100" @click="emit('action', 'FOLD')">弃牌</button>
        <button v-if="request.toCall === 0" class="action-button border-sky-400/40 bg-sky-500/15 text-sky-100" @click="emit('action', 'CHECK')">过牌</button>
        <button v-else class="action-button border-sky-400/40 bg-sky-500/15 text-sky-100" @click="emit('action', 'CALL')">跟注 {{ request.toCall }}</button>
        <button class="action-button border-violet-400/40 bg-violet-500/15 text-violet-100" @click="emit('action', 'ALL_IN')">全下</button>
      </div>
      <div class="mt-3 border-t border-white/10 pt-3" :class="{ 'opacity-45': !canRaise }">
        <div class="mb-1 flex justify-between text-xs text-slate-300"><span>加注到</span><strong class="text-amber-200">{{ raiseTo }}</strong></div>
        <input v-model.number="raiseTo" class="w-full accent-amber-300" type="range" :min="request.minRaiseTo" :max="maxRaiseTo" :disabled="!canRaise" />
        <div class="mt-1 flex justify-between text-[10px] text-slate-400"><span>最小 {{ request.minRaiseTo }}</span><span>最大 {{ maxRaiseTo }}</span></div>
        <button class="action-button mt-2 w-full border-amber-300/40 bg-amber-400/15 text-amber-100 disabled:cursor-not-allowed" :disabled="!canRaise" @click="submitRaise">加注至 {{ raiseTo }}</button>
      </div>
    </template>
    <p v-else class="py-2 text-center text-sm text-slate-400">{{ connected ? '等待其他玩家行动' : '正在连接牌桌…' }}</p>
  </section>
</template>

<style scoped>
.action-button { min-height: 42px; border-width: 1px; border-radius: .75rem; font-size: .875rem; font-weight: 700; transition: transform .15s, filter .15s; }
.action-button:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.15); }
</style>
