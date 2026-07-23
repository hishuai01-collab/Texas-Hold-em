import { Howl, Howler } from 'howler'
import { ref } from 'vue'

export type PokerSound = 'deal' | 'check' | 'fold' | 'call' | 'raise' | 'win' | 'lose' | 'street'

const mutedStorageKey = 'poker.sound.muted'

function createWavDataUri(
  duration: number,
  sampleRate: number,
  sampleAt: (time: number, progress: number) => number,
): string {
  const sampleCount = Math.floor(sampleRate * duration)
  const bytes = new Uint8Array(44 + sampleCount * 2)
  const view = new DataView(bytes.buffer)
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index)
  }

  writeText(0, 'RIFF')
  view.setUint32(4, 36 + sampleCount * 2, true)
  writeText(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, sampleCount * 2, true)

  for (let index = 0; index < sampleCount; index += 1) {
    const sample = sampleAt(index / sampleRate, index / sampleCount)
    view.setInt16(44 + index * 2, Math.round(sample * 0x7fff), true)
  }

  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return `data:audio/wav;base64,${btoa(binary)}`
}

function createToneDataUri(frequency: number, duration = 0.09): string {
  return createWavDataUri(duration, 8_000, (time, progress) => {
    const envelope = 1 - progress
    return Math.sin(time * frequency * Math.PI * 2) * envelope * 0.32
  })
}

function createAmbientDataUri(): string {
  const duration = 6
  return createWavDataUri(duration, 6_000, (time, progress) => {
    // A quiet, seamless three-note pad; it is intentionally background texture,
    // not a gameplay signal competing with the eight event sounds.
    const edge = Math.min(1, progress * 14, (1 - progress) * 14)
    const pulse = 0.74 + Math.sin(time * Math.PI * 2 / 3) * 0.12
    const chord =
      Math.sin(time * 65.41 * Math.PI * 2) * 0.52
      + Math.sin(time * 82.41 * Math.PI * 2) * 0.29
      + Math.sin(time * 98 * Math.PI * 2) * 0.19
    return chord * edge * pulse * 0.075
  })
}

const soundFrequencies: Record<PokerSound, number> = {
  deal: 530,
  check: 360,
  fold: 180,
  call: 420,
  raise: 640,
  win: 760,
  lose: 140,
  street: 580,
}

const muted = ref(typeof window === 'undefined' || localStorage.getItem(mutedStorageKey) !== 'false')
const sounds = Object.fromEntries(
  Object.entries(soundFrequencies).map(([event, frequency]) => [
    event,
    new Howl({ src: [createToneDataUri(frequency)], volume: 0.22, preload: true }),
  ]),
) as Record<PokerSound, Howl>
const ambience = new Howl({
  src: [createAmbientDataUri()],
  volume: 0.18,
  loop: true,
  preload: true,
})

Howler.mute(muted.value)

function setMuted(nextMuted: boolean): void {
  muted.value = nextMuted
  Howler.mute(nextMuted)
  if (nextMuted) {
    ambience.stop()
  } else if (!ambience.playing()) {
    ambience.play()
  }
  localStorage.setItem(mutedStorageKey, String(nextMuted))
}

export const soundStore = {
  muted,
  setMuted,
  toggle: () => setMuted(!muted.value),
  stopAmbience: () => ambience.stop(),
  play: (event: PokerSound) => {
    if (!muted.value) sounds[event].play()
  },
}
