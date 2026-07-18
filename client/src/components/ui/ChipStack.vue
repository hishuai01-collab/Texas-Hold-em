<script setup lang="ts">
/**
 * ChipStack.vue (ui/monochrome version)
 *
 * 黑白极客风筹码堆栈组件。
 * requestAnimationFrame 驱动的抛入/飞出动画，纯 transform/opacity 硬件加速。
 * 严格按照：黑底 bg-gray-950，极细 border-gray-800，白色/金属灰文字。无艳丽色彩。
 *
 * Props:
 *  - value     : 筹码数量（枚）
 *  - maxVisual : 最多可视堆叠枚数（默认 10）
 *  - duration  : 动画持续 ms（默认 500）
 */
import { computed, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    value: number
    maxVisual?: number
    duration?: number
  }>(),
  { value: 0, maxVisual: 10, duration: 500 },
)

interface ChipAnim {
  id: number
  state: 'idle' | 'spawning' | 'flying-out'
  y: number
  opacity: number
  rotation: number
  targetY: number
}

const chips = ref<ChipAnim[]>([])
const prevValue = ref(props.value)
const overflow = ref(0)
let chipIdCounter = 0
let rafId: number | null = null
let animMeta: Record<number, { startTime: number; fromY: number; fromOpacity: number }> = {}
let spawnQueue: ChipAnim[] = []

function syncChips() {
  const visualCount = Math.min(props.value, props.maxVisual)
  overflow.value = Math.max(0, props.value - props.maxVisual)
  const existingIdle = chips.value.filter(c => c.state === 'idle')
  const next: ChipAnim[] = []
  for (let i = 0; i < visualCount; i++) {
    const ex = existingIdle[i]
    if (ex) {
      ex.targetY = -(i * 3)
      ex.y = ex.targetY
      next.push(ex)
    } else {
      const chip: ChipAnim = {
        id: chipIdCounter++,
        state: 'spawning',
        y: -(i * 3) - 30,
        opacity: 0,
        rotation: (Math.random() - 0.5) * 4,
        targetY: -(i * 3),
      }
      next.push(chip)
      spawnQueue.push(chip)
      animMeta[chip.id] = { startTime: 0, fromY: chip.y, fromOpacity: 0 }
    }
  }
  chips.value = next
}

function handleDecrease() {
  const diff = prevValue.value - props.value
  if (diff <= 0) return
  const removing = chips.value.slice(-diff)
  removing.forEach(c => {
    c.state = 'flying-out'
    animMeta[c.id] = { startTime: 0, fromY: c.y, fromOpacity: 1 }
  })
  const keep = chips.value.slice(0, -diff)
  keep.forEach((c, i) => { c.targetY = -(i * 3) })
  chips.value = keep
}

watch(() => props.value, (n, o) => {
  if (n === o) return
  prevValue.value = o
  if (n > o) syncChips()
  else handleDecrease()
})

function animate(ts: number) {
  const dur = props.duration
  let active = false
  for (const chip of chips.value) {
    const meta = animMeta[chip.id]
    if (!meta) continue
    if (chip.state === 'spawning') {
      if (!meta.startTime) meta.startTime = ts
      const p = Math.min((ts - meta.startTime) / dur, 1)
      const eased = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2
      chip.y = meta.fromY + (chip.targetY - meta.fromY) * eased
      chip.opacity = Math.min(1, p * 2)
      if (p >= 1) {
        chip.y = chip.targetY; chip.opacity = 1; chip.state = 'idle'
        delete animMeta[chip.id]
      } else { active = true }
    } else if (chip.state === 'flying-out') {
      if (!meta.startTime) meta.startTime = ts
      const p = Math.min((ts - meta.startTime) / (dur * 0.6), 1)
      const eased = 1 - (1 - p) ** 2
      chip.y = meta.fromY - eased * 50
      chip.opacity = 1 - eased
      chip.rotation += 2
      if (p >= 1) {
        chips.value = chips.value.filter(c => c.id !== chip.id)
        delete animMeta[chip.id]
      } else { active = true }
    }
  }
  if (active) rafId = requestAnimationFrame(animate)
  else rafId = null
}

syncChips()
function startLoop() { if (!rafId) rafId = requestAnimationFrame(animate) }
watch(spawnQueue, () => { if (spawnQueue.length) startLoop() }, { deep: true })
watch(() => chips.value.length, () => {
  if (chips.value.some(c => c.state !== 'idle')) startLoop()
})
onUnmounted(() => { if (rafId) cancelAnimationFrame(rafId) })
</script>

<template>
  <div class="stack" :aria-label="`筹码 ${value} 枚`">
    <div class="visual">
      <div
        v-for="(chip, idx) in chips.filter(c => c.state === 'idle' || c.state === 'spawning')"
        :key="chip.id"
        class="chip"
        :style="{
          transform: `translateY(${chip.y}px) rotate(${chip.rotation}deg)`,
          opacity: chip.opacity,
          zIndex: idx,
        }"
      />
      <!-- flying-out 层 -->
      <div
        v-for="chip in chips.filter(c => c.state === 'flying-out')"
        :key="chip.id"
        class="chip flyout"
        :style="{
          transform: `translateY(${chip.y}px) rotate(${chip.rotation}deg)`,
          opacity: chip.opacity,
        }"
      />
    </div>
    <span v-if="overflow > 0" class="overflow">+{{ overflow }}</span>
  </div>
</template>

<style scoped>
.stack {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
}
.visual {
  position: relative;
  height: 42px;
  width: 40px;
}
.chip {
  position: absolute;
  bottom: 0;
  width: 36px;
  height: 8px;
  border-radius: 50%;
  background: #1a1a1a;        /* bg-gray-950 等价 */
  border: 1.5px solid #374151; /* border-gray-700 */
  box-shadow:
    inset 0 -1px 1px rgba(0,0,0,.4),
    0 1px 1px rgba(0,0,0,.25);
  will-change: transform, opacity;
}
/* 内圈装饰线（极简） */
.chip::after {
  content: '';
  position: absolute;
  inset: 1px;
  border-radius: 50%;
  border: 1px solid #4b5563;  /* gray-600 */
  opacity: .35;
}
.flyout {
  pointer-events: none;
}
.overflow {
  margin-top: 2px;
  font-size: 9px;
  font-weight: 600;
  color: #9ca3af;             /* gray-400 */
  background: #111827;        /* gray-900 */
  border: 1px solid #374151;  /* gray-700 */
  border-radius: 999px;
  padding: 0 5px;
  line-height: 14px;
}
</style>