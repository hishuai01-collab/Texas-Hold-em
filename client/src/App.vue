<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import OfflineOverlay from './components/OfflineOverlay.vue'
import ToastViewport from './components/ToastViewport.vue'
import VideoBackground from './components/VideoBackground.vue'
import { userStore } from './stores/userStore'
import { sessionStore } from './stores/sessionStore'
import { soundStore } from './lib/sound'
import { themeStore } from './stores/themeStore'
import { supabase } from './lib/supabase'

const router = useRouter()

function handleAuthExpired(): void {
  void router.push({ name: 'app-login' })
}

function handleGlobalClick(event: Event): void {
  const target = event.target as HTMLElement | null
  if (!target) return
  const interactive = target.closest('button, a, input, select, textarea, [role="button"], .ui-button, .menu-item, .setting-row, .tab-item, .action-btn, .toggle, .back-btn, .settings-fab')
  if (interactive) {
    soundStore.playClick()
  }
}

function unlockAudio(): void {
  soundStore.startAmbience()
  document.removeEventListener('click', unlockAudio)
  document.removeEventListener('touchstart', unlockAudio)
  document.removeEventListener('keydown', unlockAudio)
}

onMounted(async () => {
  window.addEventListener('auth:expired', handleAuthExpired)
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token && !sessionStore.token.value) {
    await userStore.loginWithSupabase()
  } else {
    void userStore.loadMe()
  }

  if (!soundStore.muted.value) {
    document.addEventListener('click', unlockAudio, { once: true })
    document.addEventListener('touchstart', unlockAudio, { once: true })
    document.addEventListener('keydown', unlockAudio, { once: true })
  }

  document.addEventListener('click', handleGlobalClick)
  themeStore.init()
})
onUnmounted(() => {
  window.removeEventListener('auth:expired', handleAuthExpired)
  document.removeEventListener('click', handleGlobalClick)
})
</script>

<template>
  <VideoBackground />
  <RouterView />
  <OfflineOverlay />
  <ToastViewport />
</template>
