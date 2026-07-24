<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { userStore } from '../stores/userStore'

const route = useRoute()
const router = useRouter()
const errorMessage = ref('')
const submitting = ref(false)
const otpCooldown = ref(0)

/** 登录方式：手机号、邮箱，微信作为社交快捷入口 */
type LoginMode = 'phone' | 'email'
const mode = ref<LoginMode>('phone')

const phone = ref('')
const email = ref('')
const otp = ref('')
const countryCode = ref('+86')
const nextRoute = computed(() => typeof route.query.next === 'string' ? route.query.next : '/app/home')

/** 国家区号选项 */
const countryOptions = [
  { code: '+86', label: '中国' },
  { code: '+1', label: '美国' },
  { code: '+44', label: '英国' },
  { code: '+81', label: '日本' },
  { code: '+91', label: '印度' },
]

/** 当前模式是否输入合法 */
const isInputValid = computed(() => {

  if (mode.value === 'phone') {
    return phone.value.trim().length >= 10
  }
  return email.value.trim().includes('@') && email.value.trim().length > 3
})
const canSendOtp = computed(() => isInputValid.value && otpCooldown.value <= 0 && !submitting.value)

watch(
  () => userStore.status.value,
  (status) => {
    if (status === 'ready') void router.replace(nextRoute.value)
  },
  { immediate: true },
)

watch(otpCooldown, (val) => {
  if (val > 0) setTimeout(() => { otpCooldown.value-- }, 1000)
})

async function sendOtp(): Promise<void> {
  if (!isInputValid.value || otpCooldown.value > 0) return
  submitting.value = true
  errorMessage.value = ''
  try {
    if (mode.value === 'phone') {
      await userStore.sendPhoneOtp(phone.value.trim())
    } else {
      await userStore.sendEmailOtp(email.value.trim())
    }
    otpCooldown.value = 60
  } catch {
    errorMessage.value = '验证码发送失败，请稍后重试'
  } finally {
    submitting.value = false
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

async function socialLogin(provider: 'google' | 'wechat'): Promise<void> {
  submitting.value = true
  errorMessage.value = ''
  try {
    if (provider === 'wechat') {
      errorMessage.value = '微信登录暂未开放，请使用其他方式登录'
      return
    }
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

      <div class="login-form">
        <!-- 第一排：手机号 / 微信 / 邮箱 三个入口 -->
        <div class="login-method-row">
          <button
            :class="['method-btn', mode === 'phone' && 'method-btn--active']"
            type="button"
            @click="mode = 'phone'; errorMessage = ''; otp = ''"
          >手机号</button>
          <button
            class="method-btn method-btn--social"
            type="button"
            :disabled="submitting"
            @click="socialLogin('wechat')"
          >微信</button>
          <button
            :class="['method-btn', mode === 'email' && 'method-btn--active']"
            type="button"
            @click="mode = 'email'; errorMessage = ''; otp = ''"
          >邮箱</button>
        </div>

        <!-- 中间：输入账号 / 手机号 -->
        <template v-if="mode === 'phone' || mode === 'email'">
          <label :for="mode === 'phone' ? 'phone' : 'email'">
            {{ mode === 'phone' ? '手机号' : '邮箱地址' }}
          </label>

          <!-- 手机号模式：国家区号 + 手机号输入 -->
          <div v-if="mode === 'phone'" class="phone-input-group">
            <select
              v-model="countryCode"
              class="country-select"
              :disabled="submitting"
            >
              <option v-for="c in countryOptions" :key="c.code" :value="c.code">
                {{ c.code }} {{ c.label }}
              </option>
            </select>
            <input
              id="phone"
              :value="phone"
              @input="phone = $event.target.value"
              class="ui-input phone-input"
              autocomplete="tel"
              inputmode="numeric"
              placeholder="请输入手机号"
            />
          </div>

          <!-- 邮箱模式：邮箱输入 -->
          <input
            v-else
            id="email"
            :value="email"
            @input="email = $event.target.value"
            class="ui-input"
            autocomplete="email"
            placeholder="you@example.com"
          />

          <!-- 下方：验证通过后才能获取验证码 -->
          <button
            class="ui-button"
            type="button"
            :disabled="!canSendOtp"
            @click="sendOtp"
          >
            {{ submitting ? '发送中…' : otpCooldown > 0 ? `${otpCooldown}s 后重试` : '获取验证码' }}
          </button>

          <template v-if="otp">
            <label for="otp">验证码</label>
            <input
              id="otp"
              v-model="otp"
              class="ui-input"
              autocomplete="one-time-code"
              inputmode="numeric"
              maxlength="8"
              placeholder="000000"
            />
            <button class="ui-button ui-button--primary" type="button" :disabled="submitting" @click="confirmOtp">
              {{ submitting ? '验证中…' : '验证并登录' }}
            </button>
          </template>
        </template>

        <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>

        <div class="login-divider"><span>或</span></div>

        <!-- 移除 GitHub，仅保留 Google -->
        <div class="social-buttons">
          <button class="social-btn" type="button" :disabled="submitting" @click="socialLogin('google')">
            <span class="social-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.3v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            </span>
            Google
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

/* 第一排：手机号 / 微信 / 邮箱 */
.login-method-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 4px;
}
.method-btn {
  padding: 10px 8px;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: border-color 180ms ease, color 180ms ease;
}
.method-btn--active {
  border-color: var(--color-accent);
  color: var(--color-text);
}
.method-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* 手机号输入：国家区号 + 手机号 */
.phone-input-group {
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: 8px;
}
.country-select {
  min-height: 44px;
  padding: 0 8px;
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm, 6px);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 180ms ease;
}
.country-select:focus {
  border-color: var(--color-border-strong);
  outline: none;
}
.country-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.phone-input {
  min-height: 44px;
  padding: 0 12px;
}

.login-divider { display: flex; align-items: center; gap: 12px; margin-top: 16px; color: var(--color-text-muted); font-size: 12px; }
.login-divider::before, .login-divider::after { content: ''; flex: 1; height: 1px; background: var(--color-border); }
.social-buttons { display: grid; grid-template-columns: 1fr; gap: 8px; margin-top: 4px; }
.social-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 8px; font-size: 13px; font-weight: 500; border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text); cursor: pointer; transition: border-color 180ms ease, color 180ms ease; }
.social-btn:hover:not(:disabled) { border-color: var(--color-border-strong); color: var(--color-text); }
.social-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.social-icon { display: grid; place-items: center; }
[data-theme="light"] .login-panel { box-shadow: 0 0 40px rgba(217,119,6,.08); }
[data-theme="platinum"] .login-panel { box-shadow: 0 0 40px rgba(59,130,246,.08), 0 0 0 1px rgba(0,0,0,.04); }
</style>
