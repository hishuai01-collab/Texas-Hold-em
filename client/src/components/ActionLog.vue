<script setup lang="ts">
/**
 * ActionLog.vue
 *
 * 时间轴组件。展示牌桌事件流，按时间倒序排列。
 * 视觉样式完全依赖 css/visual-effects.css 中的 .action-log-* class。
 *
 * Props:
 *  - events : 事件流数组（格式：{ type: string, detail?: string, timestamp?: number }）
 *  - max    : 最大显示条数（默认 20）
 */
import { computed } from 'vue'

export interface LogEntry {
  type: string
  detail?: string
  timestamp?: number
}

const props = withDefaults(
  defineProps<{
    events?: LogEntry[]
    max?: number
  }>(),
  {
    events: () => [],
    max: 20,
  },
)

const displayEvents = computed(() =>
  props.events.slice(0, props.max),
)

function fmtTime(ts?: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
</script>

<template>
  <div v-if="displayEvents.length > 0" class="action-log">
    <div
      v-for="(event, idx) in displayEvents"
      :key="`${event.timestamp ?? idx}-${idx}`"
      class="action-log-item fade-in-up"
      :style="{ animationDelay: `${idx * 20}ms` }"
    >
      <span class="action-log-dot" aria-hidden="true" />
      <div class="flex-1 min-w-0">
        <span class="action-log-label">{{ event.type }}</span>
        <span v-if="event.detail" class="action-log-detail ml-1">· {{ event.detail }}</span>
      </div>
      <span v-if="event.timestamp" class="action-log-timestamp">{{ fmtTime(event.timestamp) }}</span>
    </div>
  </div>

  <!-- 空状态 -->
  <div v-else class="py-8 text-center text-xs text-slate-500">
    暂无事件记录
  </div>
</template>