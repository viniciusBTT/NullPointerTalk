/** Captura e controle da mídia local (câmera/microfone/dispositivos). */

const FRIENDLY_MEDIA_ERRORS = {
    NotAllowedError:
        'Permissão de câmera/microfone negada — libere o acesso nas configurações do navegador e recarregue a página.',
    NotFoundError: 'Nenhuma câmera ou microfone encontrado neste dispositivo.',
    NotReadableError:
        'A câmera ou microfone já está em uso por outro programa/aba — feche-o e tente novamente.',
    OverconstrainedError: 'Nenhum dispositivo atende às configurações solicitadas.',
};

function friendlyMediaError(error) {
    const message = FRIENDLY_MEDIA_ERRORS[error.name] ?? `Erro ao acessar câmera/microfone (${error.name}).`;
    return new Error(message, { cause: error });
}

// Ao sair de uma sala paramos as tracks (stopStream) e navegamos de volta pra home logo em
// seguida - em algumas combinações de SO/driver de webcam a liberação do dispositivo não é
// instantânea, e a próxima getUserMedia (ex: entrando em outra sala na sequência) pode falhar
// com "não encontrado"/"em uso" por uma fração de segundo. Por isso essas duas tentamos de novo
// com um pequeno atraso antes de desistir e mostrar erro pro usuário.
const RETRYABLE_ERRORS = new Set(['NotReadableError', 'NotFoundError']);
const RETRY_DELAYS_MS = [400, 900];

export async function getLocalMedia() {
    for (let attempt = 0; ; attempt++) {
        try {
            return await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        } catch (error) {
            if (!RETRYABLE_ERRORS.has(error.name) || attempt >= RETRY_DELAYS_MS.length) {
                throw friendlyMediaError(error);
            }
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
        }
    }
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

/** Lista as câmeras disponíveis (mesma ressalva de labels do listAudioDevices). */
export async function listVideoDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'videoinput');
}

/** Captura só o áudio de um dispositivo específico (usado ao trocar o microfone). */
export async function getAudioTrackForDevice(deviceId) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        });
        return stream.getAudioTracks()[0];
    } catch (error) {
        throw friendlyMediaError(error);
    }
}

/** Captura só o vídeo de uma câmera específica (usado ao trocar de câmera). */
export async function getVideoTrackForDevice(deviceId) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: deviceId ? { deviceId: { exact: deviceId } } : true,
        });
        return stream.getVideoTracks()[0];
    } catch (error) {
        throw friendlyMediaError(error);
    }
}

/** true se o navegador suporta trocar o dispositivo de saída de áudio (HTMLMediaElement.setSinkId). */
export function supportsAudioOutputSelection() {
    return typeof HTMLMediaElement.prototype.setSinkId === 'function';
}
