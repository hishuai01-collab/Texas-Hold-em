<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError } from '../lib/api'
import { userStore } from '../stores/userStore'

const route = useRoute()
const router = useRouter()
const name = ref('')
const errorMessage = ref('')
const submitting = ref(false)
const nextRoute = computed(() => typeof route.query.next === 'string' ? route.query.next : '/app/games')

watch(
  () => userStore.status.value,
  (status) => {
    if (status === 'ready') void router.replace(nextRoute.value)
  },
  { immediate: true },
)

async function submit(): Promise<void> {
  if (!name.value.trim()) {
    errorMessage.value = '请输入玩家昵称。'
    return
  }

  submitting.value = true
  errorMessage.value = ''
  try {
    await userStore.login(name.value.trim())
  } catch (error) {
    errorMessage.value = error instanceof ApiError
      ? `登录失败，请重试。${error.status >= 500 ? ' 服务暂时不可用。' : ''}`
      : '登录失败，请重试。'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="ui-page login-page">
    <section class="ui-panel login-panel" aria-labelledby="login-title">
      <p class="eyebrow">TEXAS HOLD'EM</p>
      <h1 id="login-title">进入牌局</h1>
      <p class="intro">登录后选择游戏、房间与座位，再加入牌桌。</p>

      <form class="login-form" @submit.prevent="submit">
        <label for="name">玩家昵称</label>
        <input id="name" v-model="name" class="ui-input" autocomplete="nickname" maxlength="24" />
        <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>
        <button class="ui-button ui-button--primary" type="submit" :disabled="submitting">
          {{ submitting ? '正在进入…' : '进入游戏' }}
        </button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.login-page { display: grid; min-height: 100dvh; place-items: center; padding: 24px; }
.login-panel { width: min(100%, 420px); padding: 32px; }
.eyebrow { margin: 0; color: var(--color-text-muted); font-family: var(--font-mono, monospace); font-size: 11px; font-weight: 700; letter-spacing: .2em; }
h1 { margin: 12px 0 0; font-family: var(--font-display, sans-serif); font-size: 32px; line-height: 1.1; }
.intro { margin: 12px 0 0; color: var(--color-text-muted); font-size: 14px; line-height: 1.5; }
.login-form { display: grid; gap: 8px; margin-top: 28px; }
label { color: var(--color-text-muted); font-size: 12px; font-weight: 600; }
.ui-input { min-height: 44px; padding: 0 12px; }
.ui-button { width: 100%; margin-top: 12px; }
.form-error { margin: 4px 0 0; color: var(--color-danger); font-size: 13px; }
</style>
