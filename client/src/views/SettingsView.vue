<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { soundStore } from '../lib/sound'
import { themeStore } from '../stores/themeStore'

const router = useRouter()

/* ── 主题配置 ── */

const currentPreset = computed(() => themeStore.currentPreset.value)
const config = computed(() => themeStore.config.value)
const presets = themeStore.presets

const themeMode = computed({
  get: () => config.value.mode,
  set: (v: 'dark' | 'light' | 'platinum' | 'system') => themeStore.setMode(v),
})

const fontSize = computed({
  get: () => config.value.fontSize,
  set: (v: number) => themeStore.setFontSize(v),
})

const reducedMotion = computed({
  get: () => config.value.reducedMotion,
  set: (v: boolean) => themeStore.setReducedMotion(v),
})

const highContrast = computed({
  get: () => config.value.highContrast,
  set: (v: boolean) => themeStore.setHighContrast(v),
})

/* ── 音效 ── */

const soundEnabled = computed({
  get: () => !soundStore.muted.value,
  set: (v: boolean) => { soundStore.setMuted(!v) },
})

const sfxVolume = computed({
  get: () => soundStore.sfxVolume.value,
  set: (v: number) => { soundStore.setSfxVolume(v) },
})

const bgmVolume = computed({
  get: () => soundStore.bgmVolume.value,
  set: (v: number) => { soundStore.setBgmVolume(v) },
})

/* ── 其他设置 ── */

const videoBg = ref(false)
const autoReconnect = ref(true)
const showBalance = ref(true)
const notifications = ref(true)
const haptics = ref(true)

const toggleSettings = computed(() => [
  { key: 'sound', label: '音效与音乐', desc: '牌桌音效与背景音乐总开关', value: soundEnabled.value },
  { key: 'video', label: '视频背景', desc: '开启沉浸式动态背景', value: videoBg.value },
  { key: 'reconnect', label: '断线自动重连', desc: '网络恢复后自动回到牌桌', value: autoReconnect.value },
  { key: 'balance', label: '公开余额', desc: '在房间列表中显示余额', value: showBalance.value },
  { key: 'notifications', label: '推送通知', desc: '接收比赛开始、好友邀请等通知', value: notifications.value },
  { key: 'haptics', label: '触感反馈', desc: '操作时振动反馈', value: haptics.value },
])

function toggle(key: string): void {
  if (key === 'sound') soundEnabled.value = !soundEnabled.value
  if (key === 'video') videoBg.value = !videoBg.value
  if (key === 'reconnect') autoReconnect.value = !autoReconnect.value
  if (key === 'balance') showBalance.value = !showBalance.value
  if (key === 'notifications') notifications.value = !notifications.value
  if (key === 'haptics') haptics.value = !haptics.value
}

function setVolume(key: string, value: number): void {
  if (key === 'sfxVolume') sfxVolume.value = value
  if (key === 'bgmVolume') bgmVolume.value = value
}

function clearCache(): void {
  localStorage.clear()
  window.location.reload()
}

function alert(msg: string): void {
  window.alert(msg)
}

function goBack(): void {
  void router.back()
}

/* ── 字体大小标签 ── */

const fontSizeLabel = computed(() => {
  const v = fontSize.value
  if (v <= 0.85) return '小'
  if (v <= 1.05) return '标准'
  if (v <= 1.2) return '大'
  return '特大'
})
</script>

<template>
  <main class="ui-page settings-page">
    <header class="settings-header">
      <button class="back-btn" type="button" @click="goBack" aria-label="返回个人中心">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
      </button>
      <div>
        <h1>设置</h1>
        <p class="subtitle">全局偏好与账户管理</p>
      </div>
    </header>

    <!-- ═══ 主题配置 ═══ -->
    <section class="settings-section" aria-label="主题配置">
      <h2 class="settings-section__title">🎨 主题配置</h2>
      <div class="settings-list">
        <!-- 当前主题预览 -->
        <div class="theme-preview">
          <div class="theme-preview__felt" :style="{ background: `linear-gradient(135deg, var(--color-felt), var(--color-felt-dark))` }">
            <div class="theme-preview__card" :style="{ background: `var(--color-card-back)` }">
              <span class="theme-preview__card-dot" :style="{ background: `var(--color-card-back-pattern)` }" />
            </div>
            <div class="theme-preview__chip" :style="{ background: `var(--color-chip-primary)` }" />
            <div class="theme-preview__chip theme-preview__chip--sec" :style="{ background: `var(--color-chip-secondary)` }" />
          </div>
          <div class="theme-preview__info">
            <span class="theme-preview__name">{{ currentPreset.icon }} {{ currentPreset.name }}</span>
            <span class="theme-preview__desc">{{ currentPreset.desc }}</span>
          </div>
        </div>

        <!-- 预设皮肤选择 -->
        <div class="preset-grid">
          <button
            v-for="p in presets"
            :key="p.id"
            type="button"
            class="preset-card"
            :class="{ 'preset-card--active': currentPreset.id === p.id }"
            @click="themeStore.setPreset(p.id)"
          >
            <div class="preset-card__swatch">
              <span class="preset-card__icon">{{ p.icon }}</span>
              <div class="preset-card__bar" :style="{ background: p.colors.felt }" />
              <div class="preset-card__bar" :style="{ background: p.colors.chipPrimary }" />
              <div class="preset-card__bar" :style="{ background: p.colors.cardBack }" />
            </div>
            <span class="preset-card__name">{{ p.name }}</span>
          </button>
        </div>

        <!-- 深浅模式 -->
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">显示模式</span>
            <span class="setting-desc">深色 / 浅色 / 白金 / 跟随系统</span>
          </div>
          <div class="mode-selector">
            <button
              type="button"
              class="mode-btn"
              :class="{ 'mode-btn--active': themeMode === 'dark' }"
              @click="themeMode = 'dark'"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
              <span>深色</span>
            </button>
            <button
              type="button"
              class="mode-btn"
              :class="{ 'mode-btn--active': themeMode === 'light' }"
              @click="themeMode = 'light'"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
              <span>浅色</span>
            </button>
            <button
              type="button"
              class="mode-btn"
              :class="{ 'mode-btn--active': themeMode === 'platinum' }"
              @click="themeMode = 'platinum'"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="4" /></svg>
              <span>白金</span>
            </button>
            <button
              type="button"
              class="mode-btn"
              :class="{ 'mode-btn--active': themeMode === 'system' }"
              @click="themeMode = 'system'"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
              <span>系统</span>
            </button>
          </div>
        </div>

        <!-- 字体大小 -->
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">字体大小</span>
            <span class="setting-desc">当前：{{ fontSizeLabel }}（{{ Math.round(fontSize * 100) }}%）</span>
          </div>
          <div class="font-slider-wrap">
            <span class="font-slider__label">A</span>
            <input
              type="range"
              class="font-slider"
              min="0.8"
              max="1.4"
              step="0.05"
              :value="fontSize"
              @input="fontSize = Number(($event.target as HTMLInputElement).value)"
            />
            <span class="font-slider__label font-slider__label--lg">A</span>
          </div>
        </div>

        <!-- 高对比度 -->
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">高对比度模式</span>
            <span class="setting-desc">增强文字与背景对比度，更清晰易读</span>
          </div>
          <button
            type="button"
            class="toggle"
            :class="{ 'toggle--on': highContrast }"
            :aria-pressed="highContrast"
            @click="highContrast = !highContrast"
          >
            <span class="toggle__thumb" />
          </button>
        </div>

        <!-- 减弱动画 -->
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">减弱动画效果</span>
            <span class="setting-desc">减少界面动效，降低视觉疲劳</span>
          </div>
          <button
            type="button"
            class="toggle"
            :class="{ 'toggle--on': reducedMotion }"
            :aria-pressed="reducedMotion"
            @click="reducedMotion = !reducedMotion"
          >
            <span class="toggle__thumb" />
          </button>
        </div>
      </div>
    </section>

    <!-- ═══ 基础设置 ═══ -->
    <section class="settings-section" aria-label="基础设置">
      <h2 class="settings-section__title">⚙️ 基础设置</h2>
      <div class="settings-list">
        <div v-for="item in toggleSettings" :key="item.key" class="setting-row">
          <div class="setting-info">
            <span class="setting-label">{{ item.label }}</span>
            <span v-if="item.desc" class="setting-desc">{{ item.desc }}</span>
          </div>
          <button
            type="button"
            class="toggle"
            :class="{ 'toggle--on': item.value }"
            :aria-pressed="item.value"
            @click="toggle(item.key)"
          >
            <span class="toggle__thumb" />
          </button>
        </div>
      </div>
    </section>

    <!-- ═══ 声音 ═══ -->
    <section class="settings-section" aria-label="声音">
      <h2 class="settings-section__title">🔊 声音</h2>
      <div class="settings-list">
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">交互音效音量</span>
            <span class="setting-desc">按钮点击与牌桌音效</span>
          </div>
          <input
            type="range"
            class="volume-slider"
            min="0"
            max="100"
            :value="Math.round(sfxVolume * 100)"
            @input="setVolume('sfxVolume', Number(($event.target as HTMLInputElement).value) / 100)"
          />
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">背景音乐音量</span>
            <span class="setting-desc">牌桌环境音与背景音乐</span>
          </div>
          <input
            type="range"
            class="volume-slider"
            min="0"
            max="100"
            :value="Math.round(bgmVolume * 100)"
            @input="setVolume('bgmVolume', Number(($event.target as HTMLInputElement).value) / 100)"
          />
        </div>
      </div>
    </section>

    <!-- ═══ 账号安全 ═══ -->
    <section class="settings-section" aria-label="账号安全">
      <h2 class="settings-section__title">🔒 账号安全</h2>
      <div class="settings-list">
        <button class="setting-row setting-row--link" type="button" @click="alert('修改密码功能尚未接入')">
          <div class="setting-info">
            <span class="setting-label">修改密码</span>
            <span class="setting-desc">定期更换密码保护账户</span>
          </div>
          <span class="menu-item__arrow">&rarr;</span>
        </button>
        <button class="setting-row setting-row--link" type="button" @click="alert('绑定手机功能尚未接入')">
          <div class="setting-info">
            <span class="setting-label">绑定手机</span>
            <span class="setting-desc">增强账号安全与找回</span>
          </div>
          <span class="menu-item__arrow">&rarr;</span>
        </button>
        <button class="setting-row setting-row--link" type="button" @click="alert('登录设备功能尚未接入')">
          <div class="setting-info">
            <span class="setting-label">登录设备</span>
            <span class="setting-desc">查看与管理已登录设备</span>
          </div>
          <span class="menu-item__arrow">&rarr;</span>
        </button>
      </div>
    </section>

    <!-- ═══ 数据 ═══ -->
    <section class="settings-section" aria-label="数据">
      <h2 class="settings-section__title">📊 数据</h2>
      <div class="settings-list">
        <button class="setting-row setting-row--link" type="button" @click="clearCache">
          <div class="setting-info">
            <span class="setting-label">清除缓存</span>
            <span class="setting-desc">清理本地数据</span>
          </div>
          <span class="menu-item__arrow">&rarr;</span>
        </button>
        <button class="setting-row setting-row--link" type="button" @click="alert('导出数据功能尚未接入')">
          <div class="setting-info">
            <span class="setting-label">导出数据</span>
            <span class="setting-desc">导出游戏历史记录</span>
          </div>
          <span class="menu-item__arrow">&rarr;</span>
        </button>
      </div>
    </section>

    <!-- ═══ 关于 ═══ -->
    <section class="settings-section" aria-label="关于">
      <h2 class="settings-section__title">ℹ️ 关于</h2>
      <div class="settings-list">
        <button class="setting-row setting-row--link" type="button" @click="alert('帮助中心正在建设中')">
          <div class="setting-info">
            <span class="setting-label">帮助中心</span>
            <span class="setting-desc">常见问题与客服</span>
          </div>
          <span class="menu-item__arrow">&rarr;</span>
        </button>
        <button class="setting-row setting-row--link" type="button" @click="alert('用户协议页面正在建设中')">
          <div class="setting-info">
            <span class="setting-label">用户协议</span>
            <span class="setting-desc">查看服务条款与隐私政策</span>
          </div>
          <span class="menu-item__arrow">&rarr;</span>
        </button>
      </div>
    </section>

  </main>
</template>

<style scoped>
.settings-page { padding: 24px; padding-bottom: 88px; }
.settings-header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
.back-btn { display: grid; place-items: center; width: 40px; height: 40px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface-raised); color: var(--color-text-muted); cursor: pointer; transition: border-color 180ms ease, color 180ms ease; }
.back-btn:hover { border-color: var(--color-border-strong); color: var(--color-text); }
.settings-header h1 { margin: 0; font-family: var(--font-display); font-size: 32px; letter-spacing: -.02em; }
.subtitle { margin: 8px 0 0; color: var(--color-text-muted); font-size: 14px; }

.settings-section { margin-top: 28px; max-width: 720px; }
.settings-section__title { margin: 0 0 10px; color: var(--color-text-muted); font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: .16em; }
.settings-list { border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: linear-gradient(135deg, var(--color-surface), var(--color-surface-raised)); box-shadow: var(--shadow-panel); overflow: hidden; }
.setting-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 20px; border-bottom: 1px solid var(--color-border); }
.setting-row:last-child { border-bottom: 0; }
.setting-info { display: grid; gap: 4px; }
.setting-label { font-weight: 600; font-size: 15px; }
.setting-desc { color: var(--color-text-muted); font-size: 12px; line-height: 1.4; }
.setting-row--link { width: 100%; text-align: left; cursor: pointer; background: none; color: var(--color-text); transition: background 180ms ease; }
.setting-row--link:hover { background: rgba(255, 255, 255, 0.02); }
.menu-item__arrow { color: var(--color-text-dim); font-family: var(--font-mono); font-size: 12px; }

/* ── 主题预览 ── */
.theme-preview { display: flex; align-items: center; gap: 16px; padding: 18px 20px; border-bottom: 1px solid var(--color-border); }
.theme-preview__felt { position: relative; width: 80px; height: 60px; border-radius: var(--radius-md); overflow: hidden; flex-shrink: 0; }
.theme-preview__card { position: absolute; top: 12px; left: 10px; width: 28px; height: 38px; border-radius: 3px; display: grid; place-items: center; transform: rotate(-8deg); }
.theme-preview__card-dot { width: 10px; height: 10px; border-radius: 50%; opacity: .6; }
.theme-preview__chip { position: absolute; bottom: 8px; right: 8px; width: 18px; height: 18px; border-radius: 50%; border: 2px solid rgba(0,0,0,.2); }
.theme-preview__chip--sec { right: 28px; }
.theme-preview__info { display: grid; gap: 2px; }
.theme-preview__name { font-weight: 700; font-size: 15px; }
.theme-preview__desc { color: var(--color-text-muted); font-size: 12px; }

/* ── 预设皮肤网格 ── */
.preset-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; padding: 16px 20px; border-bottom: 1px solid var(--color-border); }
.preset-card { display: grid; gap: 8px; padding: 12px 8px; border: 2px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface-raised); cursor: pointer; text-align: center; transition: border-color 180ms ease, transform 180ms ease; }
.preset-card:hover { border-color: var(--color-border-strong); transform: translateY(-2px); }
.preset-card--active { border-color: var(--color-amber); box-shadow: 0 0 12px color-mix(in srgb, var(--color-amber) 20%, transparent); }
.preset-card__swatch { display: flex; flex-direction: column; gap: 3px; align-items: center; }
.preset-card__icon { font-size: 20px; line-height: 1; }
.preset-card__bar { width: 28px; height: 6px; border-radius: 3px; }
.preset-card__name { font-size: 11px; font-weight: 600; color: var(--color-text-muted); line-height: 1.2; }
.preset-card--active .preset-card__name { color: var(--color-text); }

/* ── 模式选择器 ── */
.mode-selector { display: flex; gap: 6px; }
.mode-btn { display: flex; align-items: center; gap: 6px; padding: 8px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface-raised); color: var(--color-text-muted); cursor: pointer; font-size: 12px; font-weight: 600; transition: all 180ms ease; }
.mode-btn:hover { border-color: var(--color-border-strong); color: var(--color-text); }
.mode-btn--active { border-color: var(--color-amber); color: var(--color-amber); background: color-mix(in srgb, var(--color-amber) 10%, var(--color-surface)); }

/* ── 字体大小滑块 ── */
.font-slider-wrap { display: flex; align-items: center; gap: 8px; }
.font-slider { width: 100px; accent-color: var(--color-amber); cursor: pointer; }
.font-slider__label { font-size: 12px; font-weight: 700; color: var(--color-text-muted); }
.font-slider__label--lg { font-size: 18px; }

/* ── 开关 ── */
.toggle { position: relative; width: 48px; height: 28px; border-radius: var(--radius-pill); border: 1px solid var(--color-border); background: var(--color-surface-raised); cursor: pointer; transition: background 180ms ease, border-color 180ms ease; flex-shrink: 0; }
.toggle--on { background: var(--color-amber); border-color: var(--color-amber); }
.toggle__thumb { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: var(--color-text); box-shadow: var(--shadow-panel); transition: transform 180ms ease; }
.toggle--on .toggle__thumb { transform: translateX(20px); background: var(--color-amber); }

/* ── 音量滑块 ── */
.volume-slider { width: 120px; accent-color: var(--color-amber); cursor: pointer; }

@media (max-width: 480px) {
  .preset-grid { grid-template-columns: repeat(2, 1fr); }
  .mode-selector { flex-wrap: wrap; }
  .mode-btn { flex: 1; justify-content: center; }
}
</style>