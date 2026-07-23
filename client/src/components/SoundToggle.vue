<script setup lang="ts">
import { soundStore } from '../lib/sound'
</script>

<template>
  <button
    class="sound-toggle ui-button ui-button--neutral"
    type="button"
    :aria-pressed="!soundStore.muted.value"
    :aria-label="soundStore.muted.value ? '开启音效与背景音乐' : '关闭音效与背景音乐'"
    @click="soundStore.toggle"
  >
    <span aria-hidden="true">{{ soundStore.muted.value ? '音效与音乐：关' : '音效与音乐：开' }}</span>
  </button>
</template>

<style scoped>
.sound-toggle { position: fixed; right: 16px; bottom: max(16px, env(safe-area-inset-bottom)); z-index: 90; min-height: 36px; padding: 0 12px; font-size: 12px; }
</style>
