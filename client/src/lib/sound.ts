import { Howl, Howler } from 'howler'
import { ref } from 'vue'

export type PokerSound = 'deal' | 'check' | 'fold' | 'call' | 'raise' | 'win' | 'lose' | 'street'

const mutedStorageKey = 'poker.sound.muted'
const sfxVolumeKey = 'poker.sound.sfxVolume'
const bgmVolumeKey = 'poker.sound.bgmVolume'

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

function createClickDataUri(): string {
  return createWavDataUri(0.04, 12_000, (time) => {
    const envelope = Math.exp(-time * 55)
    const tone = Math.sin(time * 1800 * Math.PI * 2) * 0.45 + Math.sin(time * 3600 * Math.PI * 2) * 0.25
    return tone * envelope
  })
}

function createAmbientDataUri(): string {
  const duration = 8
  return createWavDataUri(duration, 8_000, (time, progress) => {
    const edge = Math.min(1, progress * 12, (1 - progress) * 12)
    const pulse = 0.74 + Math.sin(time * Math.PI * 2 / 4) * 0.1
    const chord =
      Math.sin(time * 65.41 * Math.PI * 2) * 0.48
      + Math.sin(time * 82.41 * Math.PI * 2) * 0.26
      + Math.sin(time * 98 * Math.PI * 2) * 0.18
      + Math.sin(time * 130.81 * Math.PI * 2) * 0.12
    return chord * edge * pulse * 0.055
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
const sfxVolume = ref(Number(localStorage.getItem(sfxVolumeKey)) || 0.22)
const bgmVolume = ref(Number(localStorage.getItem(bgmVolumeKey)) || 0.18)

const sounds = Object.fromEntries(
  Object.entries(soundFrequencies).map(([event, frequency]) => [
    event,
    new Howl({ src: [createToneDataUri(frequency)], volume: sfxVolume.value, preload: true }),
  ]),
) as Record<PokerSound, Howl>

const clickSound = new Howl({ src: [createClickDataUri()], volume: 0.12, preload: true })

const ambience = new Howl({
  src: [createAmbientDataUri()],
  volume: bgmVolume.value,
  loop: true,
  preload: true,
})

Howler.mute(muted.value)

function setMuted(nextMuted: boolean): void {
  muted.value = nextMuted
  Howler.mute(nextMuted)
  localStorage.setItem(mutedStorageKey, String(nextMuted))
}

function setSfxVolume(next: number): void {
  sfxVolume.value = Math.max(0, Math.min(1, next))
  localStorage.setItem(sfxVolumeKey, String(sfxVolume.value))
}

function setBgmVolume(next: number): void {
  bgmVolume.value = Math.max(0, Math.min(1, next))
  ambience.volume(bgmVolume.value)
  localStorage.setItem(bgmVolumeKey, String(bgmVolume.value))
}

function startAmbience(): void {
  if (muted.value || ambience.playing()) return
  ambience.play()
}

function stopAmbience(): void {
  ambience.stop()
}

function fadeAmbience(targetVolume: number, duration = 800): void {
  if (!ambience.playing() && targetVolume > 0) {
    ambience.volume(targetVolume)
    startAmbience()
    return
  }
  ambience.fade(ambience.volume(), targetVolume, duration)
  if (targetVolume === 0) {
    setTimeout(() => { if (ambience.volume() === 0) ambience.stop() }, duration + 50)
  }
}

export const soundStore = {
  muted,
  sfxVolume,
  bgmVolume,
  setMuted,
  setSfxVolume,
  setBgmVolume,
  toggle: () => setMuted(!muted.value),
  startAmbience,
  stopAmbience,
  fadeAmbience,
  play: (event: PokerSound) => {
    if (!muted.value) sounds[event].play()
  },
  playClick: () => {
    if (!muted.value) clickSound.play()
  },
}
