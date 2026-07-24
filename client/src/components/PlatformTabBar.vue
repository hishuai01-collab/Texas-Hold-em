<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { soundStore } from '../lib/sound'

const route = useRoute()
const router = useRouter()

interface Tab {
  name: string
  label: string
}

const tabs: Tab[] = [
  { name: 'app-home', label: '首页' },
  { name: 'app-lobby', label: '游戏大厅' },
  { name: 'app-promo', label: '优惠大厅' },
  { name: 'app-profile', label: '个人中心' },
]

function isActive(tabName: string): boolean {
  if (route.name === tabName) return true
  if (tabName === 'app-home' && route.name === 'game-hub') return true
  if (tabName === 'app-lobby' && route.name === 'room-list') return true
  return false
}

function navigate(name: string): void {
  soundStore.playClick()
  void router.push({ name })
}
</script>

<template>
  <nav class="platform-tab-bar" aria-label="主导航">
    <button
      v-for="tab in tabs"
      :key="tab.name"
      type="button"
      class="tab-item"
      :class="{ 'tab-item--active': isActive(tab.name) }"
      @click="navigate(tab.name)"
    >
      <span class="tab-icon" aria-hidden="true">
        <svg v-if="tab.name === 'app-home'" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
        <svg v-if="tab.name === 'app-lobby'" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></svg>
        <svg v-if="tab.name === 'app-promo'" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>
        <svg v-if="tab.name === 'app-profile'" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
      </span>
      <span class="tab-label">{{ tab.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.platform-tab-bar {
  position: fixed;
  inset: auto 0 0;
  z-index: 50;
  display: flex;
  justify-content: space-around;
  align-items: center;
  height: 64px;
  padding-bottom: env(safe-area-inset-bottom);
  border-top: 1px solid var(--color-border);
  background: rgba(15, 20, 23, 0.92);
  backdrop-filter: blur(12px);
}
.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 100%;
  color: var(--color-text-dim);
  background: transparent;
  border: 0;
  cursor: pointer;
  transition: color 180ms ease;
}
.tab-item--active {
  color: var(--color-amber);
}
.tab-icon {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
}
.tab-icon svg {
  width: 22px;
  height: 22px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.tab-label {
  font-family: var(--font-body);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .04em;
}
</style>
