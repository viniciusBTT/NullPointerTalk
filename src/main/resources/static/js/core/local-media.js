/**
 * Dono das tracks locais (mic e câmera) pelo ciclo de vida da página inteira.
 *
 * Por que isso é um módulo e não parte da sessão: com o shell persistente, trocar de
 * canal desconecta e reconecta no LiveKit, mas NÃO deve pedir a câmera de novo. Antes o
 * app recarregava a página a cada troca de sala, e como o driver da webcam não libera o
 * dispositivo instantaneamente, precisava de um setTimeout(150ms) antes de navegar pra
 * próxima getUserMedia não falhar com "dispositivo em uso". Capturando uma única vez e
 * republicando a mesma track, essa corrida deixa de existir.
 */

import {
    getLocalMedia,
    stopStream,
    listAudioDevices,
    listVideoDevices,
    getAudioTrackForDevice,
    getVideoTrackForDevice,
} from '../lib/media.js';

export class LocalMedia extends EventTarget {
    #stream = null;
    #pending = null;
    #devicesBound = false;

    /**
     * Idempotente. Guarda a PROMISE, não o resultado: dois joins rápidos em sequência
     * compartilham uma única captura em vez de disparar duas getUserMedia concorrentes.
     */
    async ensure() {
        if (this.#stream) {
            return this.#tracks();
        }
        if (!this.#pending) {
            this.#pending = getLocalMedia()
                .then((stream) => {
                    this.#stream = stream;
                    this.#watchTracks();
                    this.#bindDeviceChange();
                    return this.#tracks();
                })
                .finally(() => {
                    this.#pending = null;
                });
        }
        return this.#pending;
    }

    get micTrack() {
        return this.#stream?.getAudioTracks()[0] ?? null;
    }

    get cameraTrack() {
        return this.#stream?.getVideoTracks()[0] ?? null;
    }

    get hasMic() {
        return !!this.micTrack;
    }

    /**
     * false quando a máquina não tem webcam: o getLocalMedia cai num fallback de
     * modalidade única e devolve só áudio. Sem checar isso, o botão de câmera ficaria
     * clicável e silenciosamente sem efeito.
     */
    get hasCamera() {
        return !!this.cameraTrack;
    }

    async setAudioInput(deviceId) {
        const previous = this.micTrack;
        const track = await getAudioTrackForDevice(deviceId);
        this.#replace(previous, track);
        this.#emit('trackchange', { kind: 'audio', track, previous });
        return track;
    }

    async setVideoInput(deviceId) {
        const previous = this.cameraTrack;
        const track = await getVideoTrackForDevice(deviceId);
        this.#replace(previous, track);
        this.#emit('trackchange', { kind: 'video', track, previous });
        return track;
    }

    /** Apaga a luz da câmera e do mic. Chamado ao sair da voz, não ao trocar de canal. */
    release() {
        if (this.#stream) {
            stopStream(this.#stream);
            this.#stream = null;
        }
        this.#pending = null;
    }

    async listDevices() {
        const { inputs, outputs } = await listAudioDevices();
        const videoInputs = await listVideoDevices();
        return { audioIn: inputs, audioOut: outputs, videoIn: videoInputs };
    }

    #tracks() {
        return { micTrack: this.micTrack, cameraTrack: this.cameraTrack };
    }

    #replace(previous, next) {
        if (!this.#stream) {
            this.#stream = new MediaStream();
        }
        if (previous) {
            this.#stream.removeTrack(previous);
            previous.stop();
        }
        this.#stream.addTrack(next);
        this.#watchTracks();
    }

    /**
     * 'ended' dispara quando o dispositivo é desconectado fisicamente (fone USB
     * arrancado). Sem tratar, a publicação continua no ar transmitindo silêncio e ninguém
     * entende por que pararam de ouvir.
     */
    #watchTracks() {
        this.#stream?.getTracks().forEach((track) => {
            if (track.__nptWatched) {
                return;
            }
            track.__nptWatched = true;
            track.addEventListener('ended', () => {
                this.#emit('ended', { kind: track.kind, track });
            });
        });
    }

    /**
     * UM listener pra página inteira. Antes isso era registrado dentro do init() da sala:
     * inofensivo quando havia um init por page load, mas vazaria um listener por join
     * agora que entrar num canal não recarrega a página.
     */
    #bindDeviceChange() {
        if (this.#devicesBound || !navigator.mediaDevices?.addEventListener) {
            return;
        }
        this.#devicesBound = true;
        navigator.mediaDevices.addEventListener('devicechange', async () => {
            try {
                this.#emit('deviceschange', await this.listDevices());
            } catch {
                // enumerateDevices falhando não é motivo pra derrubar nada
            }
        });
    }

    #emit(type, detail) {
        this.dispatchEvent(new CustomEvent(type, { detail }));
    }
}
