import { ref } from 'vue'

/* ── 类型定义 ── */

export interface ThemeColors {
  felt: string           // 牌桌绿色
  feltDark: string       // 牌桌深色
  feltLight: string      // 牌桌亮色
  cardBack: string       // 牌背颜色
  cardBackPattern: string // 牌背花纹色
  chipPrimary: string    // 筹码主色
  chipSecondary: string  // 筹码辅色
  accent: string         // 强调色（按钮、高亮）
  accentDark: string     // 强调色深色
  wood: string           // 木纹色
  woodDark: string       // 木纹深色
  surface: string        // 面板背景
  surfaceRaised: string  // 面板凸起
  border: string         // 边框
  borderStrong: string   // 边框强
  text: string           // 文字
  textMuted: string      // 文字弱
  canvas: string         // 页面背景
}

export interface ThemePreset {
  id: string
  name: string
  desc: string
  icon: string           // emoji 图标
  colors: ThemeColors
}

export interface ThemeConfig {
  presetId: string
  mode: 'dark' | 'light' | 'platinum' | 'system'
  fontSize: number
  reducedMotion: boolean
  highContrast: boolean
}

/* ── 预设皮肤 ── */

const PRESETS: ThemePreset[] = [
  {
    id: 'classic-green',
    name: '经典绿桌',
    desc: '传统赌场绿色绒面',
    icon: '🟢',
    colors: {
      felt: '#0d7040',
      feltDark: '#0a3d27',
      feltLight: '#1f7a52',
      cardBack: '#1a3a5c',
      cardBackPattern: '#2a5a8c',
      chipPrimary: '#fbbf24',
      chipSecondary: '#ef4444',
      accent: '#fbbf24',
      accentDark: '#d97706',
      wood: '#5c3d2e',
      woodDark: '#3e2818',
      surface: '#151c20',
      surfaceRaised: '#1a2328',
      border: '#2a3640',
      borderStrong: '#3a4852',
      text: '#f5f5f4',
      textMuted: '#a8b5bc',
      canvas: '#0f1417',
    },
  },
  {
    id: 'neon-dark',
    name: '暗黑霓虹',
    desc: '赛博朋克霓虹风格',
    icon: '💜',
    colors: {
      felt: '#1a0a2e',
      feltDark: '#0d0518',
      feltLight: '#2d1b4e',
      cardBack: '#0d0d2b',
      cardBackPattern: '#3a3a8c',
      chipPrimary: '#22d3ee',
      chipSecondary: '#f472b6',
      accent: '#a78bfa',
      accentDark: '#7c3aed',
      wood: '#1e1b4b',
      woodDark: '#0f0d2e',
      surface: '#0f0a1a',
      surfaceRaised: '#1a122e',
      border: '#2a1a4a',
      borderStrong: '#4a2a6a',
      text: '#f0e6ff',
      textMuted: '#9a8ab5',
      canvas: '#080410',
    },
  },
  {
    id: 'wood-vintage',
    name: '复古木纹',
    desc: '经典木质牌桌质感',
    icon: '🪵',
    colors: {
      felt: '#2d5a27',
      feltDark: '#1a3a15',
      feltLight: '#3a7a32',
      cardBack: '#4a2a1a',
      cardBackPattern: '#6a3a2a',
      chipPrimary: '#d4a835',
      chipSecondary: '#c0392b',
      accent: '#d4a835',
      accentDark: '#b3872a',
      wood: '#5c3d2e',
      woodDark: '#3e2818',
      surface: '#1a1410',
      surfaceRaised: '#2a1e18',
      border: '#3a2a1e',
      borderStrong: '#5a3a2a',
      text: '#f0e6d8',
      textMuted: '#a09080',
      canvas: '#0f0a08',
    },
  },
  {
    id: 'high-contrast',
    name: '高对比度',
    desc: '清晰易读，无障碍优化',
    icon: '♿',
    colors: {
      felt: '#006633',
      feltDark: '#004422',
      feltLight: '#008844',
      cardBack: '#003366',
      cardBackPattern: '#005599',
      chipPrimary: '#ffcc00',
      chipSecondary: '#ff3300',
      accent: '#ffcc00',
      accentDark: '#ff9900',
      wood: '#663300',
      woodDark: '#442200',
      surface: '#000000',
      surfaceRaised: '#1a1a1a',
      border: '#ffffff',
      borderStrong: '#ffffff',
      text: '#ffffff',
      textMuted: '#cccccc',
      canvas: '#000000',
    },
  },
  {
    id: 'platinum',
    name: '白金',
    desc: '清冷的白蓝配色，优雅简洁',
    icon: '💎',
    colors: {
      felt: '#1a6b8a',
      feltDark: '#0d4a62',
      feltLight: '#2a8aaa',
      cardBack: '#1e3a5c',
      cardBackPattern: '#2a5a8c',
      chipPrimary: '#3b82f6',
      chipSecondary: '#60a5fa',
      accent: '#3b82f6',
      accentDark: '#2563eb',
      wood: '#2d4a5c',
      woodDark: '#1a3040',
      surface: '#f0f4f8',
      surfaceRaised: '#e2e8f0',
      border: '#cbd5e1',
      borderStrong: '#94a3b8',
      text: '#0f172a',
      textMuted: '#475569',
      canvas: '#f8fafc',
    },
  },
]

/* ── Light 模式颜色映射（基于当前 preset 自动计算） ── */

function lighten(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, (num >> 16) + amount)
  const g = Math.min(255, ((num >> 8) & 0x00ff) + amount)
  const b = Math.min(255, (num & 0x0000ff) + amount)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

function generateLightColors(preset: ThemePreset): ThemeColors {
  return {
    felt: lighten(preset.colors.felt, 180),
    feltDark: lighten(preset.colors.feltDark, 160),
    feltLight: lighten(preset.colors.feltLight, 180),
    cardBack: lighten(preset.colors.cardBack, 160),
    cardBackPattern: lighten(preset.colors.cardBackPattern, 140),
    chipPrimary: preset.colors.chipPrimary,
    chipSecondary: preset.colors.chipSecondary,
    accent: preset.colors.accentDark,
    accentDark: preset.colors.accent,
    wood: lighten(preset.colors.wood, 100),
    woodDark: lighten(preset.colors.woodDark, 80),
    surface: '#ffffff',
    surfaceRaised: '#f5f4f0',
    border: '#e7e5e0',
    borderStrong: '#d6d3cd',
    text: '#1c1917',
    textMuted: '#78716c',
    canvas: '#fafaf8',
  }
}

function generatePlatinumColors(preset: ThemePreset): ThemeColors {
  return {
    felt: '#1a6b8a',
    feltDark: '#0d4a62',
    feltLight: '#2a8aaa',
    cardBack: '#1e3a5c',
    cardBackPattern: '#2a5a8c',
    chipPrimary: '#3b82f6',
    chipSecondary: '#60a5fa',
    accent: '#3b82f6',
    accentDark: '#2563eb',
    wood: '#2d4a5c',
    woodDark: '#1a3040',
    surface: '#f0f4f8',
    surfaceRaised: '#e2e8f0',
    border: '#cbd5e1',
    borderStrong: '#94a3b8',
    text: '#0f172a',
    textMuted: '#475569',
    canvas: '#f8fafc',
  }
}

/* ── Store ── */

const STORAGE_KEY = 'poker.theme.v2'

function readConfig(): ThemeConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as ThemeConfig
  } catch { /* noop */ }
  return {
    presetId: 'classic-green',
    mode: 'dark',
    fontSize: 1,
    reducedMotion: false,
    highContrast: false,
  }
}

function getPreset(id: string): ThemePreset {
  return PRESETS.find(p => p.id === id) ?? PRESETS[0]
}

const config = ref<ThemeConfig>(readConfig())
const currentPreset = ref<ThemePreset>(getPreset(config.value.presetId))

/* ── 系统主题监听 ── */

let systemDarkMedia: MediaQueryList | null = null
let systemListener: (() => void) | null = null

function getEffectiveMode(): 'dark' | 'light' | 'platinum' {
   if (config.value.mode === 'system') {
     return systemDarkMedia?.matches ? 'dark' : 'light'
   }
   return config.value.mode
 }

 function applyTheme(): void {
   const preset = currentPreset.value
   const mode = getEffectiveMode()
   const isDark = mode === 'dark'
   const isPlatinum = mode === 'platinum'
   const colors = isDark ? preset.colors : (isPlatinum ? generatePlatinumColors(preset) : generateLightColors(preset))

   const root = document.documentElement
   root.dataset.theme = isPlatinum ? 'platinum' : (isDark ? 'dark' : 'light')
   root.dataset.preset = preset.id
   root.dataset.highContrast = config.value.highContrast ? 'true' : 'false'

  // 字体缩放
  root.style.fontSize = `${config.value.fontSize * 100}%`

  // 动画减弱
  if (config.value.reducedMotion) {
    root.dataset.reducedMotion = 'true'
  } else {
    delete root.dataset.reducedMotion
  }

  // 应用所有颜色变量
  const map: Record<string, string> = {
    '--color-felt': colors.felt,
    '--color-felt-dark': colors.feltDark,
    '--color-felt-light': colors.feltLight,
    '--color-card-back': colors.cardBack,
    '--color-card-back-pattern': colors.cardBackPattern,
    '--color-chip-primary': colors.chipPrimary,
    '--color-chip-secondary': colors.chipSecondary,
    '--color-accent': colors.accent,
    '--color-accent-dark': colors.accentDark,
    '--color-wood': colors.wood,
    '--color-wood-dark': colors.woodDark,
    '--color-surface': colors.surface,
    '--color-surface-raised': colors.surfaceRaised,
    '--color-border': colors.border,
    '--color-border-strong': colors.borderStrong,
    '--color-text': colors.text,
    '--color-text-muted': colors.textMuted,
    '--color-canvas': colors.canvas,
  }

  for (const [key, value] of Object.entries(map)) {
    root.style.setProperty(key, value)
  }

  // 持久化
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config.value))
}

/* ── 系统主题监听 ── */

function startSystemThemeListener(): void {
  systemDarkMedia = window.matchMedia('(prefers-color-scheme: dark)')
  systemListener = () => applyTheme()
  systemDarkMedia.addEventListener('change', systemListener)
}

function stopSystemThemeListener(): void {
  if (systemDarkMedia && systemListener) {
    systemDarkMedia.removeEventListener('change', systemListener)
  }
}

/* ── 公共 API ── */

export const themeStore = {
  config,
  currentPreset,
  presets: PRESETS,

  /** 切换预设皮肤 */
  setPreset(id: string): void {
    config.value.presetId = id
    currentPreset.value = getPreset(id)
    applyTheme()
  },

  /** 设置深浅模式 */
  setMode(mode: 'dark' | 'light' | 'platinum' | 'system'): void {
    config.value.mode = mode
    if (mode === 'system') {
      startSystemThemeListener()
    } else {
      stopSystemThemeListener()
    }
    applyTheme()
  },

  /** 设置字体缩放 */
  setFontSize(size: number): void {
    config.value.fontSize = Math.max(0.8, Math.min(1.4, size))
    applyTheme()
  },

  /** 设置动画减弱 */
  setReducedMotion(v: boolean): void {
    config.value.reducedMotion = v
    applyTheme()
  },

  /** 设置高对比度 */
  setHighContrast(v: boolean): void {
    config.value.highContrast = v
    applyTheme()
  },

  /** 获取有效模式（解析 system） */
  getEffectiveMode,

  /** 初始化 */
  init(): void {
    if (config.value.mode === 'system') {
      startSystemThemeListener()
    }
    applyTheme()
  },

  /** 销毁 */
  destroy(): void {
    stopSystemThemeListener()
  },
}