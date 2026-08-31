/**
 * A lista de canais e quem está em cada um.
 *
 * Com o CRUD de salas, a lista deixou de ser fixa: addChannel/removeChannel/renameChannel
 * constroem/atualizam a mesma estrutura que o Thymeleaf costumava renderizar uma vez só
 * (ver shell.html - o <ul id="channel-list"> nasce vazio agora, e app.js popula via
 * addChannel no boot). router.bindLinks já usa um listener DELEGADO no container, então
 * uma linha nova fica clicável sem nenhum rebind.
 */

import { el, clear } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { avatarElement } from '../lib/avatar.js';

function channelRow(room) {
    return el('li', { class: 'channel', dataset: { roomId: room.id } },
        el('a', { class: 'channel__link', href: `/room/${encodeURIComponent(room.id)}` },
            el('span', { class: 'channel__icon', text: room.icon }),
            el('span', { class: 'channel__name', text: room.name }),
            el('span', { class: 'channel__spinner', 'aria-hidden': 'true' }),
            el('span', { class: 'channel__unread hidden', text: '0' })),
        // Fora do <a> de propósito: são <button>, então router.bindLinks (que só resolve
        // cliques em `a[href]`) nunca os intercepta - não precisa de stopPropagation.
        el('span', { class: 'channel__actions' },
            el('button', { class: 'channel__edit', type: 'button', title: 'Editar sala' },
                icon('edit', { size: 14 })),
            el('button', { class: 'channel__delete', type: 'button', title: 'Apagar sala' },
                icon('trash', { size: 14 }))),
        el('ul', { class: 'channel__members' }));
}

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

    function addChannel(room) {
        if (channelNode(room.id)) {
            return; // ja existe (ex: reaproveitando o mesmo id logo depois de apagar)
        }
        listEl.appendChild(channelRow(room));
    }

    function removeChannel(roomId) {
        channelNode(roomId)?.remove();
    }

    function renameChannel(roomId, { name, icon: roomIcon }) {
        const node = channelNode(roomId);
        if (!node) {
            return;
        }
        node.querySelector('.channel__icon').textContent = roomIcon;
        node.querySelector('.channel__name').textContent = name;
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

    return {
        addChannel,
        removeChannel,
        renameChannel,
        setActiveChannel,
        setConnecting,
        setUnread,
        setPresence,
        setSpeaking,
        get activeRoomId() { return activeRoomId; },
    };
}

/**
 * CSS.escape não existe em navegadores muito antigos, e os ids de canal são slugs simples
 * de qualquer forma - o fallback só evita quebrar se um dia virarem algo mais exótico.
 */
function cssEscape(value) {
    return window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/["\\]/g, '\\$&');
}
