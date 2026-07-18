<script setup lang="ts">
/**
 * ChipStack.vue
 *
 * 筹码堆栈组件。使用 requestAnimationFrame 驱动的抛入/飞出动画，
 * 展示筹码堆叠的视觉反馈。
 *
 * 玩法：
 *  - value 变化时，多出的筹码从上方“丢入”堆栈
 *  - 减少的筹码以“飞出”动画消失
 *  - 筹码颜色按面额映射（1/白, 5/红, 10/蓝, 25/绿, 100/黑, 500/紫, 1K/金）
 *  - 最多显示 MAX_VISUAL_CHIPS 枚，超出显示 "+N" 溢出标记
 */
import { computed, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 筹码数量（枚） */
    value: number
    /** 单枚筹码面额（仅用于视觉颜色映射） */
    denomination?: number
    /** 最多可视堆叠枚数 */
    maxVisual?: number
    /** 动画持续（ms） */
    duration?: number
  }>(),
  {
    denomination: 1,
    maxVisual: 10,
    duration: 500,
  },
)

/* ── 筹码颜色映射 ── */
type ChipColor = { bg: string; border: string; inner: string }

const CHIP_COLORS: Record<string, ChipColor> = {
  '1':   { bg: '#f0f0f0', border: '#b0b0b0', inner: '#d4d4d4' },
  '5':   { bg: '#e34b4b', border: '#9a2323', inner: '#c43a3a' },
  '10':  { bg: '#3b7dd8', border: '#1f4d8a', inner: '#2e66b8' },
  '25':  { bg: '#3ba64f', border: '#1f6f2e', inner: '#2d8f3f' },
  '100': { bg: '#2a2a2a', border: '#111111', inner: '#1a1a1a' },
  '500': { bg: '#8b46b8', border: '#5b2a7a', inner: '#703a9e' },
  '1000':{ bg: '#d4a843', border: '#9a7a2a', inner: '#b89234' },
}

const chipColor = computed<ChipColor>(() => {
  const key = String(props.denomination)
  return CHIP_COLORS[key] ?? CHIP_COLORS['1']
})

/* ── 内部状态 ── */
interface ChipAnim {
  id: number
  state: 'idle' | 'spawning' | 'flying-out'
  y: number         // 当前 Y 偏移（px）
  opacity: number
  rotation: number
  targetY: number
}

const chips = ref<ChipAnim[]>([])
const prevValue = ref(props.value)
const overflow = ref(0)
let chipIdCounter = 0

let rafId: number | null = null
let animationStart: Record<number, { startTime: number; fromY: number; fromOpacity: number }> = {}
let spawnQueue: ChipAnim[] = []

/* ── 构建静态筹码列表（对齐 value） ── */
function syncChips() {
  const visualCount = Math.min(props.value, props.maxVisual)
  overflow.value = Math.max(0, props.value - props.maxVisual)

  // 保留现有 idle 筹码
  const existingIdle = chips.value.filter((c) => c.state === 'idle')
  const targetIdle: ChipAnim[] = []

  for (let i = 0; i < visualCount; i++) {
    const existing = existingIdle[i]
    if (existing) {
      existing.targetY = -(i * 4) // 每枚堆叠上移 4px
      existing.y = existing.targetY
      targetIdle.push(existing)
    } else {
      const chip: ChipAnim = {
        id: chipIdCounter++,
        state: 'spawning',
        y: -(i * 4) - 40,   // 从上方 40px 处落下
        opacity: 0,
        rotation: (Math.random() - 0.5) * 6,
        targetY: -(i * 4),
      }
      targetIdle.push(chip)
      spawnQueue.push(chip)
      animationStart[chip.id] = {
        startTime: 0,
        fromY: chip.y,
        fromOpacity: 0,
      }
    }
  }

  chips.value = targetIdle
}

/* ── 处理筹码减少 → 飞出 ── */
function handleDecrease() {
  const diff = prevValue.value - props.value
  if (diff <= 0) return

  // 标记最上方的 diff 枚筹码飞出
  const toRemove = chips.value.slice(-diff)
  toRemove.forEach((chip) => {
    chip.state = 'flying-out'
    animationStart[chip.id] = {
      startTime: 0,
      fromY: chip.y,
      fromOpacity: 1,
    }
  })

  // 重排剩余的筹码
  const remaining = chips.value.slice(0, -diff)
  remaining.forEach((chip, i) => {
    chip.targetY = -(i * 4)
  })
  chips.value = remaining
}

watch(
  () => props.value,
  (newVal, oldVal) => {
    if (newVal === oldVal) return
    prevValue.value = oldVal

    if (newVal > oldVal) {
      // 增加 → 重新同步（会触发 spawning）
      syncChips()
    } else {
      // 减少 → 飞出动画
      handleDecrease()
    }
  },
)

/* ── 动画循环 ── */
function animate(timestamp: number) {
  const duration = props.duration
  let hasActive = false

  for (const chip of chips.value) {
    const anim = animationStart[chip.id]
    if (!anim) continue

    if (chip.state === 'spawning') {
      if (!anim.startTime) anim.startTime = timestamp
      const elapsed = timestamp - anim.startTime
      const progress = Math.min(elapsed / duration, 1)
      // 缓动：bounce-like cubic
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2

      chip.y = anim.fromY + (chip.targetY - anim.fromY) * eased
      chip.opacity = Math.min(1, progress * 2)

      if (progress >= 1) {
        chip.y = chip.targetY
        chip.opacity = 1
        chip.state = 'idle'
        delete animationStart[chip.id]
      } else {
        hasActive = true
      }
    }

    if (chip.state === 'flying-out') {
      if (!anim.startTime) anim.startTime = timestamp
      const elapsed = timestamp - anim.startTime
      const progress = Math.min(elapsed / (duration * 0.6), 1)
      const eased = 1 - Math.pow(1 - progress, 2)

      chip.y = anim.fromY - eased * 60  // 向上飞 60px
      chip.opacity = 1 - eased
      chip.rotation += 2

      if (progress >= 1) {
        chip.opacity = 0
        chips.value = chips.value.filter((c) => c.id !== chip.id)
        delete animationStart[chip.id]
      } else {
        hasActive = true
      }
    }
  }

  if (hasActive) {
    rafId = requestAnimationFrame(animate)
  } else {
    rafId = null
  }
}

/* ── 启动 ── */
syncChips()

function startAnimationLoop() {
  if (rafId) return
  rafId = requestAnimationFrame(animate)
}

// 监听 spawning 启动循环
watch(spawnQueue, () => {
  if (spawnQueue.length > 0) startAnimationLoop()
}, { deep: true })

// 当有飞出也需要启动
watch(
  () => chips.value.length,
  () => {
    const hasActiveAnim = chips.value.some((c) => c.state !== 'idle')
    if (hasActiveAnim) startAnimationLoop()
  },
)

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = null
})
</script>

<template>
  <div class="chip-stack" aria-label="筹码 {{ value }} 枚">
    <!-- 堆叠区 -->
    <div class="chip-stack-visual">
      <!-- 静态基础筹码（shadow） -->
      <div
        v-for="(chip, idx) in chips.filter(c => c.state === 'idle' || c.state === 'spawning')"
        :key="chip.id"
        class="chip-unit"
        :style="{
          transform: `translateY(${chip.y}px) rotate(${chip.rotation}deg)`,
          opacity: chip.opacity,
          zIndex: idx,
          '--chip-bg': chipColor.bg,
          '--chip-border': chipColor.border,
          '--chip-inner': chipColor.inner,
        }"
      >
        <span class="chip-inner-ring" />
        <span class="chip-denom">{{ denomination }}</span>
      </div>
    </div>

    <!-- 飞出筹码 -->
    <div v-for="chip in chips.filter(c => c.state === 'flying-out')" :key="chip.id" class="chip-unit chip-flying" :style="{
      transform: `translateY(${chip.y}px) rotate(${chip.rotation}deg)`,
      opacity: chip.opacity,
      '--chip-bg': chipColor.bg,
      '--chip-border': chipColor.border,
      '--chip-inner': chipColor.inner,
    }">
      <span class="chip-inner-ring" />
    </div>

    <!-- 溢出标记 -->
    <span v-if="overflow > 0" class="chip-overflow">+{{ overflow }}</span>
  </div>
</template>

<style scoped>
.chip-stack {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

.chip-stack-visual {
  position: relative;
  height: 52px;  /* 最大堆叠高度 */
  width: 48px;
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
}

/* ── 单枚筹码 ── */
.chip-unit {
  position: absolute;
  bottom: 0;
  width: 44px;
  height: 10px;
  border-radius: 50%;
  background: var(--chip-bg, #ccc);
  border: 2px solid var(--chip-border, #999);
  box-shadow:
    inset 0 -1px 2px rgba(0,0,0,.25),
    0 1px 2px rgba(0,0,0,.18);
  display: flex;
  align-items: center;
  justify-content: center;
  will-change: transform, opacity;
  transition: box-shadow 0.15s;
}

/* 内圈装饰 */
.chip-inner-ring {
  position: absolute;
  width: 60%;
  height: 60%;
  border-radius: 50%;
  background: var(--chip-inner, #bbb);
  border: 1px solid var(--chip-border, #999);
  opacity: 0.6;
}

/* 面额标记 */
.chip-denom {
  position: relative;
  z-index: 1;
  font-size: 6px;
  font-weight: 700;
  color: rgba(0, 0, 0, .7);
  text-shadow: 0 0 2px rgba(255,255,255,.5);
  line-height: 1;
  pointer-events: none;
}

/* 飞出态 */
.chip-flying {
  pointer-events: none;
}

/* 溢出数字 */
.chip-overflow {
  margin-top: 2px;
  font-size: 10px;
  font-weight: 700;
  color: #fcd34d;
  background: rgba(0,0,0,.45);
  border-radius: 999px;
  padding: 0 6px;
  line-height: 16px;
}
</style>