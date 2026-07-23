<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import OfflineOverlay from './components/OfflineOverlay.vue'
import SoundToggle from './components/SoundToggle.vue'
import ToastViewport from './components/ToastViewport.vue'
import VideoBackground from './components/VideoBackground.vue'
import { userStore } from './stores/userStore'

const router = useRouter()

function handleAuthExpired(): void {
  void router.push({ name: 'app-login' })
}

onMounted(() => {
  window.addEventListener('auth:expired', handleAuthExpired)
  void userStore.loadMe()
})
onUnmounted(() => window.removeEventListener('auth:expired', handleAuthExpired))
</script>

<template>
  <VideoBackground />
  <RouterView />
  <OfflineOverlay />
  <ToastViewport />
  <SoundToggle />
</template>
