<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{ pot: number; street: string }>()

const animating = ref(false)
const prevPot = ref(props.pot)

watch(
  () => props.pot,
  (newVal, oldVal) => {
    if (oldVal !== undefined && newVal !== oldVal) {
      prevPot.value = oldVal
      animating.value = true
      setTimeout(() => (animating.value = false), 400)
    }
  },
)
</script>

<template>
  <div class="relative inline-flex items-baseline gap-1.5">
    <span class="text-xs font-bold tracking-[.35em] text-gray-400">{{ street }}</span>
    <span
      class="text-xl font-black tracking-wide text-gray-300"
      :class="{ 'animate-pot-pop': animating }"
    >
      底池 <span class="tabular-nums text-gray-200">{{ pot.toLocaleString() }}</span>
    </span>
  </div>
</template>