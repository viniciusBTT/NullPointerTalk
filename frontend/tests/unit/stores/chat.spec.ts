import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { chatSocket } from '@/api/chatSocket'
import { useChatStore } from '@/stores/chat'
import { useIdentityStore } from '@/stores/identity'

vi.mock('@/api/chatSocket', () => ({
  chatSocket: {
    connect: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    publish: vi.fn(),
  },
}))

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  vi.mocked(chatSocket.subscribe).mockClear()
})

describe('chat store', () => {
  it('dedupes a message already known by id and computes isLocal via stableId', () => {
    const chat = useChatStore()
    const identity = useIdentityStore()
    const message = { id: '1', roomId: 'r1', stableId: identity.stableUserId, name: 'Eu', text: 'oi', timestamp: 1000 }

    const stored = chat.append('r1', message)
    expect(stored?.isLocal).toBe(true)

    const duplicate = chat.append('r1', message)
    expect(duplicate).toBeUndefined()
    expect(chat.messages('r1')).toHaveLength(1)
  })

  it('marks a message from someone else as not local', () => {
    const chat = useChatStore()
    const stored = chat.append('r1', { id: '2', roomId: 'r1', stableId: 'outro-usuario', name: 'Alguém', text: 'oi', timestamp: 1000 })
    expect(stored?.isLocal).toBe(false)
  })

  it('accumulates unreadCount and resets it on markRead, persisting lastRead', () => {
    const chat = useChatStore()
    chat.markUnread('r1')
    chat.markUnread('r1')
    expect(chat.unread('r1')).toBe(2)

    chat.markRead('r1', 500)
    expect(chat.unread('r1')).toBe(0)
    expect(chat.lastRead('r1')).toBe(500)
  })

  it('does not count the sender own echoed message as unread when it arrives live', () => {
    const chat = useChatStore()
    const identity = useIdentityStore()
    chat.syncRoomSubscriptions(['r1'])

    const handler = vi.mocked(chatSocket.subscribe).mock.calls[0][1]
    handler(JSON.stringify({ id: '3', roomId: 'r1', stableId: identity.stableUserId, name: 'Eu', text: 'oi', timestamp: 1000 }))

    expect(chat.unread('r1')).toBe(0)
    expect(chat.messages('r1')).toHaveLength(1)
  })

  it('counts a live message from someone else as unread when the room is not active', () => {
    const chat = useChatStore()
    chat.syncRoomSubscriptions(['r1'])

    const handler = vi.mocked(chatSocket.subscribe).mock.calls[0][1]
    handler(JSON.stringify({ id: '4', roomId: 'r1', stableId: 'outro-usuario', name: 'Alguém', text: 'oi', timestamp: 1000 }))

    expect(chat.unread('r1')).toBe(1)
  })
})
