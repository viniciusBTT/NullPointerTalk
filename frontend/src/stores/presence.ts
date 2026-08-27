import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { chatSocket } from '@/api/chatSocket'
import { fetchPresence, type PresenceMember, type PresenceSnapshot } from '@/api/presence'
import { listRooms, type RoomInfo } from '@/api/rooms'

interface RoomCatalogEvent {
  type: 'created' | 'updated' | 'deleted'
  room: RoomInfo
}

/** Membro de sidebar: presença polled só tem identity/name; o canal onde a própria voz
 * está conectada carrega campos extras (live/micOn/speaking) vindos do LiveKit. */
export interface SidebarMember extends PresenceMember {
  stableId?: string
  live?: boolean
  micOn?: boolean
  speaking?: boolean
  isLocal?: boolean
}

export type SidebarSnapshot = Record<string, SidebarMember[]>

const POLL_INTERVAL_MS = 5000
const BACKOFF_MS = [5000, 10_000, 20_000, 30_000]
const FAILURES_BEFORE_WARNING = 3

/**
 * Catalogo global de salas + presença de participantes. O canal em que o proprio usuário
 * ESTA e' sobreposto ao vivo via setLive() (dados do LiveKit, instantâneos); os demais
 * canais dependem só do polling - por isso o poll nunca é o caminho crítico de latência
 * pra quem está de olho no próprio canal (mesma divisão de responsabilidade do
 * core/presence.js original).
 */
export const usePresenceStore = defineStore('presence', () => {
  const rooms = ref<RoomInfo[]>([])
  const roomsById = computed(() => new Map(rooms.value.map((room) => [room.id, room])))

  let catalogLoad: Promise<void> | null = null
  let unsubscribeCatalog: (() => void) | null = null

  async function ensureCatalogLoaded(): Promise<void> {
    if (!catalogLoad) {
      catalogLoad = listRooms().then((list) => {
        rooms.value = list
      })
      chatSocket.connect()
      unsubscribeCatalog?.()
      unsubscribeCatalog = chatSocket.subscribe('/topic/room-catalog', onCatalogEvent)
    }
    return catalogLoad
  }

  function onCatalogEvent(body: string): void {
    const event = JSON.parse(body) as RoomCatalogEvent
    const index = rooms.value.findIndex((room) => room.id === event.room.id)
    if (event.type === 'deleted') {
      if (index !== -1) {
        rooms.value.splice(index, 1)
      }
      return
    }
    if (index === -1) {
      rooms.value.push(event.room)
    } else {
      rooms.value[index] = event.room
    }
  }

  function hasRoom(roomId: string): boolean {
    return roomsById.value.has(roomId)
  }

  // ---------------------------------------------------------------- presenca (polling)

  const polled = ref<PresenceSnapshot>({})
  const isStale = ref(false)
  const liveRoomId = ref<string | null>(null)
  const liveParticipants = ref<SidebarMember[]>([])

  let failures = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let abort: AbortController | null = null
  let running = false

  const byRoom = computed<SidebarSnapshot>(() => {
    const merged: SidebarSnapshot = { ...polled.value }
    if (liveRoomId.value) {
      merged[liveRoomId.value] = liveParticipants.value
    }
    return merged
  })

  /** Verdade do LiveKit pro canal conectado - sobrepõe o que o poll disser sobre ele. */
  function setLive(roomId: string | null, participants: SidebarMember[]): void {
    liveRoomId.value = roomId
    liveParticipants.value = participants
  }

  function startPresencePolling(): void {
    if (running) {
      return
    }
    running = true
    document.addEventListener('visibilitychange', onVisibilityChange)
    void tick()
  }

  function stopPresencePolling(): void {
    running = false
    document.removeEventListener('visibilitychange', onVisibilityChange)
    cancelTimer()
    abort?.abort()
    abort = null
  }

  function refresh(): void {
    if (!running || document.hidden) {
      return
    }
    cancelTimer()
    void tick()
  }

  function onVisibilityChange(): void {
    if (document.hidden) {
      cancelTimer()
      abort?.abort()
    } else {
      refresh()
    }
  }

  async function tick(): Promise<void> {
    if (!running || document.hidden) {
      return
    }
    abort?.abort()
    abort = new AbortController()
    const deadline = setTimeout(() => abort?.abort(), POLL_INTERVAL_MS + 3000)

    try {
      const response = await fetchPresence(abort.signal)
      polled.value = response.byRoom
      failures = response.stale ? failures + 1 : 0
      isStale.value = failures >= FAILURES_BEFORE_WARNING
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        failures++
        isStale.value = failures >= FAILURES_BEFORE_WARNING
        // NUNCA esvazia as listas: dado de alguns segundos atrás é quase sempre
        // verdade, "todo mundo saiu" seria mentira ativa.
      }
    } finally {
      clearTimeout(deadline)
    }

    scheduleNext()
  }

  function scheduleNext(): void {
    if (!running || document.hidden) {
      return
    }
    const delay = failures === 0 ? POLL_INTERVAL_MS : BACKOFF_MS[Math.min(failures - 1, BACKOFF_MS.length - 1)]
    timer = setTimeout(() => void tick(), delay)
  }

  function cancelTimer(): void {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  return {
    rooms,
    roomsById,
    ensureCatalogLoaded,
    hasRoom,
    byRoom,
    isStale,
    setLive,
    startPresencePolling,
    stopPresencePolling,
    refresh,
  }
})
