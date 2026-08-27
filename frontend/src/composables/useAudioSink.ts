import { readonly, ref } from 'vue'
import { getPref, getPrefEntry, setPref, setPrefEntry, KEYS } from '@/lib/prefs'

export interface AudioPub {
  trackSid: string
  stableId: string
  source: string
  isLocal: boolean
  attach: (element: HTMLMediaElement) => void
  detach: (element: HTMLMediaElement) => void
  setVolume: (volume: number) => void
}

// Estado em nivel de modulo: reproducao de audio remoto e' compartilhada pela pagina
// inteira (um <audio> oculto por PUBLICACAO, chaveado por trackSid - nao por identity,
// porque mic + audio de tela + "ouvir junto" podem tocar ao mesmo tempo pra uma pessoa).
const elements = new Map<string, { element: HTMLAudioElement; pub: AudioPub }>()
const deafened = ref(getPref(KEYS.deafened, false) === true)
let container: HTMLDivElement | null = null

function ensureContainer(): HTMLDivElement {
  if (!container) {
    container = document.createElement('div')
    container.hidden = true
    document.body.appendChild(container)
  }
  return container
}

function getVolume(stableId: string): number {
  const stored = getPrefEntry(KEYS.volumes, stableId, 1)
  const value = Number(stored)
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1
}

function isMutedFor(stableId: string): boolean {
  return getPrefEntry(KEYS.mutedFor, stableId, false) === true
}

function applyMuted(): void {
  for (const { element, pub } of elements.values()) {
    element.muted = deafened.value || isMutedFor(pub.stableId)
  }
}

function create(pub: AudioPub): void {
  const element = document.createElement('audio')
  element.autoplay = true
  element.dataset.stableId = pub.stableId
  element.dataset.source = pub.source
  ensureContainer().appendChild(element)
  pub.attach(element)
  elements.set(pub.trackSid, { element, pub })
  // Ordem importa: volume primeiro (reaplica em attaches futuros), depois muted.
  pub.setVolume(getVolume(pub.stableId))
  element.muted = deafened.value || isMutedFor(pub.stableId)
}

function destroy(trackSid: string, entry: { element: HTMLAudioElement; pub: AudioPub }): void {
  try {
    entry.pub.detach(entry.element)
  } catch {
    // a track pode ja ter sido encerrada do outro lado
  }
  entry.element.remove()
  elements.delete(trackSid)
}

export function useAudioSink() {
  /** Diff por chave: cria os que faltam, remove os que sobraram. Áudio local NUNCA é
   * anexado - é o que evita ouvir a própria voz. */
  function sync(pubs: AudioPub[]): void {
    const remote = pubs.filter((pub) => !pub.isLocal)
    const wanted = new Map(remote.map((pub) => [pub.trackSid, pub]))
    for (const [trackSid, entry] of [...elements]) {
      if (!wanted.has(trackSid)) {
        destroy(trackSid, entry)
      }
    }
    for (const pub of remote) {
      if (!elements.has(pub.trackSid)) {
        create(pub)
      }
    }
  }

  /** "Surdo": muta na saída em vez de cancelar a subscrição - preserva o indicador de
   * "está falando" enquanto surdo. */
  function setDeafened(on: boolean): void {
    deafened.value = !!on
    setPref(KEYS.deafened, deafened.value)
    applyMuted()
  }

  /** 0..1, vale pra todas as tracks de áudio da pessoa. */
  function setVolume(stableId: string, volume: number): void {
    const clamped = Math.min(1, Math.max(0, Number(volume) || 0))
    setPrefEntry(KEYS.volumes, stableId, clamped)
    for (const { pub } of elements.values()) {
      if (pub.stableId === stableId) {
        pub.setVolume(clamped)
      }
    }
  }

  function setMutedFor(stableId: string, on: boolean): void {
    setPrefEntry(KEYS.mutedFor, stableId, on ? true : null)
    applyMuted()
  }

  function clear(): void {
    for (const [trackSid, entry] of [...elements]) {
      destroy(trackSid, entry)
    }
  }

  return {
    deafened: readonly(deafened),
    sync,
    setDeafened,
    setVolume,
    getVolume,
    setMutedFor,
    isMutedFor,
    clear,
  }
}
