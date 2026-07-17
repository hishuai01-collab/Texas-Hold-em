<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import OfflineOverlay from './components/OfflineOverlay.vue'
import ToastViewport from './components/ToastViewport.vue'
import { userStore } from './stores/userStore'

const router = useRouter()

function handleAuthExpired(): void {
  void router.push({ name: 'lobby' })
}

onMounted(() => {
  window.addEventListener('auth:expired', handleAuthExpired)
  void userStore.loadMe()
})
onUnmounted(() => window.removeEventListener('auth:expired', handleAuthExpired))
</script>

<template>
  <RouterView />
  <OfflineOverlay />
  <ToastViewport />
</template>
