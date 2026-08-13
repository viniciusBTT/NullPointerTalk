/** Captura de tela para compartilhamento (troca de track via peers.js#replaceVideoTrack). */

export async function getScreenStream() {
    return navigator.mediaDevices.getDisplayMedia({ video: true });
}
