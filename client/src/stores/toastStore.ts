import { ref } from 'vue'

export type ToastTone = 'error' | 'info' | 'success'

export interface ToastItem {
  id: number
  message: string
  tone: ToastTone
}

const items = ref<ToastItem[]>([])
let nextId = 0

function dismiss(id: number): void {
  items.value = items.value.filter((item) => item.id !== id)
}

function push(message: string, tone: ToastTone = 'error', duration = 5000): void {
  const id = ++nextId
  items.value.push({ id, message, tone })
  window.setTimeout(() => dismiss(id), duration)
}

export const toastStore = {
  items,
  push,
  dismiss,
}
