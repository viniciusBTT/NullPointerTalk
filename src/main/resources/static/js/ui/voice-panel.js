/**
 * Painel fixo no pé da sidebar: quem você é, em que canal está, e os controles que valem
 * mesmo fora de uma chamada (microfone, surdo, configurações).
 *
 * É o dono da política de "surdo", porque é o único lugar que controla os dois botões:
 * ficar surdo tem que mutar o próprio microfone junto (como no Discord), e desativar tem
 * que devolver o microfone ao estado anterior — não simplesmente ligá-lo.
 */

import { setIcon } from '../lib/icons.js';
import { avatarElement } from '../lib/avatar.js';

const STATE_LABELS = {
    idle: 'Fora de um canal',
    joining: 'Entrando…',
    connected: 'Conectado',
    reconnecting: 'Reconectando…',
};

export function initVoicePanel({
    session,
    audioSink,
    identityEl,
    nameEl,
    statusEl,
    channelEl,
    micBtn,
    deafenBtn,
    settingsBtn,
    leaveBtn,
    onOpenSettings,
    displayName,
    stableId,
}) {
    let micIntentBeforeDeafen = null;

    identityEl.replaceChildren(avatarElement({ name: displayName, seed: stableId, size: 32 }));
    nameEl.textContent = displayName;

    micBtn.addEventListener('click', () => {
        const turningOn = !session.localState.mic;
        // Ligar o microfone estando surdo é contraditório: quem faz isso quer voltar a
        // participar, então desfaz o surdo em vez de virar um estado meio-mudo confuso.
        if (turningOn && audioSink.deafened) {
            micIntentBeforeDeafen = null;
            audioSink.setDeafened(false);
        }
        session.setMicEnabled(turningOn);
    });

    deafenBtn.addEventListener('click', () => {
        const next = !audioSink.deafened;
        if (next) {
            micIntentBeforeDeafen = session.localState.mic;
            audioSink.setDeafened(true);
            session.setMicEnabled(false);
        } else {
            audioSink.setDeafened(false);
            // Restaura a intenção anterior: quem já estava mutado antes de ficar surdo
            // continua mutado ao voltar.
            session.setMicEnabled(micIntentBeforeDeafen ?? true);
            micIntentBeforeDeafen = null;
        }
    });

    settingsBtn.addEventListener('click', () => onOpenSettings?.());
    leaveBtn.addEventListener('click', () => session.leave());

    audioSink.addEventListener('deafenchange', () => renderDeafen());

    function renderDeafen() {
        const on = audioSink.deafened;
        deafenBtn.classList.toggle('is-off', on);
        deafenBtn.title = on ? 'Voltar a ouvir' : 'Ficar surdo';
        deafenBtn.setAttribute('aria-label', deafenBtn.title);
        deafenBtn.setAttribute('aria-pressed', String(on));
        setIcon(deafenBtn, on ? 'headphones-off' : 'headphones');
    }

    function setLocalState(desired) {
        micBtn.classList.toggle('is-off', !desired.mic);
        micBtn.title = desired.mic ? 'Desligar microfone' : 'Ligar microfone';
        micBtn.setAttribute('aria-label', micBtn.title);
        micBtn.setAttribute('aria-pressed', String(desired.mic));
        setIcon(micBtn, desired.mic ? 'mic' : 'mic-off');
    }

    function setState(state, roomName) {
        statusEl.textContent = STATE_LABELS[state] ?? state;
        statusEl.dataset.state = state;
        channelEl.textContent = roomName ?? '';
        const connected = state !== 'idle';
        channelEl.classList.toggle('hidden', !connected);
        leaveBtn.classList.toggle('hidden', !connected);
    }

    renderDeafen();
    setLocalState(session.localState);
    return { setState, setLocalState, renderDeafen };
}
