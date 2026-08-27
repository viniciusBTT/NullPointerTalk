import { getPref, setPref, KEYS } from '@/lib/prefs'

interface Tone {
  freq: number
  at: number
  dur: number
  gain?: number
}

// Estado em nivel de modulo: UM AudioContext compartilhado pra pagina inteira - Chrome
// limita contextos concorrentes (~6) e o Room do LiveKit ja cria um, entao um por beep
// esgotaria a cota em minutos.
let audioContext: AudioContext | null = null
let armed = false

function ensureContext(): AudioContext {
  if (!audioContext) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    audioContext = new Ctor()
  }
  return audioContext
}

function isEnabled(): boolean {
  return getPref(KEYS.sounds, true) !== false
}

function playTones(tones: Tone[]): void {
  if (!armed || !isEnabled()) {
    return
  }
  const ctx = ensureContext()
  const start = ctx.currentTime
  for (const { freq, at, dur, gain = 0.14 } of tones) {
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = freq
    gainNode.gain.setValueAtTime(0.0001, start + at)
    gainNode.gain.exponentialRampToValueAtTime(gain, start + at + 0.012)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, start + at + dur)
    oscillator.connect(gainNode).connect(ctx.destination)
    oscillator.start(start + at)
    oscillator.stop(start + at + dur + 0.02)
  }
}

export function useSounds() {
  /** ParticipantConnected dispara uma vez por participante ja na sala no connect - so
   * armar DEPOIS do 'joined' evita um beep por participante existente. */
  function setArmed(on: boolean): void {
    armed = on
  }

  /** Resume o AudioContext suspenso - chamar no primeiro gesto do usuario (clicar num
   * canal), senao o primeiro beep sai mudo. */
  function primeAudio(): void {
    const ctx = ensureContext()
    if (ctx.state === 'suspended') {
      void ctx.resume()
    }
  }

  function playJoin(): void {
    playTones([
      { freq: 587.33, at: 0, dur: 0.09 },
      { freq: 880.0, at: 0.085, dur: 0.13 },
    ])
  }

  function playLeave(): void {
    playTones([
      { freq: 587.33, at: 0, dur: 0.09 },
      { freq: 392.0, at: 0.085, dur: 0.15 },
    ])
  }

  return { setArmed, primeAudio, playJoin, playLeave }
}

export function setSoundsEnabled(on: boolean): void {
  setPref(KEYS.sounds, !!on)
}
