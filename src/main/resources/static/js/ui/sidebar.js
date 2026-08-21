/**
 * A lista de canais e quem está em cada um.
 *
 * As linhas de canal vêm renderizadas pelo servidor (o catálogo é fixo no código), então
 * este módulo só preenche os participantes, o badge de não-lidas e o estado ativo. Não
 * recria a lista — nunca precisa.
 */

import { el, clear } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { avatarElement } from '../lib/avatar.js';

export function initSidebar({ listEl, noticeEl, onParticipantClick }) {
    let activeRoomId = null;
    let speaking = new Set();
    /** roomId -> [{identity, stableId, name, ...}] do último render */
    let membersByRoom = {};

    listEl.addEventListener('click', (event) => {
        const row = event.target.closest('.member');
        if (!row) {
            return;
        }
        // Clique num participante não deve navegar pro canal - por isso o stopPropagation
        // antes que o handler de links do router veja o evento.
        event.preventDefault();
        event.stopPropagation();
        onParticipantClick?.(row.dataset.identity, row);
    });

    function channelNode(roomId) {
        return listEl.querySelector(`.channel[data-room-id="${cssEscape(roomId)}"]`);
    }

    function setActiveChannel(roomId) {
        activeRoomId = roomId;
        listEl.querySelectorAll('.channel').forEach((node) => {
            node.classList.toggle('channel--active', node.dataset.roomId === roomId);
        });
    }

    function setConnecting(roomId) {
        listEl.querySelectorAll('.channel').forEach((node) => {
            node.classList.toggle('channel--connecting', roomId !== null && node.dataset.roomId === roomId);
        });
    }

    function setUnread(roomId, count) {
        const badge = channelNode(roomId)?.querySelector('.channel__unread');
        if (!badge) {
            return;
        }
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.classList.toggle('hidden', count === 0);
    }

    function setPresence(byRoom, degraded) {
        membersByRoom = byRoom ?? {};
        for (const node of listEl.querySelectorAll('.channel')) {
            const roomId = node.dataset.roomId;
            renderMembers(node, membersByRoom[roomId] ?? []);
        }
        // Nunca esvazia a lista quando a presença falha: some só o aviso, e o último dado
        // conhecido continua na tela.
        noticeEl.classList.toggle('hidden', !degraded);
    }

    function renderMembers(channelNodeEl, members) {
        const container = channelNodeEl.querySelector('.channel__members');
        clear(container);
        channelNodeEl.classList.toggle('channel--populated', members.length > 0);

        for (const member of members) {
            container.appendChild(memberRow(member));
        }
    }

    function memberRow(member) {
        const row = el('li', {
            class: ['member', speaking.has(member.identity) && 'member--speaking'],
            dataset: { identity: member.identity, stableId: member.stableId ?? '' },
        });
        row.appendChild(el('span', { class: 'member__avatar' }, avatarElement({
            name: member.name,
            seed: member.stableId ?? member.name,
            size: 24,
        })));
        row.appendChild(el('span', {
            class: 'member__name',
            text: member.isLocal ? `${member.name} (você)` : member.name,
        }));
        // micOn só vem preenchido pro canal conectado (que é lido dos eventos do LiveKit);
        // pros outros canais a presença traz só identity/name, então não há badge a mostrar.
        if (member.live && member.micOn === false) {
            row.appendChild(el('span', { class: 'member__badge', title: 'Microfone desligado' },
                icon('mic-off', { size: 14 })));
        }
        return row;
    }

    function setSpeaking(identities) {
        speaking = new Set(identities);
        listEl.querySelectorAll('.member').forEach((row) => {
            row.classList.toggle('member--speaking', speaking.has(row.dataset.identity));
        });
    }

    return { setActiveChannel, setConnecting, setUnread, setPresence, setSpeaking, get activeRoomId() { return activeRoomId; } };
}

/**
 * CSS.escape não existe em navegadores muito antigos, e os ids de canal são slugs simples
 * de qualquer forma - o fallback só evita quebrar se um dia virarem algo mais exótico.
 */
function cssEscape(value) {
    return window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/["\\]/g, '\\$&');
}
