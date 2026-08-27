import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  ConnectionQuality,
  DisconnectReason,
  Room,
  RoomEvent,
  Track,
  type LocalTrack,
  type Participant,
  type RemoteParticipant,
  type TrackPublication,
} from 'livekit-client'
import { useLocalMedia } from '@/composables/useLocalMedia'
import { useScreenShare, NoTabAudioError } from '@/composables/useScreenShare'
import { fetchRoomToken } from '@/api/roomToken'
import { useIdentityStore, stableIdOf } from '@/stores/identity'

export type SessionState = 'idle' | 'joining' | 'connected' | 'reconnecting'

export interface LocalDesired {
  mic: boolean
  camera: boolean
  screen: boolean
  listenAlong: boolean
}

export interface ParticipantView {
  identity: string
  stableId: string
  name: string
  isLocal: boolean
  micOn: boolean
  camOn: boolean
  screenOn: boolean
  listeningAlong: boolean
  speaking: boolean
  quality: string
}

export interface PubView {
  key: string
  trackSid: string
  identity: string
  stableId: string
  name: string
  isLocal: boolean
  kind: 'video' | 'audio'
  source: string
  muted: boolean
  attach: (element: HTMLMediaElement) => void
  detach: (element: HTMLMediaElement) => void
  setVolume: (volume: number) => void
}

export interface VoiceError {
  scope: 'connect' | 'media' | 'publish'
  message: string
  error?: unknown
  reconnectRoomId?: string
}

export type VoiceEvent =
  | { type: 'joined'; roomId: string }
  | { type: 'left'; roomId: string; reason: 'user' | 'server' }
  | { type: 'kicked'; roomId: string }
  | { type: 'error'; detail: VoiceError }
  | { type: 'participantjoined'; name: string }
  | { type: 'participantleft'; identity: string; name: string }

type Listener = (event: VoiceEvent) => void

const LISTEN_ALONG_TRACK_NAME = 'listen_along_audio'
const VIDEO_SOURCES = new Set<Track.Source>([Track.Source.Camera, Track.Source.ScreenShare])

const QUALITY_LABELS: Record<string, string> = {
  excellent: 'boa',
  good: 'boa',
  poor: 'instável',
  lost: 'perdida',
  unknown: 'conectando',
}

export function qualityLabel(quality: string): string {
  return QUALITY_LABELS[quality] ?? quality ?? 'desconhecida'
}

export const useVoiceStore = defineStore('voice', () => {
  const localMedia = useLocalMedia()
  const screenShare = useScreenShare()
  const listeners = new Set<Listener>()

  const state = ref<SessionState>('idle')
  const roomId = ref<string | null>(null)
  const desired = ref<LocalDesired>({ mic: true, camera: false, screen: false, listenAlong: false })
  const canPlaybackAudio = ref(true)
  const participants = ref<ParticipantView[]>([])
  const videoPubs = ref<PubView[]>([])
  const audioPubs = ref<PubView[]>([])

  let room: Room | null = null
  let displayName = ''
  let screenStream: MediaStream | null = null
  let listenAlongStream: MediaStream | null = null
  let generation = 0
  let abort: AbortController | null = null
  let queue: Promise<void> = Promise.resolve()
  const qualityByIdentity = new Map<string, string>()
  const speakingIdentities = new Set<string>()
  let snapshotQueued = false

  function on(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function emit(event: VoiceEvent): void {
    listeners.forEach((listener) => listener(event))
  }

  function setState(next: SessionState): void {
    if (state.value === next) {
      return
    }
    state.value = next
  }

  function setDesired(patch: Partial<LocalDesired>): void {
    desired.value = { ...desired.value, ...patch }
  }

  // ---------------------------------------------------------------- join/leave

  function join(targetRoomId: string): Promise<void> {
    if (targetRoomId === roomId.value && (state.value === 'joining' || state.value === 'connected')) {
      return queue
    }
    const myGeneration = ++generation
    abort?.abort()
    abort = new AbortController()
    room?.disconnect(false).catch(() => {})
    roomId.value = targetRoomId
    setState('joining')
    queue = queue.then(() => doJoin(targetRoomId, myGeneration))
    return queue
  }

  async function doJoin(targetRoomId: string, myGeneration: number): Promise<void> {
    const stillCurrent = () => myGeneration === generation
    try {
      await teardownRoom()
      if (!stillCurrent()) return
      const identity = useIdentityStore()
      displayName = identity.displayName ?? 'Anônimo'
      const { micTrack } = await localMedia.ensure()
      if (!stillCurrent()) return
      const credentials = await fetchRoomToken(targetRoomId, identity.identity, displayName, abort?.signal)
      if (!stillCurrent()) return

      const nextRoom = new Room({ adaptiveStream: true, dynacast: true, stopLocalTrackOnUnpublish: false })
      wireRoomEvents(nextRoom, myGeneration)
      await nextRoom.connect(credentials.url, credentials.token)
      if (!stillCurrent()) {
        nextRoom.disconnect(false).catch(() => {})
        return
      }
      room = nextRoom

      if (micTrack) {
        const publication = await room.localParticipant.publishTrack(micTrack, {
          source: Track.Source.Microphone,
          name: 'microphone',
        })
        if (!desired.value.mic) {
          await publication.mute()
        }
      }
      await applyDesiredPublications(myGeneration)
      if (!stillCurrent()) return

      setState('connected')
      emit({ type: 'joined', roomId: targetRoomId })
      canPlaybackAudio.value = room.canPlaybackAudio
      scheduleSnapshot()
    } catch (error) {
      if (!stillCurrent()) {
        return
      }
      console.error(error)
      await teardownRoom()
      roomId.value = null
      setState('idle')
      emit({
        type: 'error',
        detail: { scope: 'connect', message: (error as Error)?.message ?? 'Não foi possível entrar no canal.', error },
      })
    }
  }

  async function applyDesiredPublications(myGeneration: number): Promise<void> {
    const stillCurrent = () => myGeneration === generation
    if (!room || !stillCurrent()) return

    if (desired.value.camera && localMedia.cameraTrack.value) {
      await room.localParticipant.publishTrack(localMedia.cameraTrack.value, {
        source: Track.Source.Camera,
        name: 'camera',
      })
    }
    if (!stillCurrent()) return

    if (desired.value.screen) {
      const videoTrack = screenStream?.getVideoTracks()[0]
      if (videoTrack && videoTrack.readyState === 'live') {
        await room.localParticipant.publishTrack(videoTrack, { source: Track.Source.ScreenShare, name: 'screen' })
        const audioTrack = screenStream?.getAudioTracks()[0]
        if (audioTrack && audioTrack.readyState === 'live') {
          await room.localParticipant.publishTrack(audioTrack, {
            source: Track.Source.ScreenShareAudio,
            name: 'screen_audio',
          })
        }
      } else {
        setDesired({ screen: false })
        stopScreenStream()
      }
    }
    if (!stillCurrent()) return

    if (desired.value.listenAlong) {
      const audioTrack = listenAlongStream?.getAudioTracks()[0]
      if (audioTrack && audioTrack.readyState === 'live') {
        await room.localParticipant.publishTrack(audioTrack, {
          source: Track.Source.Unknown,
          name: LISTEN_ALONG_TRACK_NAME,
        })
      } else {
        setDesired({ listenAlong: false })
        stopListenAlongStream()
      }
    }
    emitLocalState()
  }

  function emitLocalState(): void {
    // desired ja e' reativo (ref) - qualquer leitor (VoicePanel etc.) reage sozinho.
  }

  async function leave({ releaseMedia = true }: { releaseMedia?: boolean } = {}): Promise<void> {
    const previousRoom = roomId.value
    generation++
    abort?.abort()
    abort = null
    await teardownRoom()
    stopScreenStream()
    stopListenAlongStream()
    if (releaseMedia) {
      localMedia.release()
    }
    roomId.value = null
    qualityByIdentity.clear()
    speakingIdentities.clear()
    participants.value = []
    videoPubs.value = []
    audioPubs.value = []
    setState('idle')
    if (previousRoom) {
      emit({ type: 'left', roomId: previousRoom, reason: 'user' })
    }
  }

  async function teardownRoom(): Promise<void> {
    if (!room) return
    const current = room
    room = null
    current.removeAllListeners()
    try {
      await current.disconnect(false)
    } catch {
      // desconectar nunca deve travar o proximo join
    }
  }

  function stopScreenStream(): void {
    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop())
      screenStream = null
    }
  }

  function stopListenAlongStream(): void {
    if (listenAlongStream) {
      listenAlongStream.getTracks().forEach((track) => track.stop())
      listenAlongStream = null
    }
  }

  // ---------------------------------------------------------------- controles

  async function setDisplayName(name: string): Promise<void> {
    displayName = name
    const identity = useIdentityStore()
    identity.setDisplayName(name)
    try {
      await room?.localParticipant?.setName(name)
    } catch (error) {
      console.error(error)
    }
    scheduleSnapshot()
  }

  async function setMicEnabled(on: boolean): Promise<void> {
    setDesired({ mic: !!on })
    const publication = room?.localParticipant.getTrackPublication(Track.Source.Microphone)
    if (!publication) return
    try {
      await (on ? publication.unmute() : publication.mute())
    } catch (error) {
      console.error(error)
      emit({ type: 'error', detail: { scope: 'publish', message: 'Falha ao alternar o microfone', error } })
    }
  }

  async function setCameraEnabled(on: boolean): Promise<void> {
    if (on && !localMedia.hasCamera.value) {
      emit({ type: 'error', detail: { scope: 'media', message: 'Nenhuma câmera encontrada neste dispositivo.' } })
      return
    }
    const previous = desired.value.camera
    setDesired({ camera: !!on })
    try {
      await setCameraPublished(!!on)
    } catch (error) {
      console.error(error)
      setDesired({ camera: previous })
      emit({ type: 'error', detail: { scope: 'publish', message: 'Falha ao alternar a câmera', error } })
    }
  }

  async function setCameraPublished(publish: boolean): Promise<void> {
    if (!room || !localMedia.cameraTrack.value) return
    if (publish) {
      await room.localParticipant.publishTrack(localMedia.cameraTrack.value, {
        source: Track.Source.Camera,
        name: 'camera',
      })
    } else {
      // unpublish, nao mute: some com o tile remoto em vez de congelar no ultimo frame.
      await room.localParticipant.unpublishTrack(localMedia.cameraTrack.value, false)
    }
  }

  async function setScreenShareEnabled(on: boolean): Promise<void> {
    if (!on) {
      await unpublishScreen()
      setDesired({ screen: false })
      stopScreenStream()
      return
    }
    let stream: MediaStream
    try {
      stream = await screenShare.getScreenStream()
    } catch {
      return // picker cancelado pelo usuario - sem erro
    }
    screenStream = stream
    setDesired({ screen: true })
    const videoTrack = stream.getVideoTracks()[0]
    videoTrack.addEventListener('ended', () => setScreenShareEnabled(false), { once: true })
    try {
      if (!room) throw new Error('Sem conexao ativa')
      await room.localParticipant.publishTrack(videoTrack, { source: Track.Source.ScreenShare, name: 'screen' })
      const audioTrack = stream.getAudioTracks()[0]
      if (audioTrack) {
        await room.localParticipant.publishTrack(audioTrack, {
          source: Track.Source.ScreenShareAudio,
          name: 'screen_audio',
        })
      }
    } catch (error) {
      console.error(error)
      setDesired({ screen: false })
      stopScreenStream()
      emit({ type: 'error', detail: { scope: 'publish', message: 'Falha ao compartilhar a tela', error } })
    }
  }

  async function unpublishScreen(): Promise<void> {
    if (!room || !screenStream) return
    const video = screenStream.getVideoTracks()[0]
    const audio = screenStream.getAudioTracks()[0]
    if (video) await room.localParticipant.unpublishTrack(video, false).catch(() => {})
    if (audio) await room.localParticipant.unpublishTrack(audio, false).catch(() => {})
  }

  async function setListenAlongEnabled(on: boolean): Promise<void> {
    if (!on) {
      await unpublishListenAlong()
      setDesired({ listenAlong: false })
      stopListenAlongStream()
      return
    }
    let stream: MediaStream
    try {
      stream = await screenShare.getTabAudioStream()
    } catch (error) {
      if (error instanceof NoTabAudioError) {
        emit({ type: 'error', detail: { scope: 'media', message: error.message } })
      }
      return
    }
    listenAlongStream = stream
    setDesired({ listenAlong: true })
    try {
      if (!room) throw new Error('Sem conexao ativa')
      await room.localParticipant.publishTrack(stream.getAudioTracks()[0], {
        source: Track.Source.Unknown,
        name: LISTEN_ALONG_TRACK_NAME,
      })
    } catch (error) {
      console.error(error)
      setDesired({ listenAlong: false })
      stopListenAlongStream()
      emit({ type: 'error', detail: { scope: 'publish', message: 'Falha ao compartilhar o áudio da aba', error } })
    }
  }

  async function unpublishListenAlong(): Promise<void> {
    if (!room || !listenAlongStream) return
    const audio = listenAlongStream.getAudioTracks()[0]
    if (audio) await room.localParticipant.unpublishTrack(audio, false).catch(() => {})
  }

  async function unlockAudio(): Promise<void> {
    try {
      await room?.startAudio()
    } catch (error) {
      console.error(error)
    }
  }

  async function setAudioOutput(deviceId: string): Promise<void> {
    if (!deviceId || !room) return
    try {
      await room.switchActiveDevice('audiooutput', deviceId)
    } catch (error) {
      console.error(error)
    }
  }

  // ---------------------------------------------------------------- eventos do LiveKit

  function wireRoomEvents(target: Room, myGeneration: number): void {
    const current = () => myGeneration === generation && room === target

    const snapshot = () => {
      if (current()) scheduleSnapshot()
    }

    target.on(RoomEvent.TrackSubscribed, snapshot)
    target.on(RoomEvent.TrackUnsubscribed, snapshot)
    target.on(RoomEvent.LocalTrackPublished, snapshot)
    target.on(RoomEvent.LocalTrackUnpublished, snapshot)
    target.on(RoomEvent.TrackMuted, snapshot)
    target.on(RoomEvent.TrackUnmuted, snapshot)
    target.on(RoomEvent.ParticipantNameChanged, snapshot)

    target.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      if (!current()) return
      emit({ type: 'participantjoined', name: participant.name || 'Alguém' })
      scheduleSnapshot()
    })

    target.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      if (!current()) return
      qualityByIdentity.delete(participant.identity)
      speakingIdentities.delete(participant.identity)
      emit({ type: 'participantleft', identity: participant.identity, name: participant.name || 'Alguém' })
      scheduleSnapshot()
    })

    target.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      if (!current()) return
      speakingIdentities.clear()
      speakers.forEach((speaker) => speakingIdentities.add(speaker.identity))
      scheduleSnapshot()
    })

    target.on(RoomEvent.ConnectionQualityChanged, (quality: ConnectionQuality, participant?: Participant) => {
      if (!current()) return
      const id = (participant ?? target.localParticipant).identity
      qualityByIdentity.set(id, quality)
      scheduleSnapshot()
    })

    target.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      if (!current()) return
      canPlaybackAudio.value = target.canPlaybackAudio
    })

    target.on(RoomEvent.Reconnecting, () => {
      if (!current()) return
      setState('reconnecting')
      // participants/pubs colapsam pra [] durante reconexao (mesmo comportamento do
      // getter original) - scheduleSnapshot roda no microtask seguinte, quando state ja
      // e' 'reconnecting'.
      scheduleSnapshot()
    })

    target.on(RoomEvent.Reconnected, () => {
      if (!current()) return
      setState('connected')
      scheduleSnapshot()
    })

    target.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
      if (!current()) return
      const disconnectedRoomId = roomId.value
      room = null
      roomId.value = null
      participants.value = []
      videoPubs.value = []
      audioPubs.value = []
      setState('idle')
      emit({ type: 'left', roomId: disconnectedRoomId ?? '', reason: 'server' })

      if (reason === DisconnectReason.ROOM_DELETED) {
        emit({ type: 'kicked', roomId: disconnectedRoomId ?? '' })
        return
      }
      emit({
        type: 'error',
        detail: {
          scope: 'connect',
          message:
            reason === DisconnectReason.DUPLICATE_IDENTITY
              ? 'Você entrou neste canal em outra aba.'
              : 'A conexão com o servidor de mídia caiu.',
          reconnectRoomId: disconnectedRoomId ?? undefined,
        },
      })
    })
  }

  // ---------------------------------------------------------------- snapshot batching

  function scheduleSnapshot(): void {
    if (snapshotQueued) return
    snapshotQueued = true
    queueMicrotask(() => {
      snapshotQueued = false
      if (!room) return
      participants.value = state.value === 'connected' ? buildParticipants(room) : []
      videoPubs.value = buildPubs(room, (pub) => pub.kind === 'video' && VIDEO_SOURCES.has(sourceOf(pub)))
      audioPubs.value = buildPubs(room, (pub) => pub.kind === 'audio')
    })
  }

  function sourceOf(publication: TrackPublication): Track.Source {
    if (publication.trackName === LISTEN_ALONG_TRACK_NAME) {
      return Track.Source.Unknown
    }
    return publication.source
  }

  function sourceLabel(publication: TrackPublication): string {
    return publication.trackName === LISTEN_ALONG_TRACK_NAME ? 'listen_along' : publication.source
  }

  function displayNameFor(participant: Participant): string {
    return participant.isLocal ? displayName : participant.name || 'Participante'
  }

  function allParticipants(target: Room): Participant[] {
    return [target.localParticipant, ...target.remoteParticipants.values()]
  }

  function buildPubs(target: Room, predicate: (pub: TrackPublication) => boolean): PubView[] {
    const result: PubView[] = []
    for (const participant of allParticipants(target)) {
      for (const publication of participant.trackPublications.values()) {
        if (!publication.track || publication.isMuted || !predicate(publication)) continue
        result.push(pubView(publication, participant))
      }
    }
    return result
  }

  function pubView(publication: TrackPublication, participant: Participant): PubView {
    const stableId = stableIdOf(participant.identity)
    const track = publication.track!
    return {
      key: `${participant.identity}|${sourceLabel(publication)}`,
      trackSid: publication.trackSid,
      identity: participant.identity,
      stableId,
      name: displayNameFor(participant),
      isLocal: participant.isLocal,
      kind: publication.kind as 'video' | 'audio',
      source: sourceLabel(publication),
      muted: publication.isMuted,
      attach: (element) => track.attach(element),
      detach: (element) => track.detach(element),
      setVolume: (volume) => (track as LocalTrack & { setVolume?: (v: number) => void }).setVolume?.(volume),
    }
  }

  function buildParticipants(target: Room): ParticipantView[] {
    return allParticipants(target).map((participant) => {
      const pubs = [...participant.trackPublications.values()]
      const micPub = pubs.find((p) => p.source === Track.Source.Microphone)
      const cameraPub = pubs.find((p) => p.source === Track.Source.Camera)
      const screenPub = pubs.find((p) => p.source === Track.Source.ScreenShare)
      const listenPub = pubs.find((p) => p.trackName === LISTEN_ALONG_TRACK_NAME)
      return {
        identity: participant.identity,
        stableId: stableIdOf(participant.identity),
        name: displayNameFor(participant),
        isLocal: participant.isLocal,
        micOn: !!micPub && !micPub.isMuted,
        camOn: !!cameraPub && !cameraPub.isMuted,
        screenOn: !!screenPub && !screenPub.isMuted,
        listeningAlong: !!listenPub && !listenPub.isMuted,
        speaking: speakingIdentities.has(participant.identity),
        quality: qualityByIdentity.get(participant.identity) ?? 'unknown',
      }
    })
  }

  // ---------------------------------------------------------------- eventos de midia local

  localMedia.on((detail) => {
    if (detail.type === 'ended' && detail.kind === 'audio') {
      emit({ type: 'error', detail: { scope: 'media', message: 'O microfone foi desconectado.' } })
    } else if (detail.type === 'ended' && detail.kind === 'video' && desired.value.camera) {
      setDesired({ camera: false })
      emit({ type: 'error', detail: { scope: 'media', message: 'A câmera foi desconectada.' } })
    } else if (detail.type === 'trackchange') {
      const publication =
        detail.kind === 'audio'
          ? room?.localParticipant.getTrackPublication(Track.Source.Microphone)
          : room?.localParticipant.getTrackPublication(Track.Source.Camera)
      const localTrack = publication?.track as LocalTrack | undefined
      localTrack?.replaceTrack?.(detail.track).catch((error: unknown) => console.error(error))
    }
  })

  return {
    state,
    roomId,
    desired,
    canPlaybackAudio,
    participants,
    videoPubs,
    audioPubs,
    on,
    join,
    leave,
    setDisplayName,
    setMicEnabled,
    setCameraEnabled,
    setScreenShareEnabled,
    setListenAlongEnabled,
    unlockAudio,
    setAudioOutput,
  }
})
