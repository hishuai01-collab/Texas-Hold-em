<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)

function setOnline(): void {
  online.value = true
}

function setOffline(): void {
  online.value = false
}

onMounted(() => {
  window.addEventListener('online', setOnline)
  window.addEventListener('offline', setOffline)
})

onUnmounted(() => {
  window.removeEventListener('online', setOnline)
  window.removeEventListener('offline', setOffline)
})
</script>

<template>
  <Transition name="offline">
    <div
      v-if="!online"
      class="fixed inset-0 z-[100] flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-6 text-slate-100"
      role="status"
      aria-live="assertive"
    >
      <div class="ui-panel w-full max-w-md p-6 font-mono">
        <div class="flex items-center gap-3 text-xs tracking-[.24em] text-slate-500">
          <span class="h-2 w-2 animate-pulse bg-rose-400" />
          网络状态
        </div>
        <p class="mt-8 text-2xl font-semibold tracking-tight text-white">网络已断开</p>
        <p class="mt-2 text-sm text-slate-500">正在重试…</p>
        <div class="mt-8 h-px w-full bg-slate-800" />
        <p class="mt-4 text-xs text-slate-600">网络恢复后将自动重新连接。</p>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.offline-enter-active, .offline-leave-active { transition: opacity .2s ease; }
.offline-enter-from, .offline-leave-to { opacity: 0; }
</style>
