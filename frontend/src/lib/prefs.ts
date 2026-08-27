/** Mesmas chaves de localStorage do lib/prefs.js original - preserva preferencias de quem
 * já usava o app antes da migração (FR-007). Tudo serializado com JSON.stringify. */
export const KEYS = {
  volumes: 'npt.volumes',
  mutedFor: 'npt.mutedFor',
  deafened: 'npt.deafened',
  devices: 'npt.devices',
  sounds: 'npt.sounds',
  chatLastRead: 'npt.chatLastRead',
} as const

export function getPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function setPref(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage indisponivel (modo privado, cota) nao deve travar o app
  }
}

export function getPrefEntry<T>(key: string, entryKey: string, fallback: T): T {
  const obj = getPref<Record<string, unknown> | null>(key, null)
  if (!obj || typeof obj !== 'object' || !Object.hasOwn(obj, entryKey)) {
    return fallback
  }
  return obj[entryKey] as T
}

export function setPrefEntry(key: string, entryKey: string, value: unknown): void {
  const obj = { ...(getPref<Record<string, unknown> | null>(key, null) ?? {}) }
  if (value === null || value === undefined) {
    delete obj[entryKey]
  } else {
    obj[entryKey] = value
  }
  setPref(key, obj)
}
