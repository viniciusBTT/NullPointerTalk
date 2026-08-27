import { computed, ref } from 'vue'

const RETRYABLE_ERRORS = new Set(['NotReadableError', 'NotFoundError'])
const RETRY_DELAYS_MS = [400, 900]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function friendlyMediaError(error: unknown): Error {
  const name = (error as DOMException)?.name
  const message =
    {
      NotAllowedError:
        'Permissão de câmera/microfone negada — libere o acesso nas configurações do navegador e recarregue a página.',
      NotFoundError: 'Nenhuma câmera ou microfone encontrado neste dispositivo.',
      NotReadableError: 'A câmera ou microfone já está em uso por outro programa/aba — feche-o e tente novamente.',
      OverconstrainedError: 'Nenhum dispositivo atende às configurações solicitadas.',
    }[name ?? ''] ?? `Erro ao acessar câmera/microfone (${name}).`
  return new Error(message, { cause: error })
}

async function tryGetTrack(kind: 'audio' | 'video'): Promise<MediaStreamTrack | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ [kind]: true })
    return kind === 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0]
  } catch {
    return null
  }
}

/** Combinado falha por completo se so uma modalidade estiver indisponivel (ex: desktop
 * sem webcam) - por isso, apos as retentativas, cai pra pedir audio e video
 * SEPARADAMENTE e devolve o que der certo. So lanca se AMBOS falharem. */
async function getLocalMediaStream(): Promise<MediaStream> {
  let lastError: unknown = null
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
    } catch (error) {
      lastError = error
      const name = (error as DOMException)?.name
      if (RETRYABLE_ERRORS.has(name) && attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt])
        continue
      }
      break
    }
  }
  const [audioTrack, videoTrack] = await Promise.all([tryGetTrack('audio'), tryGetTrack('video')])
  if (!audioTrack && !videoTrack) {
    throw friendlyMediaError(lastError)
  }
  return new MediaStream([audioTrack, videoTrack].filter((track): track is MediaStreamTrack => !!track))
}

export function stopStream(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop())
}

export async function listAudioDevices(): Promise<{ inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] }> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return {
    inputs: devices.filter((d) => d.kind === 'audioinput'),
    outputs: devices.filter((d) => d.kind === 'audiooutput'),
  }
}

export async function listVideoDevices(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter((d) => d.kind === 'videoinput')
}

export function supportsAudioOutputSelection(): boolean {
  return typeof (HTMLMediaElement.prototype as unknown as { setSinkId?: unknown }).setSinkId === 'function'
}

type MediaEventDetail =
  | { type: 'ended'; kind: 'audio' | 'video' }
  | { type: 'trackchange'; kind: 'audio' | 'video'; track: MediaStreamTrack }
  | { type: 'deviceschange'; audioIn: MediaDeviceInfo[]; audioOut: MediaDeviceInfo[]; videoIn: MediaDeviceInfo[] }

type MediaListener = (detail: MediaEventDetail) => void

// Estado em nivel de modulo: uma UNICA captura de mídia local pra pagina inteira,
// sobrevivendo a troca de canal (ver core/local-media.js original) - useLocalMedia()
// sempre devolve o mesmo estado, nao uma instancia nova por componente.
const stream = ref<MediaStream | null>(null)
let pending: Promise<void> | null = null
let devicesBound = false
const listeners = new Set<MediaListener>()

function emit(detail: MediaEventDetail): void {
  listeners.forEach((listener) => listener(detail))
}

function watchTracks(): void {
  stream.value?.getTracks().forEach((track) => {
    const watched = track as MediaStreamTrack & { __nptWatched?: boolean }
    if (watched.__nptWatched) {
      return
    }
    watched.__nptWatched = true
    track.addEventListener('ended', () => emit({ type: 'ended', kind: track.kind as 'audio' | 'video' }))
  })
}

function bindDeviceChange(): void {
  if (devicesBound || !navigator.mediaDevices?.addEventListener) {
    return
  }
  devicesBound = true
  navigator.mediaDevices.addEventListener('devicechange', async () => {
    try {
      const { inputs, outputs } = await listAudioDevices()
      const videoIn = await listVideoDevices()
      emit({ type: 'deviceschange', audioIn: inputs, audioOut: outputs, videoIn })
    } catch {
      // enumerateDevices falhando nao derruba nada
    }
  })
}

function replaceTrack(previous: MediaStreamTrack | null, next: MediaStreamTrack): void {
  if (!stream.value) {
    stream.value = new MediaStream()
  }
  if (previous) {
    stream.value.removeTrack(previous)
    previous.stop()
  }
  stream.value.addTrack(next)
  watchTracks()
}

export function useLocalMedia() {
  const micTrack = computed(() => stream.value?.getAudioTracks()[0] ?? null)
  const cameraTrack = computed(() => stream.value?.getVideoTracks()[0] ?? null)
  const hasMic = computed(() => !!micTrack.value)
  const hasCamera = computed(() => !!cameraTrack.value)

  /** Idempotente: joins rapidos em sequencia compartilham uma unica captura. */
  async function ensure(): Promise<{ micTrack: MediaStreamTrack | null; cameraTrack: MediaStreamTrack | null }> {
    if (!stream.value && !pending) {
      pending = getLocalMediaStream()
        .then((result) => {
          stream.value = result
          watchTracks()
          bindDeviceChange()
        })
        .finally(() => {
          pending = null
        })
    }
    await pending
    return { micTrack: micTrack.value, cameraTrack: cameraTrack.value }
  }

  async function setAudioInput(deviceId: string): Promise<MediaStreamTrack> {
    const previous = micTrack.value
    const media = await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    })
    const track = media.getAudioTracks()[0]
    replaceTrack(previous, track)
    emit({ type: 'trackchange', kind: 'audio', track })
    return track
  }

  async function setVideoInput(deviceId: string): Promise<MediaStreamTrack> {
    const previous = cameraTrack.value
    const media = await navigator.mediaDevices.getUserMedia({
      video: deviceId ? { deviceId: { exact: deviceId } } : true,
    })
    const track = media.getVideoTracks()[0]
    replaceTrack(previous, track)
    emit({ type: 'trackchange', kind: 'video', track })
    return track
  }

  /** Apaga a luz da câmera/mic. Chamado ao sair da voz, não ao trocar de canal. */
  function release(): void {
    if (stream.value) {
      stopStream(stream.value)
      stream.value = null
    }
    pending = null
  }

  async function listDevices(): Promise<{ audioIn: MediaDeviceInfo[]; audioOut: MediaDeviceInfo[]; videoIn: MediaDeviceInfo[] }> {
    const { inputs, outputs } = await listAudioDevices()
    const videoIn = await listVideoDevices()
    return { audioIn: inputs, audioOut: outputs, videoIn }
  }

  function on(listener: MediaListener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return { micTrack, cameraTrack, hasMic, hasCamera, ensure, release, setAudioInput, setVideoInput, listDevices, on }
}
