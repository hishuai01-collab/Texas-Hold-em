<script setup lang="ts">
/**
 * NumberRoller.vue (ui/monochrome version)
 *
 * 黑白极客风数字滚动组件。
 * 纯 requestAnimationFrame 驱动，每一位数字由 JS 逐帧控制 translateY，
 * 无 CSS transition 依赖，纯 transform 硬件加速，绝不触发重排。
 *
 * Props:
 *  - value    : 目标数字
 *  - duration : 动画毫秒（默认 600）
 *  - digits   : 整数位数（自动推断，最小 2 位）
 *  - padZero  : 是否补前导零（默认 true）
 */
import { computed, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    value: number
    duration?: number
    digits?: number
    padZero?: boolean
  }>(),
  {
    duration: 600,
    digits: 0,
    padZero: true,
  },
)

const displayValue = ref(props.value)
const isAnimating = ref(false)
let rafId: number | null = null
let startTime = 0
let startValue = 0

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - 2 ** (-10 * t)
}

const digitCount = computed(() => {
  if (props.digits > 0) return props.digits
  return Math.max(2, Math.abs(props.value).toFixed(0).length)
})

function toDigits(n: number): number[] {
  const s = Math.abs(Math.round(n)).toFixed(0)
  return props.padZero ? s.padStart(digitCount.value, '0').split('').map(Number) : s.split('').map(Number)
}

const digitOffsets = ref<number[]>(toDigits(props.value).map(() => 0))

function updateOffsets(v: number) {
  digitOffsets.value = toDigits(v).map(d => d * 100)
}
updateOffsets(props.value)

const currentDigitValues = computed(() => toDigits(displayValue.value))

function animate(ts: number) {
  if (!startTime) startTime = ts
  const p = Math.min((ts - startTime) / props.duration, 1)
  const eased = easeOutExpo(p)
  const interp = startValue + (props.value - startValue) * eased
  displayValue.value = interp
  updateOffsets(interp)
  if (p < 1) {
    rafId = requestAnimationFrame(animate)
  } else {
    displayValue.value = props.value
    updateOffsets(props.value)
    isAnimating.value = false
    rafId = null
  }
}

function startAnimation() {
  if (rafId) cancelAnimationFrame(rafId)
  startValue = displayValue.value
  startTime = 0
  isAnimating.value = true
  rafId = requestAnimationFrame(animate)
}

watch(() => props.value, (n, o) => { if (n !== o) startAnimation() })
onUnmounted(() => { if (rafId) cancelAnimationFrame(rafId) })
</script>

<template>
  <span
    class="roller"
    :class="{ 'is-neg': value < 0, 'is-animating': isAnimating }"
    :aria-label="String(Math.round(value))"
  >
    <span v-if="value < 0" class="sign">−</span>
    <template v-if="padZero">
      <span v-for="(_, idx) in currentDigitValues" :key="idx" class="digit">
        <span class="scroller" :style="{ transform: `translateY(-${digitOffsets[idx] ?? 0}%)` }">
          <span v-for="n in 11" :key="n" class="slot">{{ (12 - n) % 10 }}</span>
        </span>
      </span>
    </template>
    <span v-else class="plain">{{ displayValue.toLocaleString() }}</span>
  </span>
</template>

<style scoped>
.roller {
  display: inline-flex;
  align-items: center;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  line-height: 1;
  color: #e5e7eb; /* gray-200 */
}
.sign { margin-right: 0.05em; }
.digit {
  position: relative;
  display: inline-block;
  overflow: hidden;
  height: 1em;
  width: 0.58em;
  text-align: center;
  vertical-align: baseline;
}
.scroller {
  display: flex;
  flex-direction: column;
  will-change: transform;
}
.slot {
  height: 1em;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.plain { font-variant-numeric: tabular-nums; }
</style>