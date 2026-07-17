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
      class="fixed inset-0 z-[100] flex min-h-screen items-center justify-center bg-[#080d18] px-6 text-slate-100"
      role="status"
      aria-live="assertive"
    >
      <div class="w-full max-w-md border border-slate-700 bg-slate-950 p-6 font-mono shadow-2xl">
        <div class="flex items-center gap-3 text-xs tracking-[.24em] text-slate-500">
          <span class="h-2 w-2 animate-pulse bg-rose-400" />
          NETWORK STATUS
        </div>
        <p class="mt-8 text-2xl font-semibold tracking-tight text-white">DISCONNECTED</p>
        <p class="mt-2 text-sm text-slate-500">RETRYING...</p>
        <div class="mt-8 h-px w-full bg-slate-800" />
        <p class="mt-4 text-xs text-slate-600">Waiting for the network to come back online.</p>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.offline-enter-active, .offline-leave-active { transition: opacity .2s ease; }
.offline-enter-from, .offline-leave-to { opacity: 0; }
</style>
