/** Captura e controle da mídia local (câmera/microfone). */

export async function getLocalMedia() {
    return navigator.mediaDevices.getUserMedia({ audio: true, video: true });
}

export function toggleAudioTrack(stream, enabled) {
    stream.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
    });
}

export function toggleVideoTrack(stream, enabled) {
    stream.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
    });
}

export function stopStream(stream) {
    stream.getTracks().forEach((track) => track.stop());
}
