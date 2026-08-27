import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const roomInstances: FakeRoom[] = []

class FakeRoom {
  localParticipant = {
    publishTrack: vi.fn(async () => ({ mute: vi.fn(), unmute: vi.fn() })),
    unpublishTrack: vi.fn(async () => {}),
    getTrackPublication: vi.fn(() => undefined),
    setName: vi.fn(async () => {}),
    trackPublications: new Map(),
    identity: 'local.tab',
    isLocal: true,
  }
  remoteParticipants = new Map()
  canPlaybackAudio = true
  listeners = new Map<string, (...args: unknown[]) => void>()
  connect = vi.fn(async () => {})
  disconnect = vi.fn(async () => {})
  startAudio = vi.fn(async () => {})
  switchActiveDevice = vi.fn(async () => {})

  constructor() {
    roomInstances.push(this)
  }

  on(event: string, callback: (...args: unknown[]) => void) {
    this.listeners.set(event, callback)
    return this
  }

  removeAllListeners() {
    this.listeners.clear()
  }
}

vi.mock('livekit-client', () => {
  const identityProxy = new Proxy({}, { get: (_target, prop) => String(prop) })
  return {
    Room: FakeRoom,
    RoomEvent: identityProxy,
    Track: { Source: identityProxy },
    DisconnectReason: { ROOM_DELETED: 'ROOM_DELETED', DUPLICATE_IDENTITY: 'DUPLICATE_IDENTITY' },
    ConnectionQuality: {},
  }
})

vi.mock('@/composables/useLocalMedia', () => ({
  useLocalMedia: () => ({
    micTrack: { value: null },
    cameraTrack: { value: null },
    hasMic: { value: false },
    hasCamera: { value: false },
    ensure: vi.fn(async () => ({ micTrack: null, cameraTrack: null })),
    release: vi.fn(),
    setAudioInput: vi.fn(),
    setVideoInput: vi.fn(),
    listDevices: vi.fn(),
    on: vi.fn(() => () => {}),
  }),
}))

vi.mock('@/api/roomToken', () => ({
  fetchRoomToken: vi.fn(async () => ({ token: 'token', url: 'wss://livekit.local' })),
}))

// Importado DEPOIS dos vi.mock acima, pra garantir que voice.ts recebe os mocks.
const { useVoiceStore } = await import('@/stores/voice')

beforeEach(() => {
  setActivePinia(createPinia())
  roomInstances.length = 0
})

describe('voice store', () => {
  it('transitions idle -> joining -> connected on a successful join', async () => {
    const voice = useVoiceStore()
    expect(voice.state).toBe('idle')

    const joinPromise = voice.join('sala-1')
    expect(voice.state).toBe('joining')

    await joinPromise
    expect(voice.state).toBe('connected')
    expect(voice.roomId).toBe('sala-1')
  })

  it('emits "kicked" (not "error") when the room is deleted server-side', async () => {
    const voice = useVoiceStore()
    const events: Array<{ type: string }> = []
    voice.on((event) => events.push(event))

    await voice.join('sala-1')
    const disconnected = roomInstances[0].listeners.get('Disconnected')!
    disconnected('ROOM_DELETED')

    expect(voice.state).toBe('idle')
    expect(events.some((e) => e.type === 'kicked')).toBe(true)
    expect(events.some((e) => e.type === 'error')).toBe(false)
  })

  it('emits "error" with reconnectRoomId on a hard disconnect that is not a room deletion', async () => {
    const voice = useVoiceStore()
    const events: Array<{ type: string; detail?: { reconnectRoomId?: string } }> = []
    voice.on((event) => events.push(event as never))

    await voice.join('sala-1')
    const disconnected = roomInstances[0].listeners.get('Disconnected')!
    disconnected('SERVER_SHUTDOWN')

    expect(voice.state).toBe('idle')
    const errorEvent = events.find((e) => e.type === 'error')
    expect(errorEvent?.detail?.reconnectRoomId).toBe('sala-1')
  })

  it('leave() resets state to idle and clears the participant snapshot', async () => {
    const voice = useVoiceStore()
    await voice.join('sala-1')
    await voice.leave()

    expect(voice.state).toBe('idle')
    expect(voice.roomId).toBeNull()
    expect(voice.participants).toEqual([])
  })

  it('collapses participants to [] while reconnecting, matching the original getter behavior', async () => {
    const voice = useVoiceStore()
    await voice.join('sala-1')
    const reconnecting = roomInstances[0].listeners.get('Reconnecting')!
    reconnecting()
    // scheduleSnapshot roda em microtask
    await Promise.resolve()
    await Promise.resolve()

    expect(voice.state).toBe('reconnecting')
    expect(voice.participants).toEqual([])
  })
})
