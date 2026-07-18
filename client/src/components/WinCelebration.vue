<script setup lang="ts">
/**
 * WinCelebration.vue
 *
 * 胜利光效组件。使用 css/visual-effects.css 中的 class，
 * 无业务逻辑，纯视觉展示。
 *
 * Props:
 *  - show   : 是否显示
 *  - title  : 胜利标题（默认 "WINNER!"）
 *  - amount : 胜利金额（可选）
 *  - autoHide : 自动隐藏毫秒（默认 3500，设为 0 不隐藏）
 */
import { onUnmounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    show: boolean
    title?: string
    amount?: string
    autoHide?: number
    particleCount?: number
    beamCount?: number
  }>(),
  {
    show: false,
    title: 'WINNER!',
    amount: undefined,
    autoHide: 3500,
    particleCount: 30,
    beamCount: 8,
  },
)

const emit = defineEmits<{
  (e: 'complete'): void
}>()

const visible = ref(props.show)
let hideTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => props.show,
  (val) => {
    if (val) {
      visible.value = true
      if (props.autoHide > 0) {
        hideTimer = setTimeout(() => {
          visible.value = false
          emit('complete')
        }, props.autoHide)
      }
    }
  },
)

onUnmounted(() => {
  if (hideTimer) clearTimeout(hideTimer)
})

/* ── 粒子生成 ── */
const particles = Array.from({ length: props.particleCount }, (_, i) => ({
  id: i,
  style: {
    left: `${Math.random() * 100}%`,
    '--fall-duration': `${1.5 + Math.random() * 2}s`,
    '--fall-delay': `${Math.random() * 1.5}s`,
    '--drift-x': `${(Math.random() - 0.5) * 120}px`,
  } as Record<string, string>,
}))

/* ── 光柱生成 ── */
const beams = Array.from({ length: props.beamCount }, (_, i) => ({
  id: i,
  style: {
    '--beam-x': `${(i / props.beamCount) * 100}%`,
    '--beam-delay': `${Math.random() * 0.6}s`,
  } as Record<string, string>,
}))
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="win-celebration" role="status" aria-live="polite">
      <!-- 粒子 -->
      <div
        v-for="p in particles"
        :key="p.id"
        class="win-particle"
        :style="p.style"
      />

      <!-- 光柱 -->
      <div
        v-for="b in beams"
        :key="b.id"
        class="win-beam"
        :style="b.style"
      />

      <!-- 中心光晕 -->
      <div class="win-glow" />

      <!-- 标题 -->
      <h2 class="win-title">{{ title }}</h2>

      <!-- 金额 -->
      <p v-if="amount" class="win-amount">+{{ amount }}</p>
    </div>
  </Teleport>
</template>