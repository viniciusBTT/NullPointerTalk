/** Captura de tela para compartilhamento (troca de track via peers.js#replaceVideoTrack). */

/**
 * Pede video + audio do sistema/aba (o navegador decide se oferece a opcao de audio -
 * depende do SO e do que for escolhido no seletor nativo: aba costuma funcionar em
 * qualquer SO, tela inteira depende de suporte do SO). Quem chama deve checar
 * `getAudioTracks().length` antes de assumir que veio audio - o usuário pode não marcar
 * a opção no seletor nativo, ou o navegador/SO simplesmente não suportar.
 */
export async function getScreenStream() {
    return navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
}
