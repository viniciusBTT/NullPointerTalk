import { useUiFeedback } from '@/composables/useUiFeedback'

/** Roda no boot: navegador sem WebRTC/getUserMedia/WebSocket travaria silenciosamente em
 * telas em branco/travadas mais adiante - melhor uma mensagem compreensível já de cara
 * (edge case da spec). */
export function useBrowserSupport() {
  function checkSupport(): boolean {
    const hasWebSocket = typeof WebSocket !== 'undefined'
    const hasGetUserMedia = !!navigator.mediaDevices?.getUserMedia
    const hasRTCPeerConnection = typeof RTCPeerConnection !== 'undefined'

    if (hasWebSocket && hasGetUserMedia && hasRTCPeerConnection) {
      return true
    }

    const { showBanner } = useUiFeedback()
    showBanner(
      'Este navegador não suporta os recursos necessários (WebRTC/câmera-microfone ou WebSocket). Use um navegador atualizado, como Chrome, Firefox ou Edge.',
      { dismissible: false },
    )
    return false
  }

  return { checkSupport }
}
