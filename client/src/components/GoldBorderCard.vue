<script setup lang="ts">
/**
 * GoldBorderCard.vue
 *
 * 组件化黄金边框容器。提供装饰性金边包裹内容，
 * 支持多种尺寸、发光强度、以及可选的顶部标题栏。
 *
 * Props:
 *  - glow     : 发光强度 'none' | 'subtle' | 'medium' | 'strong'（默认 'medium'）
 *  - size     : 尺寸 'sm' | 'md' | 'lg'（默认 'md'）
 *  - title    : 可选标题文字
 *  - noPadding: 移除内边距
 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    glow?: 'none' | 'subtle' | 'medium' | 'strong'
    size?: 'sm' | 'md' | 'lg'
    title?: string
    noPadding?: boolean
  }>(),
  {
    glow: 'medium',
    size: 'md',
    title: undefined,
    noPadding: false,
  },
)

const glowClass = computed(() => `glow-${props.glow}`)
const sizeClass = computed(() => `size-${props.size}`)
</script>

<template>
  <section
    class="gold-border-card"
    :class="[glowClass, sizeClass, { 'no-padding': noPadding }]"
  >
    <!-- 装饰性金角 -->
    <span class="gold-corner top-left" aria-hidden="true" />
    <span class="gold-corner top-right" aria-hidden="true" />
    <span class="gold-corner bottom-left" aria-hidden="true" />
    <span class="gold-corner bottom-right" aria-hidden="true" />

    <!-- 顶部标题栏 -->
    <div v-if="title" class="gold-header">
      <span class="gold-header-line left" aria-hidden="true" />
      <h3 class="gold-title">{{ title }}</h3>
      <span class="gold-header-line right" aria-hidden="true" />
    </div>

    <!-- 内容区 -->
    <div class="gold-content">
      <slot />
    </div>
  </section>
</template>

<style scoped>
/* ── 容器 ── */
.gold-border-card {
  position: relative;
  border: 1px solid rgba(212, 175, 55, 0.35);
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(20, 16, 8, 0.92), rgba(30, 24, 12, 0.88));
  backdrop-filter: blur(4px);
  transition: border-color 0.3s, box-shadow 0.3s;
}

/* ── 尺寸 ── */
.size-sm { padding: 10px 14px; font-size: 0.8rem; }
.size-md { padding: 16px 20px; font-size: 0.9rem; }
.size-lg { padding: 24px 28px; font-size: 1rem; }
.no-padding { padding: 0 !important; }

/* ── 发光强度 ── */
.glow-none {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}
.glow-subtle {
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.3),
    0 0 6px rgba(212, 175, 55, 0.08);
}
.glow-medium {
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.35),
    0 0 12px rgba(212, 175, 55, 0.12),
    inset 0 0 20px rgba(212, 175, 55, 0.03);
}
.glow-strong {
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.4),
    0 0 24px rgba(212, 175, 55, 0.2),
    inset 0 0 30px rgba(212, 175, 55, 0.05);
}

.glow-medium,
.glow-strong {
  border-color: rgba(212, 175, 55, 0.5);
}

/* ── 金角装饰 ── */
.gold-corner {
  position: absolute;
  width: 16px;
  height: 16px;
  border-color: rgba(212, 175, 55, 0.6);
  border-style: solid;
  pointer-events: none;
  opacity: 0.7;
  transition: opacity 0.3s;
}

.gold-border-card:hover .gold-corner {
  opacity: 1;
}

.top-left {
  top: -1px;
  left: -1px;
  border-width: 2px 0 0 2px;
  border-radius: 4px 0 0 0;
}
.top-right {
  top: -1px;
  right: -1px;
  border-width: 2px 2px 0 0;
  border-radius: 0 4px 0 0;
}
.bottom-left {
  bottom: -1px;
  left: -1px;
  border-width: 0 0 2px 2px;
  border-radius: 0 0 0 4px;
}
.bottom-right {
  bottom: -1px;
  right: -1px;
  border-width: 0 2px 2px 0;
  border-radius: 0 0 4px 0;
}

/* ── 标题栏 ── */
.gold-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(212, 175, 55, 0.2);
}

.gold-header-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(
    to right,
    transparent,
    rgba(212, 175, 55, 0.4) 30%,
    rgba(212, 175, 55, 0.4) 70%,
    transparent
  );
}

.gold-title {
  margin: 0;
  font-size: 0.85em;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #d4af37;
  white-space: nowrap;
}

/* ── 内容区 ── */
.gold-content {
  position: relative;
  z-index: 1;
}
</style>