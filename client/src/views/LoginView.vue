<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { userStore } from '../stores/userStore'

const route = useRoute()
const router = useRouter()
const errorMessage = ref('')
const submitting = ref(false)
const mode = ref<'phone' | 'email'>('phone')
const phone = ref('')
const otp = ref('')
const email = ref('')
const nextRoute = computed(() => typeof route.query.next === 'string' ? route.query.next : '/app/home')

watch(
  () => userStore.status.value,
  (status) => {
    if (status === 'ready') void router.replace(nextRoute.value)
  },
  { immediate: true },
)

async function sendOtp(): Promise<void> {
  if (mode.value === 'phone') {
    if (!phone.value.trim() || phone.value.trim().length < 10) {
      errorMessage.value = '请输入有效的手机号'
      return
    }
    submitting.value = true
    errorMessage.value = ''
    try {
      await userStore.sendPhoneOtp(phone.value.trim())
    } catch {
      errorMessage.value = '验证码发送失败，请稍后重试'
    } finally {
      submitting.value = false
    }
  } else {
    if (!email.value.trim() || !email.value.includes('@')) {
      errorMessage.value = '请输入有效的邮箱地址'
      return
    }
    submitting.value = true
    errorMessage.value = ''
    try {
      await userStore.sendEmailOtp(email.value.trim())
    } catch {
      errorMessage.value = '验证邮件发送失败，请稍后重试'
    } finally {
      submitting.value = false
    }
  }
}

async function confirmOtp(): Promise<void> {
  const code = otp.value.trim()
  if (!code || code.length < 4) {
    errorMessage.value = '请输入验证码'
    return
  }
  submitting.value = true
  errorMessage.value = ''
  try {
    if (mode.value === 'phone') {
      await userStore.verifyPhoneOtp(phone.value.trim(), code)
    } else {
      await userStore.verifyEmailOtp(email.value.trim(), code)
    }
  } catch {
    errorMessage.value = '验证码错误，请重试'
  } finally {
    submitting.value = false
  }
}

async function socialLogin(provider: 'wechat' | 'google' | 'github'): Promise<void> {
  submitting.value = true
  errorMessage.value = ''
  try {
    await userStore.loginWithOAuth(provider)
  } catch {
    errorMessage.value = '登录失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="ui-page login-page">
    <section class="ui-panel login-panel shadow-[0_0_40px_rgba(251,191,36,.12)]" aria-labelledby="login-title">
      <p class="eyebrow">TEXAS HOLD'EM</p>
      <h1 id="login-title">进入牌局</h1>
      <p class="intro">通过手机号、邮箱或社交账号登录后加入牌桌。</p>

      <div class="login-form" @submit.prevent="null">
        <div class="auth-tabs">
          <button
            :class="['auth-tab', mode === 'phone' && 'auth-tab--active']"
            type="button"
            @click="mode = 'phone'; errorMessage = ''"
          >手机号</button>
          <button
            :class="['auth-tab', mode === 'email' && 'auth-tab--active']"
            type="button"
            @click="mode = 'email'; errorMessage = ''"
          >邮箱</button>
        </div>

        <template v-if="mode === 'phone'">
          <label for="phone">手机号</label>
          <input id="phone" v-model="phone" class="ui-input" autocomplete="tel" placeholder="+86 13800000000" />
          <button v-if="otp" class="ui-button ui-button--ghost" type="button" @click="otp = ''">
            使用另一手机号
          </button>
          <button class="ui-button" type="button" :disabled="submitting" @click="sendOtp">
            {{ submitting ? '发送中…' : '获取验证码' }}
          </button>
        </template>

        <template v-else>
          <label for="email">邮箱地址</label>
          <input id="email" v-model="email" class="ui-input" autocomplete="email" placeholder="you@example.com" />
          <button v-if="otp" class="ui-button ui-button--ghost" type="button" @click="otp = ''">
            使用另一邮箱
          </button>
          <button class="ui-button" type="button" :disabled="submitting" @click="sendOtp">
            {{ submitting ? '发送中…' : '获取验证码' }}
          </button>
        </template>

        <template v-if="otp">
          <label for="otp">验证码</label>
          <input id="otp" v-model="otp" class="ui-input" autocomplete="one-time-code" inputmode="numeric" maxlength="8" placeholder="000000" />
          <button class="ui-button ui-button--primary" type="button" :disabled="submitting" @click="confirmOtp">
            {{ submitting ? '验证中…' : '验证并登录' }}
          </button>
        </template>

        <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>

        <div class="login-divider"><span>或</span></div>

        <div class="social-buttons">
          <button class="social-btn" type="button" :disabled="submitting" @click="socialLogin('github')">
            <span class="social-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.2 11.37.6.1.82-.26.82-.58 0-.29-.01-1.24-.02-2.25-3.34.73-4.04-1.42-4.04-1.42-.54-1.38-1.33-1.75-1.33-1.75-1.09-.75.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5 1 .1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.94 0-1.31.47-2.38 1.24-3.22-.14-.3-.54-1.52.1-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0C17 5.92 18 6.23 18 6.23c.65 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.8 5.63-5.48 5.92.43.37.82 1.1.82 2.22v3.29c0 .32.22.69.82.57C20.56 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z"/></svg>
            </span>
            GitHub
          </button>
          <button class="social-btn" type="button" :disabled="submitting" @click="socialLogin('google')">
            <span class="social-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.3v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            </span>
            Google
          </button>
          <button class="social-btn" type="button" :disabled="submitting" @click="socialLogin('wechat')">
            <span class="social-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8.691 2C4.768 2 1.5 4.678 1.5 8c0 1.752.897 3.326 2.295 4.384L1.5 15l3.354-1.706C5.66 13.563 7.148 13.5 8.5 13.5c.002 0 .024-.001.026-.001.026 0-.026 0 0 0 4.224 0 7.191-2.678 7.191-5.5S12.725 2 8.691 2zM7 7.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm4.273 3.675C15.646 11.64 13.207 13 10.5 13c-.002 0 .024-.001.026-.001.026 0-.026 0 0 0-3.19 0-5.5-2-5.5-4s2.31-4 5.5-4c.01 0 .026.001.026.001-.026 0 0 0 0 0 .002-3.191 2.498-5.775 5.547-5.775 4.012 0 7.273 2.678 7.273 5.5 0 .005-.026-.001-.026-.001.026 0 0 0 0 0zM17 13.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm-4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>
            </span>
            微信
          </button>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.login-page { display: grid; min-height: 100dvh; place-items: center; padding: 24px; }
.login-panel { width: min(100%, 420px); padding: 32px; }
.eyebrow { margin: 0; color: var(--color-text-muted); font-family: var(--font-mono, monospace); font-size: 11px; font-weight: 700; letter-spacing: .2em; }
h1 { margin: 12px 0 0; font-family: var(--font-display, sans-serif); font-size: 32px; line-height: 1.1; }
.intro { margin: 12px 0 0; color: var(--color-text-muted); font-size: 14px; line-height: 1.5; }
.login-form { display: grid; gap: 10px; margin-top: 28px; }
label { color: var(--color-text-muted); font-size: 12px; font-weight: 600; }
.ui-input { min-height: 44px; padding: 0 12px; background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border); transition: border-color 180ms ease; }
.ui-input:focus { border-color: var(--color-border-strong); outline: none; }
.ui-button { width: 100%; margin-top: 12px; }
.ui-button--primary { font-weight: 600; }
.form-error { margin: 4px 0 0; color: var(--color-danger); font-size: 13px; }
.auth-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 4px; }
.auth-tab { padding: 8px; font-size: 13px; font-weight: 600; border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text-muted); cursor: pointer; transition: border-color 180ms ease, color 180ms ease; }
.auth-tab--active { border-color: var(--color-border-strong); color: var(--color-text); }
.login-divider { display: flex; align-items: center; gap: 12px; margin-top: 16px; color: var(--color-text-muted); font-size: 12px; }
.login-divider::before, .login-divider::after { content: ''; flex: 1; height: 1px; background: var(--color-border); }
.social-buttons { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 4px; }
.social-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 8px; font-size: 13px; font-weight: 500; border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text); cursor: pointer; transition: border-color 180ms ease, color 180ms ease; }
.social-btn:hover:not(:disabled) { border-color: var(--color-border-strong); color: var(--color-text); }
.social-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.social-icon { display: grid; place-items: center; }
[data-theme="light"] .login-panel { box-shadow: 0 0 40px rgba(217,119,6,.08); }
</style>
