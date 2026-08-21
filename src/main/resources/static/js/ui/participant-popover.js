/**
 * Popover de participante: volume individual e "silenciar só pra mim".
 *
 * Útil de verdade com o "ouvir junto" — a música que alguém compartilha da aba dele quase
 * nunca vem no mesmo volume da voz. O slider cobre todas as tracks de áudio da pessoa
 * (microfone, áudio da tela e áudio da aba) porque é isso que a intenção "abaixa esse
 * fulano" significa.
 */

import { el } from '../lib/dom.js';
import { avatarElement } from '../lib/avatar.js';

export function initParticipantPopover({ root, audioSink }) {
    let openFor = null;

    document.addEventListener('click', (event) => {
        if (openFor && !root.contains(event.target) && !event.target.closest('[data-identity]')) {
            close();
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && openFor) {
            close();
        }
    });

    function open(participant, anchor) {
        if (!participant || participant.isLocal) {
            return; // não faz sentido regular o próprio volume
        }
        openFor = participant.identity;
        root.replaceChildren(content(participant));
        root.classList.remove('hidden');
        position(anchor);
    }

    function content(participant) {
        const stableId = participant.stableId;
        const volume = audioSink.getVolume(stableId);
        const muted = audioSink.isMutedFor(stableId);

        const slider = el('input', {
            type: 'range',
            min: '0',
            max: '100',
            step: '1',
            value: String(Math.round(volume * 100)),
            class: 'popover__slider',
            disabled: muted,
            'aria-label': 'Volume',
        });
        const readout = el('span', { class: 'popover__readout', text: `${Math.round(volume * 100)}%` });
        slider.addEventListener('input', () => {
            readout.textContent = `${slider.value}%`;
            audioSink.setVolume(stableId, Number(slider.value) / 100);
        });

        const muteToggle = el('button', {
            type: 'button',
            class: ['popover__mute', muted && 'is-on'],
            text: muted ? 'Voltar a ouvir' : 'Silenciar só pra mim',
        });
        muteToggle.addEventListener('click', () => {
            const next = !audioSink.isMutedFor(stableId);
            audioSink.setMutedFor(stableId, next);
            muteToggle.textContent = next ? 'Voltar a ouvir' : 'Silenciar só pra mim';
            muteToggle.classList.toggle('is-on', next);
            slider.disabled = next;
        });

        return el('div', { class: 'popover__inner' },
            el('div', { class: 'popover__head' },
                avatarElement({ name: participant.name, seed: stableId, size: 32 }),
                el('span', { class: 'popover__name', text: participant.name })),
            el('label', { class: 'popover__row' },
                el('span', { text: 'Volume' }),
                readout),
            slider,
            muteToggle);
    }

    /**
     * Posiciona colado no elemento clicado, mas puxando pra dentro da janela quando não
     * cabe — um popover cortado na borda é pior que um levemente deslocado.
     */
    function position(anchor) {
        const box = anchor.getBoundingClientRect();
        const own = root.getBoundingClientRect();
        const margin = 8;
        const left = Math.min(box.right + margin, window.innerWidth - own.width - margin);
        const top = Math.min(box.top, window.innerHeight - own.height - margin);
        root.style.left = `${Math.max(margin, left)}px`;
        root.style.top = `${Math.max(margin, top)}px`;
    }

    function close() {
        openFor = null;
        root.classList.add('hidden');
        root.replaceChildren();
    }

    /** Fecha se a pessoa saiu do canal com o popover dela aberto. */
    function closeIf(identity) {
        if (openFor === identity) {
            close();
        }
    }

    return { open, close, closeIf };
}
