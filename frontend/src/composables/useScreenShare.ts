export class NoTabAudioError extends Error {
  constructor() {
    super('Nenhum áudio foi compartilhado — marque "Compartilhar áudio da guia/aba" no seletor e tente de novo.')
    this.name = 'NoTabAudioError'
  }
}

export function useScreenShare() {
  async function getScreenStream(): Promise<MediaStream> {
    return navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
  }

  /**
   * Truque "escuta junto": pede video só pra fazer o seletor nativo aparecer com a opção
   * de áudio da aba, e para o video imediatamente após capturar, mantendo só o áudio.
   */
  async function getTabAudioStream(): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
    stream.getVideoTracks().forEach((track) => track.stop())
    if (stream.getAudioTracks().length === 0) {
      throw new NoTabAudioError()
    }
    return stream
  }

  return { getScreenStream, getTabAudioStream }
}
