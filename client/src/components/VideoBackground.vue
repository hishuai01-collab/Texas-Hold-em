<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import {
  getVideoSources,
  VIDEO_OVERLAY_OPACITY,
  VIDEO_PLAYBACK_RATE,
  VIDEO_POSTER,
} from '../config/videoBackground'

/** 是否为移动设备 */
const isMobile = ref(false)

/** 视频是否就绪播放 */
const videoReady = ref(false)

/** 视频加载错误 */
const videoError = ref(false)

/** 当前使用的视频源 */
const currentSource = ref<string | undefined>(undefined)

/** 视频元素引用 */
const videoEl = ref<HTMLVideoElement | null>(null)

/** 移动设备下是否启用视频背景（移动设备耗电耗流量较大） */
const VIDEO_ENABLE_ON_MOBILE = false

/**
 * 检测是否为移动设备
 * 移动设备默认不启用视频背景（省流耗电）
 */
function detectMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

/**
 * 尝试播放视频
 * 浏览器 autoplay 政策要求视频必须静音才能自动播放
 */
async function tryPlayVideo(): Promise<void> {
  if (!videoEl.value) return
  try {
    await videoEl.value.play()
    videoReady.value = true
  } catch {
    // 自动播放失败，等待用户交互
    videoError.value = true
  }
}

/**
 * 视频加载错误处理
 * 尝试下一个视频源，或回退到渐变背景
 */
function handleVideoError(): void {
  videoError.value = true
  videoReady.value = false
  document.body.classList.remove('has-video-bg')
}

/**
 * 设置视频源
 * 按优先级依次尝试远程 URL 和本地文件
 */
function setupVideoSource(): void {
  const sources = getVideoSources()
  if (sources.length === 0) {
    videoError.value = true
    return
  }
  currentSource.value = sources[0]
}

/**
 * 用户交互后重试播放
 */
function handleUserInteraction(): void {
  if (!videoReady.value && !videoError.value && videoEl.value) {
    void tryPlayVideo()
  }
}

onMounted(() => {
  isMobile.value = detectMobile() && !VIDEO_ENABLE_ON_MOBILE
  setupVideoSource()

  if (!isMobile.value && currentSource.value && videoEl.value) {
    videoEl.value.playbackRate = VIDEO_PLAYBACK_RATE
    void tryPlayVideo()
  }

  // 监听用户交互，重试自动播放
  document.addEventListener('click', handleUserInteraction, { once: true })
  document.addEventListener('touchstart', handleUserInteraction, { once: true })
})

onUnmounted(() => {
  document.removeEventListener('click', handleUserInteraction)
  document.removeEventListener('touchstart', handleUserInteraction)
  document.body.classList.remove('has-video-bg')
})

/** 监听移动设备状态变化 */
watch(isMobile, (mobile) => {
  if (mobile && videoEl.value) {
    videoEl.value.pause()
    videoReady.value = false
    document.body.classList.remove('has-video-bg')
  }
})

/** 监听视频就绪状态，添加/移除 body 类 */
watch(videoReady, (ready) => {
  if (ready && !isMobile.value) {
    document.body.classList.add('has-video-bg')
  } else {
    document.body.classList.remove('has-video-bg')
  }
})
</script>

<template>
  <!-- 视频背景容器：固定定位，覆盖整个视口，z-index 最低 -->
  <div
    v-if="!isMobile"
    class="video-bg-container"
    :style="{ '--overlay-opacity': `${VIDEO_OVERLAY_OPACITY}` }"
  >
    <!-- 视频元素 -->
    <video
      v-show="!videoError"
      ref="videoEl"
      class="video-bg-element"
      :src="currentSource"
      :poster="VIDEO_POSTER"
      muted
      loop
      playsinline
      preload="auto"
      aria-hidden="true"
      @error="handleVideoError"
      @loadeddata="() => (videoReady = true)"
    />

    <!-- 暗色遮罩层：保证内容可读性 -->
    <div
      v-if="!videoError"
      class="video-bg-overlay"
      :style="{ opacity: VIDEO_OVERLAY_OPACITY }"
    />

    <!-- 视频加载失败回退：渐变背景 -->
    <div
      v-if="videoError"
      class="video-bg-fallback"
      aria-hidden="true"
    />
  </div>
</template>

<style scoped>
/* 容器：固定定位，覆盖整个视口 */
.video-bg-container {
  position: fixed;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
}

/* 视频元素：覆盖整个视口，保持宽高比 */
.video-bg-element {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center center;
  opacity: 0.85;
  transform: scale(1.05);
}

/* 暗色遮罩层 */
.video-bg-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0.6) 0%,
    rgba(0, 0, 0, 0.4) 50%,
    rgba(0, 0, 0, 0.7) 100%
  );
  pointer-events: none;
}

/* 回退背景：渐变 */
.video-bg-fallback {
  position: absolute;
  inset: 0;
  background: radial-gradient(
      circle at 50% -20%,
      color-mix(in srgb, var(--color-text-muted) 8%, transparent),
      transparent 34%
    ),
    var(--color-canvas);
  pointer-events: none;
}

/* 减少动画偏好：禁用视频 */
@media (prefers-reduced-motion: reduce) {
  .video-bg-element {
    display: none;
  }
  .video-bg-overlay {
    display: none;
  }
  .video-bg-fallback {
    display: block;
  }
}
</style>
