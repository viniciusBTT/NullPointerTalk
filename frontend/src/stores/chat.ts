import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { chatSocket } from '@/api/chatSocket'
import { fetchMessages, type ChatMessageView } from '@/api/chatHistory'
import { getPrefEntry, setPrefEntry, KEYS } from '@/lib/prefs'
import { useIdentityStore } from '@/stores/identity'

const MAX_PER_CHANNEL = 250

export interface StoredMessage extends ChatMessageView {
  isLocal: boolean
}

/**
 * Fonte única de verdade do chat (histórico + mensagens ao vivo + contagem de não lidas),
 * consumida por ChannelList (badge) e ChatPanel (lista/contador) sem lógica de
 * sincronização duplicada entre eles (US3).
 */
export const useChatStore = defineStore('chat', () => {
  const byRoom = reactive(new Map<string, StoredMessage[]>())
  const unreadCounts = reactive(new Map<string, number>())
  const historyLoads = new Map<string, Promise<void>>()
  const subscriptions = new Map<string, () => void>()
  let connected = false

  function ensureConnected(): void {
    if (connected) {
      return
    }
    connected = true
    chatSocket.connect()
  }

  /** Assina o tópico de TODAS as salas do catálogo, não só a aberta - é o que permite
   * badge de não-lida em canais onde a voz não está conectada. */
  function syncRoomSubscriptions(roomIds: string[]): void {
    ensureConnected()
    const wanted = new Set(roomIds)
    for (const roomId of wanted) {
      if (!subscriptions.has(roomId)) {
        subscriptions.set(
          roomId,
          chatSocket.subscribe(`/topic/room/${roomId}`, (body) => {
            onLiveMessage(roomId, JSON.parse(body) as ChatMessageView)
          }),
        )
      }
    }
    for (const roomId of [...subscriptions.keys()]) {
      if (!wanted.has(roomId)) {
        subscriptions.get(roomId)?.()
        subscriptions.delete(roomId)
      }
    }
  }

  function onLiveMessage(roomId: string, message: ChatMessageView): void {
    const stored = append(roomId, message)
    if (!stored || stored.isLocal) {
      return // dedup, ou a propria mensagem nunca conta como nao-lida
    }
    if (activeRoomId === roomId && !document.hidden) {
      markRead(roomId, stored.timestamp)
    } else {
      markUnread(roomId)
    }
  }

  /** Sala atualmente aberta na UI - decide se uma mensagem que chega ao vivo conta como
   * não-lida (definido pelo ChatPanel via setActiveRoom). */
  let activeRoomId: string | null = null
  function setActiveRoom(roomId: string | null): void {
    activeRoomId = roomId
  }

  /** Devolve a mensagem guardada, ou undefined se era uma duplicata já conhecida
   * (histórico e mensagem ao vivo podem se cruzar). */
  function append(roomId: string, message: ChatMessageView): StoredMessage | undefined {
    const list = byRoom.get(roomId) ?? []
    if (message.id && list.some((existing) => existing.id === message.id)) {
      return undefined
    }
    const identity = useIdentityStore()
    const stored: StoredMessage = { ...message, isLocal: message.stableId === identity.stableUserId }
    const next = [...list, stored].sort((a, b) => a.timestamp - b.timestamp)
    if (next.length > MAX_PER_CHANNEL) {
      next.splice(0, next.length - MAX_PER_CHANNEL)
    }
    byRoom.set(roomId, next)
    return stored
  }

  function messages(roomId: string): StoredMessage[] {
    return byRoom.get(roomId) ?? []
  }

  function lastTimestamp(roomId: string): number {
    const list = byRoom.get(roomId)
    return list && list.length ? list[list.length - 1].timestamp : 0
  }

  /** Busca o histórico do backend uma vez por sessão; no-op em chamadas seguintes. */
  function ensureHistory(roomId: string): Promise<void> {
    if (!historyLoads.has(roomId)) {
      historyLoads.set(
        roomId,
        fetchMessages(roomId)
          .then((history) => {
            history.forEach((message) => append(roomId, message))
          })
          .catch((error) => console.error('Falha ao carregar histórico do chat', error)),
      )
    }
    return historyLoads.get(roomId)!
  }

  function markUnread(roomId: string): void {
    unreadCounts.set(roomId, (unreadCounts.get(roomId) ?? 0) + 1)
  }

  /** Usado só na carga inicial, pra semear o contador sem passar por markUnread um a um. */
  function seedUnread(roomId: string, count: number): void {
    if (!count) {
      return
    }
    unreadCounts.set(roomId, count)
  }

  /** Persiste ATÉ ONDE - o timestamp da mensagem mais recente conhecida (do relógio do
   * servidor), não Date.now(): imune a desincronia entre o relógio do navegador e o do
   * backend. */
  function markRead(roomId: string, lastMessageTimestampMs = lastTimestamp(roomId)): void {
    setPrefEntry(KEYS.chatLastRead, roomId, lastMessageTimestampMs)
    unreadCounts.set(roomId, 0)
  }

  function lastRead(roomId: string): number {
    return getPrefEntry(KEYS.chatLastRead, roomId, 0)
  }

  function unread(roomId: string): number {
    return unreadCounts.get(roomId) ?? 0
  }

  function send(roomId: string, text: string): void {
    const identity = useIdentityStore()
    chatSocket.publish(`/app/chat/${roomId}`, {
      text,
      name: identity.displayName,
      stableId: identity.stableUserId,
    })
  }

  /** Fetch best-effort de não-lidas por sala no boot (reusa o endpoint de histórico com
   * "after", em vez de um endpoint só pra contar). */
  async function loadInitialUnread(roomIds: string[]): Promise<void> {
    for (const roomId of roomIds) {
      try {
        const since = lastRead(roomId)
        const unreadMessages = await fetchMessages(roomId, since)
        if (roomId !== activeRoomId) {
          seedUnread(roomId, unreadMessages.length)
        }
      } catch {
        // best-effort: uma sala sem contagem inicial nao trava o boot
      }
    }
  }

  return {
    byRoom,
    unreadCounts,
    syncRoomSubscriptions,
    setActiveRoom,
    append,
    messages,
    lastTimestamp,
    ensureHistory,
    markUnread,
    seedUnread,
    markRead,
    lastRead,
    unread,
    send,
    loadInitialUnread,
  }
})
