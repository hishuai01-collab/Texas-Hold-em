<script setup lang="ts">
import { toastStore } from '../stores/toastStore'

const { items } = toastStore
</script>

<template>
  <div class="fixed bottom-5 right-5 z-[90] flex max-w-sm flex-col gap-2" aria-live="polite">
    <div
      v-for="toast in items"
      :key="toast.id"
      class="flex items-start gap-3 border bg-slate-950/95 px-4 py-3 font-mono text-xs shadow-xl backdrop-blur"
      :class="{
        'border-rose-500/40 text-rose-200': toast.tone === 'error',
        'border-emerald-500/40 text-emerald-200': toast.tone === 'success',
        'border-slate-600 text-slate-200': toast.tone === 'info',
      }"
    >
      <span class="mt-0.5 text-slate-500">/</span>
      <span class="flex-1">{{ toast.message }}</span>
      <button class="text-slate-600 hover:text-white" aria-label="Dismiss" @click="toastStore.dismiss(toast.id)">×</button>
    </div>
  </div>
</template>
