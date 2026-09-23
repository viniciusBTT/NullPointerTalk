/**
 * O chat em texto: lista de mensagens agrupadas por autor + composer.
 *
 * Agrupamento estilo Discord: mensagens seguidas da mesma pessoa dentro de 5 minutos
 * viram um único bloco, com o cabeçalho (avatar, nome, hora) só na primeira. A hora das
 * continuações aparece no hover.
 */

import { el, clear } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { avatarElement } from '../lib/avatar.js';
import { showToast } from '../lib/ui-feedback.js';

const GROUP_WINDOW_MS = 5 * 60 * 1000;
/** Margem em px pra considerar que a pessoa já está no fim da lista. */
const AT_BOTTOM_SLACK = 40;

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function initChat({
    messagesEl, formEl, inputEl, jumpEl, chatStore, onSend,
    attachBtn, imageInputEl, attachmentEl, attachmentPreviewEl, attachmentNameEl, attachmentRemoveBtn,
}) {
    let roomId = null;
    /** Última mensagem renderizada, pra decidir agrupamento sem re-varrer o DOM. */
    let previous = null;
    /** Arquivo escolhido mas ainda não enviado - só existe entre o "escolher imagem" e o
     * submit do form (que faz o upload de fato). */
    let pendingImage = null;

    attachBtn.addEventListener('click', () => imageInputEl.click());

    imageInputEl.addEventListener('change', () => {
        const file = imageInputEl.files[0];
        imageInputEl.value = ''; // permite escolher o mesmo arquivo de novo depois de remover
        if (!file) {
            return;
        }
        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            showToast('Formato de imagem não suportado.', { type: 'error' });
            return;
        }
        if (file.size > MAX_IMAGE_BYTES) {
            showToast('Imagem maior que 5MB.', { type: 'error' });
            return;
        }
        setPendingImage(file);
    });

    attachmentRemoveBtn.addEventListener('click', () => setPendingImage(null));

    function setPendingImage(file) {
        if (pendingImage) {
            URL.revokeObjectURL(attachmentPreviewEl.src);
        }
        pendingImage = file;
        attachmentEl.classList.toggle('hidden', !file);
        if (file) {
            attachmentPreviewEl.src = URL.createObjectURL(file);
            attachmentNameEl.textContent = file.name;
        }
    }

    formEl.addEventListener('submit', async (event) => {
        event.preventDefault();
        const text = inputEl.value.trim();
        const image = pendingImage;
        if (!text && !image) {
            return;
        }
        // Limpa otimista e deixa o eco do próprio LiveKit renderizar - remetente e
        // destinatário passam pelo mesmo caminho, então não há risco de divergir.
        inputEl.value = '';
        setPendingImage(null);
        try {
            const imageUrl = image ? await uploadImage(image) : undefined;
            await onSend({ text, imageUrl });
        } catch (error) {
            // devolve texto e imagem pra não perder o que a pessoa preparou
            inputEl.value = text;
            setPendingImage(image);
            showToast(error.message ?? 'Falha ao enviar a mensagem.', { type: 'error' });
        }
    });

    async function uploadImage(file) {
        const body = new FormData();
        body.append('file', file);
        const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/images`, { method: 'POST', body });
        if (!response.ok) {
            throw new Error('Falha ao enviar a imagem.');
        }
        const { url } = await response.json();
        return url;
    }

    jumpEl.addEventListener('click', () => scrollToBottom());

    messagesEl.addEventListener('scroll', () => {
        if (isAtBottom()) {
            jumpEl.classList.add('hidden');
        }
    });

    function isAtBottom() {
        return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < AT_BOTTOM_SLACK;
    }

    function scrollToBottom() {
        messagesEl.scrollTop = messagesEl.scrollHeight;
        jumpEl.classList.add('hidden');
    }

    function renderChannel(nextRoomId) {
        roomId = nextRoomId;
        previous = null;
        clear(messagesEl);

        if (!roomId) {
            messagesEl.appendChild(emptyState('Escolha um canal pra começar.'));
            return;
        }

        const history = chatStore.messages(roomId);
        if (history.length === 0) {
            messagesEl.appendChild(emptyState('Nenhuma mensagem por aqui ainda.'));
        }
        history.forEach((message) => appendMessage(message, { keepScroll: false }));
        scrollToBottom();
    }

    function appendMessage(message, { keepScroll = true } = {}) {
        const wasAtBottom = keepScroll ? isAtBottom() : true;
        messagesEl.querySelector('.chat__empty')?.remove();

        const date = new Date(message.timestamp);
        if (!previous || new Date(previous.timestamp).toDateString() !== date.toDateString()) {
            messagesEl.appendChild(daySeparator(date));
            // Zerar aqui garante que uma continuação nunca atravesse a meia-noite.
            previous = null;
        }

        // stableId (não identity): a mensagem persistida não carrega mais o nonce de aba
        // do LiveKit, só o id estável do remetente - é essa a granularidade certa pra
        // "mesma pessoa" aqui.
        const continues = previous
            && previous.stableId === message.stableId
            && message.timestamp - previous.timestamp < GROUP_WINDOW_MS;

        messagesEl.appendChild(continues ? continuationRow(message, date) : blockRow(message, date));
        previous = message;

        if (wasAtBottom) {
            scrollToBottom();
        } else {
            // Não arrasta a lista embaixo dos pés de quem está lendo o histórico.
            jumpEl.classList.remove('hidden');
        }
    }

    function setEnabled(enabled, placeholder) {
        inputEl.disabled = !enabled;
        formEl.querySelector('button[type="submit"]').disabled = !enabled;
        attachBtn.disabled = !enabled;
        inputEl.placeholder = placeholder;
        if (!enabled) {
            setPendingImage(null);
        }
    }

    function focus() {
        inputEl.focus();
    }

    return { renderChannel, appendMessage, setEnabled, focus, get roomId() { return roomId; } };
}

function blockRow(message, date) {
    return el('div', { class: ['message', message.isLocal && 'message--own'] },
        el('div', { class: 'message__gutter' }, avatarElement({
            name: message.name,
            seed: message.stableId,
            size: 40,
        })),
        el('div', { class: 'message__content' },
            el('div', { class: 'message__meta' },
                el('span', { class: 'message__author', text: message.name }),
                el('time', { class: 'message__time', text: formatTime(date), dateTime: date.toISOString() })),
            body(message)));
}

function continuationRow(message, date) {
    return el('div', { class: ['message', 'message--continuation', message.isLocal && 'message--own'] },
        el('div', { class: 'message__gutter' },
            el('time', {
                class: 'message__time message__time--hover',
                text: formatTime(date),
                dateTime: date.toISOString(),
            })),
        el('div', { class: 'message__content' }, body(message)));
}

/** textContent, jamais innerHTML: o conteúdo vem de outro participante. */
function body(message) {
    return el('div', { class: 'message__body' },
        message.imageUrl ? el('img', {
            class: 'message__image',
            src: message.imageUrl,
            alt: 'Imagem enviada no chat',
            loading: 'lazy',
            onclick: () => window.open(message.imageUrl, '_blank', 'noopener'),
        }) : null,
        message.text ? el('span', { text: message.text }) : null);
}

function daySeparator(date) {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86_400_000);
    let label;
    if (date.toDateString() === today.toDateString()) {
        label = 'Hoje';
    } else if (date.toDateString() === yesterday.toDateString()) {
        label = 'Ontem';
    } else {
        label = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    }
    return el('div', { class: 'day-separator' }, el('span', { text: label }));
}

function emptyState(text) {
    return el('div', { class: 'chat__empty' },
        icon('chat', { size: 28 }),
        el('p', { text }));
}

function formatTime(date) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
