/** Captura de tela para compartilhamento (publicada como track separada em room.js). */

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

/**
 * Mesmo truque do "Compartilhar áudio" do Discord: pede vídeo + áudio da aba (só assim o
 * seletor nativo aparece), mas descarta a track de vídeo (track.stop()) assim que a captura
 * começa - sobra só o áudio da aba, publicado em paralelo com o microfone. Lança erro se o
 * usuário não marcar a opção de compartilhar áudio no seletor nativo (nem todo SO/navegador
 * oferece, e mesmo quando oferece o usuário pode não marcar).
 */
export async function getTabAudioStream() {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    stream.getVideoTracks().forEach((track) => track.stop());
    if (!stream.getAudioTracks().length) {
        const error = new Error(
            'Nenhum áudio foi compartilhado — marque "Compartilhar áudio da guia/aba" no seletor e tente de novo.',
        );
        error.name = 'NoTabAudioError';
        throw error;
    }
    return stream;
}
