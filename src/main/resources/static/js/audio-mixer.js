import { getAudioContext } from './audio-context.js';

/**
 * Mixa a track do microfone com a track de audio do sistema/aba (capturada junto do
 * compartilhamento de tela) numa unica track de saida via Web Audio API - um sender
 * de audio da RTCPeerConnection so carrega uma track por vez, entao pra o remoto ouvir
 * os dois ao mesmo tempo e preciso mixar antes de mandar, nao so trocar uma pela outra.
 */
export function mixAudioTracks(micTrack, systemAudioTrack) {
    const context = getAudioContext();
    const destination = context.createMediaStreamDestination();

    const micSource = context.createMediaStreamSource(new MediaStream([micTrack]));
    micSource.connect(destination);

    const systemSource = context.createMediaStreamSource(new MediaStream([systemAudioTrack]));
    systemSource.connect(destination);

    return {
        track: destination.stream.getAudioTracks()[0],
        stop() {
            micSource.disconnect();
            systemSource.disconnect();
        },
    };
}
