/**
 * Reprodução do áudio remoto.
 *
 * Antes o áudio era anexado no MESMO <video> do vídeo, um por participante. Isso quebrava
 * quatro coisas de uma vez: participante sem câmera (que agora é um círculo de avatar, sem
 * elemento <video>), volume individual, "surdo", e tela compartilhada como tile separado.
 * E tinha um bug vivo: o attachToElement do LiveKit força `el.muted = false` ao anexar
 * áudio, desfazendo o `video.muted = true` do tile local — ou seja, a pessoa ouvia o
 * próprio microfone.
 *
 * Agora: um <audio> oculto por PUBLICAÇÃO de áudio remota, chaveado por trackSid.
 *
 * Por trackSid e não por identity: um participante pode ter microfone +
 * screen_share_audio + "ouvir junto" tocando ao mesmo tempo. E não por identity|source,
 * porque duas publicações Source.Unknown colidiriam nessa chave.
 */

import { el } from '../lib/dom.js';
import { getPref, setPref, getPrefEntry, setPrefEntry, KEYS } from '../lib/prefs.js';

export class AudioSink extends EventTarget {
    #container;
    /** trackSid -> { element, pub } */
    #elements = new Map();
    #deafened = false;

    constructor({ container }) {
        super();
        this.#container = container;
        this.#deafened = getPref(KEYS.deafened, false) === true;
    }

    get deafened() {
        return this.#deafened;
    }

    /** Diff por chave: cria os que faltam, remove os que sobraram, não toca no resto. */
    sync(audioPubs) {
        // Áudio local NUNCA é anexado - é o que evita ouvir a própria voz.
        const remote = audioPubs.filter((pub) => !pub.isLocal);
        const wanted = new Map(remote.map((pub) => [pub.trackSid, pub]));

        for (const [trackSid, entry] of [...this.#elements]) {
            if (!wanted.has(trackSid)) {
                this.#destroy(trackSid, entry);
            }
        }

        for (const pub of remote) {
            if (!this.#elements.has(pub.trackSid)) {
                this.#create(pub);
            }
        }
    }

    #create(pub) {
        const element = el('audio', { autoplay: true, dataset: { stableId: pub.stableId, source: pub.source } });
        this.#container.appendChild(element);
        pub.attach(element);
        this.#elements.set(pub.trackSid, { element, pub });

        // Ordem importa: volume primeiro (é o RemoteAudioTrack, que reaplica em attaches
        // futuros), depois muted, que é ortogonal e instantâneo.
        pub.setVolume(this.getVolume(pub.stableId));
        element.muted = this.#deafened || this.isMutedFor(pub.stableId);
    }

    #destroy(trackSid, entry) {
        try {
            entry.pub.detach(entry.element);
        } catch {
            // a track pode já ter sido encerrada do outro lado
        }
        // Tira do DOM pra que o reciclador de elementos do SDK não entregue um elemento
        // ainda montado pra outra track.
        entry.element.remove();
        this.#elements.delete(trackSid);
    }

    /**
     * "Surdo": muta na saída em vez de cancelar a subscrição.
     *
     * setSubscribed(false) economizaria banda, mas custa uma renegociação a cada toggle e
     * mata o indicador de "está falando" da pessoa - que é justamente o que se quer
     * continuar vendo enquanto está surdo.
     */
    setDeafened(on) {
        this.#deafened = !!on;
        setPref(KEYS.deafened, this.#deafened);
        this.#applyMuted();
        this.dispatchEvent(new CustomEvent('deafenchange', { detail: { deafened: this.#deafened } }));
    }

    /** 0..1. Vale pra todas as tracks de áudio da pessoa (mic, áudio de tela, ouvir junto). */
    setVolume(stableId, volume) {
        const clamped = Math.min(1, Math.max(0, Number(volume) || 0));
        setPrefEntry(KEYS.volumes, stableId, clamped);
        for (const { pub } of this.#elements.values()) {
            if (pub.stableId === stableId) {
                pub.setVolume(clamped);
            }
        }
        this.#notifyVolume(stableId);
    }

    getVolume(stableId) {
        const stored = getPrefEntry(KEYS.volumes, stableId, 1);
        const value = Number(stored);
        return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
    }

    setMutedFor(stableId, on) {
        setPrefEntry(KEYS.mutedFor, stableId, on ? true : null);
        this.#applyMuted();
        this.#notifyVolume(stableId);
    }

    isMutedFor(stableId) {
        return getPrefEntry(KEYS.mutedFor, stableId, false) === true;
    }

    clear() {
        for (const [trackSid, entry] of [...this.#elements]) {
            this.#destroy(trackSid, entry);
        }
    }

    #applyMuted() {
        for (const { element, pub } of this.#elements.values()) {
            element.muted = this.#deafened || this.isMutedFor(pub.stableId);
        }
    }

    #notifyVolume(stableId) {
        this.dispatchEvent(new CustomEvent('volumechange', {
            detail: { stableId, volume: this.getVolume(stableId), muted: this.isMutedFor(stableId) },
        }));
    }
}
