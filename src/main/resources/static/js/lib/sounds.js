/**
 * Beeps de entrada/saída sintetizados na hora. Sem arquivo de áudio pra baixar,
 * sem asset pra versionar.
 */

import { getPref, setPref, KEYS } from './prefs.js';

/**
 * UM contexto pra página inteira, criado sob demanda. O Chrome limita AudioContexts
 * concorrentes (~6) e o LiveKit já cria um por Room - criar um por beep esgotaria a
 * cota em poucos minutos de uso e aí *nenhum* áudio toca mais.
 */
let ctx = null;

/**
 * `armed` existe porque ParticipantConnected dispara pra cada participante que já
 * estava na sala no momento do connect. Sem essa trava, entrar num canal com 4 pessoas
 * toca 4 beeps de uma vez. O app arma isso só depois do evento 'joined'.
 */
let armed = false;

function context() {
    if (!ctx) {
        const Ctor = window.AudioContext ?? window.webkitAudioContext;
        if (!Ctor) {
            return null;
        }
        ctx = new Ctor();
    }
    return ctx;
}

export function isEnabled() {
    return getPref(KEYS.sounds, true) !== false;
}

export function setEnabled(on) {
    setPref(KEYS.sounds, !!on);
}

export function setArmed(on) {
    armed = !!on;
}

/**
 * Chamado no primeiro gesto do usuário (clique num canal). Navegadores criam o
 * AudioContext em estado 'suspended' quando não há gesto, e sem o resume() o primeiro
 * beep sai mudo.
 */
export function primeAudio() {
    const ac = context();
    if (ac?.state === 'suspended') {
        ac.resume().catch(() => {});
    }
}

/**
 * Duas notas curtas em sequência. A envelope exponencial (não um corte seco) é o que
 * evita o "click" de descontinuidade no fim de cada nota.
 */
function playTones(tones) {
    if (!armed || !isEnabled()) {
        return;
    }
    const ac = context();
    if (!ac) {
        return;
    }
    if (ac.state === 'suspended') {
        ac.resume().catch(() => {});
    }

    const start = ac.currentTime;
    tones.forEach(({ freq, at, dur, gain = 0.14 }) => {
        const osc = ac.createOscillator();
        const vol = ac.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        vol.gain.setValueAtTime(0.0001, start + at);
        vol.gain.exponentialRampToValueAtTime(gain, start + at + 0.012);
        vol.gain.exponentialRampToValueAtTime(0.0001, start + at + dur);
        osc.connect(vol).connect(ac.destination);
        osc.start(start + at);
        osc.stop(start + at + dur + 0.02);
    });
}

/** Subindo: alguém chegou. */
export function playJoin() {
    playTones([
        { freq: 587.33, at: 0, dur: 0.09 },
        { freq: 880.0, at: 0.085, dur: 0.13 },
    ]);
}

/** Descendo: alguém saiu. */
export function playLeave() {
    playTones([
        { freq: 587.33, at: 0, dur: 0.09 },
        { freq: 392.0, at: 0.085, dur: 0.15 },
    ]);
}
