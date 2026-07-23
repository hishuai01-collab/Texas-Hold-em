<script setup lang="ts">
/**
 * NumberRoller.vue
 *
 * 纯 requestAnimationFrame 驱动的数字滚动动画组件。
 * 每一位数字由 JS 通过 raf 逐帧控制 translateY 偏移，
 * 不依赖 CSS transition，确保低端设备动画不卡顿。
 *
 * Props:
 *  - value    : 目标数字
 *  - duration : 动画持续毫秒（默认 600ms）
 *  - digits   : 整数位数（默认自动，最小 2 位）
 *  - padZero  : 是否补前导零（默认 true）
 *  - locale   : 千分位分隔（默认 en-US）
 */
import { computed, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    value: number
    duration?: number
    digits?: number
    padZero?: boolean
    locale?: string
  }>(),
  {
    duration: 600,
    digits: 0,
    padZero: true,
    locale: 'en-US',
  },
)

/* ── 内部状态 ── */
const displayValue = ref(props.value)
const isAnimating = ref(false)

let rafId: number | null = null
let startTime = 0
let startValue = 0

/* ── Easing: cubic-bezier(0.22, 1, 0.36, 1) ── */
function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
}

/* ── 数字位个数 ── */
const digitCount = computed(() => {
  if (props.digits > 0) return props.digits
  const str = Math.abs(props.value).toFixed(0)
  return Math.max(2, str.length)
})

/**
 * 将数值 n 拆成 digitCount 个数字位（补零）
 * 返回数字数组，索引 0 = 最高位
 */
function numberToDigits(n: number): number[] {
  const num = Math.abs(Math.round(n))
  const str = num.toFixed(0)
  if (props.padZero) {
    return str.padStart(digitCount.value, '0').split('').map(Number)
  }
  return str.split('').map(Number)
}

/* ── 当前每一数字位的 translateY 偏移（百分比） ── */
const digitOffsets = ref<number[]>(numberToDigits(props.value).map(() => 0))

function updateOffsets(value: number) {
  const digits = numberToDigits(value)
  digitOffsets.value = digits.map((d) => d * 100)
}

/* 初始化偏移 */
updateOffsets(props.value)

/* ── 目标数字位（用于对比变化） ── */
const currentDigitValues = computed(() => numberToDigits(displayValue.value))

/* ── 动画主循环 ── */
function animate(timestamp: number) {
  if (!startTime) startTime = timestamp
  const elapsed = timestamp - startTime
  const progress = Math.min(elapsed / props.duration, 1)
  const eased = easeOutExpo(progress)

  const interpValue = startValue + (props.value - startValue) * eased
  displayValue.value = interpValue
  updateOffsets(interpValue)

  if (progress < 1) {
    rafId = requestAnimationFrame(animate)
  } else {
    displayValue.value = props.value
    updateOffsets(props.value)
    isAnimating.value = false
    rafId = null
  }
}

function startAnimation() {
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  startValue = displayValue.value
  startTime = 0
  isAnimating.value = true
  rafId = requestAnimationFrame(animate)
}

watch(
  () => props.value,
  (newVal, oldVal) => {
    if (newVal !== oldVal) {
      startAnimation()
    }
  },
)

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = null
})
</script>

<template>
  <span
    class="number-roller"
    :class="{
      'is-negative': props.value < 0,
      'is-animating': isAnimating,
    }"
    :aria-label="String(Math.round(props.value))"
  >
    <!-- 负号 -->
    <span v-if="props.value < 0" class="roller-sign" aria-hidden="true">−</span>

    <!-- 逐位滚动 -->
    <template v-if="padZero">
      <span
        v-for="(_, idx) in currentDigitValues"
        :key="`digit-${idx}`"
        class="roller-digit"
      >
        <span
          class="digit-scroller"
          :style="{ transform: `translateY(-${digitOffsets[idx] ?? 0}%)` }"
        >
          <span
            v-for="n in 11"
            :key="n"
            class="digit-slot"
          >
            {{ (12 - n) % 10 }}
          </span>
        </span>
      </span>
    </template>

    <!-- 非补零：直接显示 -->
    <template v-else>
      <span class="roller-plain">{{ displayValue.toLocaleString(props.locale) }}</span>
    </template>
  </span>
</template>

<style scoped>
.number-roller {
  display: inline-flex;
  align-items: center;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.roller-sign {
  margin-right: 0.05em;
}

/* ── 单数字位 ── */
.roller-digit {
  position: relative;
  display: inline-block;
  overflow: hidden;
  height: 1em;
  width: 0.58em;
  text-align: center;
  vertical-align: baseline;
  line-height: 1;
}

/* ── 数字滚动条：完全由 JS transform 控制，无 CSS transition ── */
.digit-scroller {
  display: flex;
  flex-direction: column;
  will-change: transform;
}

.digit-slot {
  height: 1em;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

/* ── 非补零模式 ── */
.roller-plain {
  font-variant-numeric: tabular-nums;
}
</style>