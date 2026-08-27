export interface PresenceMember {
  identity: string
  name: string
}

export type PresenceSnapshot = Record<string, PresenceMember[]>

export interface PresenceResponse {
  byRoom: PresenceSnapshot
  stale: boolean
}

export async function fetchPresence(signal?: AbortSignal): Promise<PresenceResponse> {
  const res = await fetch('/api/presence', { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) {
    throw new Error(`presença respondeu ${res.status}`)
  }
  const byRoom = (await res.json()) as PresenceSnapshot
  const stale = res.headers.get('X-Presence-Stale') === 'true'
  return { byRoom, stale }
}
