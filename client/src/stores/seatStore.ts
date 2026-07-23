import { ref } from 'vue'

const storageKey = 'poker.room.confirmedSeat'
const confirmedTableId = ref<string | null>(sessionStorage.getItem(storageKey))

function confirm(tableId: string): void {
  confirmedTableId.value = tableId
  sessionStorage.setItem(storageKey, tableId)
}

function canEnter(tableId: string): boolean {
  return confirmedTableId.value === tableId
}

function clear(): void {
  confirmedTableId.value = null
  sessionStorage.removeItem(storageKey)
}

export const seatStore = {
  confirmedTableId,
  confirm,
  canEnter,
  clear,
}
