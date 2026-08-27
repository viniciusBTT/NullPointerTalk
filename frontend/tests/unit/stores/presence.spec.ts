import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { chatSocket } from '@/api/chatSocket'
import { listRooms } from '@/api/rooms'
import { usePresenceStore } from '@/stores/presence'

vi.mock('@/api/chatSocket', () => ({
  chatSocket: {
    connect: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    publish: vi.fn(),
  },
}))

vi.mock('@/api/rooms', () => ({
  listRooms: vi.fn(async () => [{ id: 'a', name: 'A', icon: '🅰️' }]),
}))

vi.mock('@/api/presence', () => ({
  fetchPresence: vi.fn(async () => ({ byRoom: {}, stale: false })),
}))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.mocked(listRooms).mockClear()
  vi.mocked(chatSocket.subscribe).mockClear()
})

describe('presence store', () => {
  it('loads the initial catalog once and reconciles created/updated/deleted events', async () => {
    const presence = usePresenceStore()
    await presence.ensureCatalogLoaded()
    await presence.ensureCatalogLoaded()

    expect(listRooms).toHaveBeenCalledTimes(1)
    expect(presence.hasRoom('a')).toBe(true)

    const handler = vi.mocked(chatSocket.subscribe).mock.calls[0][1]

    handler(JSON.stringify({ type: 'created', room: { id: 'b', name: 'B', icon: '🅱️' } }))
    expect(presence.hasRoom('b')).toBe(true)

    handler(JSON.stringify({ type: 'updated', room: { id: 'b', name: 'B renomeada', icon: '🅱️' } }))
    expect(presence.roomsById.get('b')?.name).toBe('B renomeada')

    handler(JSON.stringify({ type: 'deleted', room: { id: 'a', name: 'A', icon: '🅰️' } }))
    expect(presence.hasRoom('a')).toBe(false)
  })

  it('overlays live participants (setLive) onto the polled snapshot for that room only', () => {
    const presence = usePresenceStore()
    presence.setLive('a', [{ identity: 'x.1', name: 'X', live: true, micOn: true }])

    expect(presence.byRoom['a']).toEqual([{ identity: 'x.1', name: 'X', live: true, micOn: true }])

    presence.setLive(null, [])
    expect(presence.byRoom['a']).toBeUndefined()
  })
})
