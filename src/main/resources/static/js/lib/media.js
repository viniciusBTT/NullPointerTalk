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

/** Pede só uma modalidade (audio ou video); retorna null em vez de lançar se não der certo. */
async function tryGetTrack(kind) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ [kind]: true });
        return kind === 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
    } catch {
        return null;
    }
}

export async function getLocalMedia() {
    for (let attempt = 0; ; attempt++) {
        try {
            return await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        } catch (error) {
            if (RETRYABLE_ERRORS.has(error.name) && attempt < RETRY_DELAYS_MS.length) {
                await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
                continue;
            }
            // O pedido combinado falha por inteiro mesmo quando só uma das duas modalidades
            // (áudio OU vídeo) não existe/está indisponível nesta máquina - ex: um desktop sem
            // webcam. Em vez de barrar a entrada na sala por causa de uma só, tenta as duas
            // separadas e segue com o que estiver disponível; só desiste de verdade se nenhuma
            // das duas funcionar.
            const [audioTrack, videoTrack] = await Promise.all([tryGetTrack('audio'), tryGetTrack('video')]);
            if (!audioTrack && !videoTrack) {
                throw friendlyMediaError(error);
            }
            return new MediaStream([audioTrack, videoTrack].filter(Boolean));
        }
    }
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

/**
 * Captura só o áudio de um dispositivo específico (usado ao trocar o microfone).
 *
 * Isto existe em vez de usar room.switchActiveDevice('audioinput', id) porque o
 * switchActiveDevice chama LocalTrack.restart() internamente, que PARA a track crua e a
 * substitui por uma que o SDK passa a possuir. Como o LocalMedia é a fonte única das
 * tracks locais (elas sobrevivem à troca de canal), deixar o SDK trocá-las por baixo
 * quebraria essa garantia.
 */
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
