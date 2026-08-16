import { getAudioContext } from './audio-context.js';

/**
 * Indicador de "falando agora": um unico loop de requestAnimationFrame compartilhado
 * entre todos os tiles monitorados (em vez de um por tile), lendo o nivel RMS de cada
 * AnalyserNode. Hysteresis (HANGOVER_MS) evita que o indicador pisque em pausas curtas
 * de fala.
 */

const SPEAKING_THRESHOLD = 0.05;
const HANGOVER_MS = 300;

class AudioActivityMonitor {
    constructor() {
        this.entries = new Map();
        this.rafId = null;
    }

    /** (Re)passa a monitorar `stream` sob `tileId` - chamar de novo se a track de audio trocar. */
    watch(tileId, stream, onChange) {
        this.unwatch(tileId);
        const audioTrack = stream.getAudioTracks()[0];
        if (!audioTrack) {
            return;
        }
        const context = getAudioContext();
        const source = context.createMediaStreamSource(new MediaStream([audioTrack]));
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        this.entries.set(tileId, {
            source,
            analyser,
            dataArray: new Uint8Array(analyser.fftSize),
            onChange,
            speaking: false,
            lastLoudAt: 0,
        });
        this.ensureLoop();
    }

    unwatch(tileId) {
        const entry = this.entries.get(tileId);
        if (!entry) {
            return;
        }
        entry.source.disconnect();
        entry.analyser.disconnect();
        this.entries.delete(tileId);
        if (this.entries.size === 0 && this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    ensureLoop() {
        if (this.rafId) {
            return;
        }
        const tick = () => {
            const now = performance.now();
            this.entries.forEach((entry) => {
                entry.analyser.getByteTimeDomainData(entry.dataArray);
                let sumSquares = 0;
                for (let i = 0; i < entry.dataArray.length; i++) {
                    const normalized = (entry.dataArray[i] - 128) / 128;
                    sumSquares += normalized * normalized;
                }
                const rms = Math.sqrt(sumSquares / entry.dataArray.length);
                if (rms > SPEAKING_THRESHOLD) {
                    entry.lastLoudAt = now;
                    if (!entry.speaking) {
                        entry.speaking = true;
                        entry.onChange(true);
                    }
                } else if (entry.speaking && now - entry.lastLoudAt > HANGOVER_MS) {
                    entry.speaking = false;
                    entry.onChange(false);
                }
            });
            this.rafId = requestAnimationFrame(tick);
        };
        this.rafId = requestAnimationFrame(tick);
    }
}

export const audioActivityMonitor = new AudioActivityMonitor();
