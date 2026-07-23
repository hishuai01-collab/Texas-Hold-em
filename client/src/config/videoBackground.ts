/**
 * videoBackground.ts
 *
 * 全局动态视频背景配置。
 *
 * 支持两种方式指定视频源：
 * 1. 环境变量 VITE_VIDEO_BACKGROUND_URL（推荐用于远程视频）
 * 2. 本地文件 /videos/background.mp4（放置在 public/videos/ 目录下）
 *
 * 使用方法：
 * - 在 .env 文件中设置 VITE_VIDEO_BACKGROUND_URL=https://example.com/video.mp4
 * - 或将视频文件放置到 public/videos/background.mp4
 */

/** 远程视频 URL（通过环境变量配置） */
export const VIDEO_BACKGROUND_URL: string | undefined =
  typeof import.meta !== 'undefined' && import.meta.env
    ? (import.meta.env.VITE_VIDEO_BACKGROUND_URL as string | undefined)
    : undefined

/** 本地视频文件路径（Vite 会自动处理 public 目录下的静态资源） */
export const VIDEO_BACKGROUND_LOCAL: string = '/videos/background.mp4'

/** 浮层遮罩不透明度（0-1），用于保证内容可读性 */
export const VIDEO_OVERLAY_OPACITY: number = 0.55

/** 视频播放速率（1 = 原速） */
export const VIDEO_PLAYBACK_RATE: number = 1.0

/** 移动设备下是否启用视频背景（移动设备耗电耗流量较大） */
export const VIDEO_ENABLE_ON_MOBILE: boolean = false

/**
 * 获取视频源列表（按优先级排序）
 * 返回第一个可用的视频源
 */
export function getVideoSources(): string[] {
  const sources: string[] = []
  if (VIDEO_BACKGROUND_URL) sources.push(VIDEO_BACKGROUND_URL)
  sources.push(VIDEO_BACKGROUND_LOCAL)
  return sources
}

/**
 * 获取海报图片路径（视频加载失败时的回退）
 */
export const VIDEO_POSTER: string = '/videos/poster.jpg'
