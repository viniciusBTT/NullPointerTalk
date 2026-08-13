/** Captura e controle da mídia local (câmera/microfone/dispositivos). */

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

/** Lista os dispositivos de entrada/saída de áudio disponíveis (labels só vêm preenchidos após permissão concedida). */
export async function listAudioDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
        inputs: devices.filter((d) => d.kind === 'audioinput'),
        outputs: devices.filter((d) => d.kind === 'audiooutput'),
    };
}

/** Captura só o áudio de um dispositivo específico (usado ao trocar o microfone). */
export async function getAudioTrackForDevice(deviceId) {
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    });
    return stream.getAudioTracks()[0];
}

/** true se o navegador suporta trocar o dispositivo de saída de áudio (HTMLMediaElement.setSinkId). */
export function supportsAudioOutputSelection() {
    return typeof HTMLMediaElement.prototype.setSinkId === 'function';
}
