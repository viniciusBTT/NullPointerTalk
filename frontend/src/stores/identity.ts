import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

/**
 * Mesmas chaves/formato de localStorage do core/identity.js e lib/prefs.js originais
 * (tudo serializado com JSON.stringify, inclusive strings) - preserva as preferencias de
 * quem já usava o app antes da migração (FR-007).
 */
const KEYS = {
  username: 'npt.username',
  userId: 'npt.userId',
  mic: 'npt.mic',
  camera: 'npt.camera',
} as const

function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) {
      return fallback
    }
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage indisponivel (modo privado, cota) nao deve travar o app
  }
}

function randomId(): string {
  if (crypto.randomUUID) {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Extrai o id estavel (userId) de uma identity completa `<userId>.<tabNonce>`. */
export function stableIdOf(identity: string): string {
  const at = identity.indexOf('.')
  return at === -1 ? identity : identity.slice(0, at)
}

export const useIdentityStore = defineStore('identity', () => {
  const displayName = ref<string | null>(readPref(KEYS.username, null))
  const stableUserId = ref<string>(readPref(KEYS.userId, '') || randomId())
  if (!readPref<string | null>(KEYS.userId, null)) {
    writePref(KEYS.userId, stableUserId.value)
  }
  const micEnabled = ref<boolean>(readPref(KEYS.mic, true))
  const cameraEnabled = ref<boolean>(readPref(KEYS.camera, false))

  /** Identity completa do LiveKit, unica por aba (nonce novo a cada reload). */
  const identity = `${stableUserId.value}.${randomId().slice(0, 8)}`

  function setDisplayName(name: string): void {
    displayName.value = name.trim()
    writePref(KEYS.username, displayName.value)
  }

  watch(micEnabled, (value) => writePref(KEYS.mic, value))
  watch(cameraEnabled, (value) => writePref(KEYS.camera, value))

  return { displayName, stableUserId, identity, micEnabled, cameraEnabled, setDisplayName }
})
