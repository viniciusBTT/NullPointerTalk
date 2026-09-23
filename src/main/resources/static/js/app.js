/**
 * Entry point do shell. Constrói os módulos, liga os eventos e boota.
 *
 * A direção do controle é sempre a mesma: a UI chama métodos em session/audioSink/chatStore,
 * e eles respondem por evento. Nenhum módulo de UI lê o DOM de outro, e só o
 * core/voice-session.js conhece o LiveKit.
 */

import { LocalMedia } from './core/local-media.js';
import { VoiceSession } from './core/voice-session.js';
import { AudioSink } from './core/audio-sink.js';
import { ChatStore } from './core/chat-store.js';
import { ChatSession } from './core/chat-session.js';
import { Presence } from './core/presence.js';
import * as router from './core/router.js';
import { getIdentity, getStableUserId, getDisplayName, setDisplayName } from './core/identity.js';

import { initSidebar } from './ui/sidebar.js';
import { initVoicePanel } from './ui/voice-panel.js';
import { initStage } from './ui/stage.js';
import { initChat } from './ui/chat.js';
import { initContentLayout } from './ui/content-layout.js';
import { initSettingsModal } from './ui/settings-modal.js';
import { initParticipantPopover } from './ui/participant-popover.js';
import { initNameGate } from './ui/name-gate.js';
import { initRoomAdmin } from './ui/room-admin.js';
import { initIconPicker } from './ui/icon-picker.js';

import { showToast, showBanner } from './lib/ui-feedback.js';
import { setIcon } from './lib/icons.js';
import * as sounds from './lib/sounds.js';

const $ = (id) => document.getElementById(id);

const shell = $('app-shell');
const rooms = JSON.parse(shell.dataset.rooms);
const roomsById = new Map(rooms.map((room) => [room.id, room]));

const nameGate = initNameGate({
    root: $('name-gate'),
    form: $('name-form'),
    input: $('name-input'),
    onSubmit: (name) => {
        if (booted) {
            // Renomear com a aplicação já rodando: propaga sem derrubar a conexão.
            setDisplayName(name);
            session.setDisplayName(name);
            voicePanel.setName(name);
        } else {
            boot(name);
        }
    },
});

let booted = false;
let session;
let voicePanel;

const initialName = nameGate.ensureName();
if (initialName) {
    boot(initialName);
}

function boot(displayName) {
    booted = true;

    const localMedia = new LocalMedia();
    session = new VoiceSession({ localMedia, identity: getIdentity(), displayName });
    const audioSink = new AudioSink({ container: $('audio-sink') });
    const chatStore = new ChatStore();
    const chatSession = new ChatSession({ roomIds: rooms.map((room) => room.id) });
    chatSession.connect();
    const presence = new Presence();

    const popover = initParticipantPopover({ root: $('participant-popover'), audioSink });
    let lastParticipants = [];
    const openParticipant = (identity, anchor) => {
        popover.open(lastParticipants.find((p) => p.identity === identity), anchor);
    };

    const sidebar = initSidebar({
        listEl: $('channel-list'),
        noticeEl: $('presence-notice'),
        onParticipantClick: openParticipant,
    });
    // O <ul> nasce vazio no HTML (ver shell.html) - popula a partir do mesmo catálogo que
    // já veio embutido na página, e o listener de 'roomcatalog' mais abaixo mantém isso
    // sincronizado depois (criação/edição/exclusão, inclusive vindas de outra aba).
    rooms.forEach((room) => sidebar.addChannel(room));

    const iconPicker = initIconPicker({
        root: $('icon-picker-modal'),
        gridEl: $('icon-picker-grid'),
        closeButtons: [...document.querySelectorAll('[data-close="icon-picker"]')],
        onSelect: (glyph) => {
            $('room-form-icon').value = glyph;
        },
    });

    initRoomAdmin({
        listEl: $('channel-list'),
        addButtonEl: $('btn-add-room'),
        modalEl: $('room-form-modal'),
        formEl: $('room-form'),
        titleEl: $('room-form-title'),
        idInputEl: $('room-form-id'),
        nameInputEl: $('room-form-name'),
        iconInputEl: $('room-form-icon'),
        iconTriggerEl: $('room-form-icon-trigger'),
        errorEl: $('room-form-error'),
        submitBtnEl: $('room-form-submit'),
        closeButtons: [...document.querySelectorAll('[data-close="room-form"]')],
        roomsById,
        openIconPicker: iconPicker.open,
        onError: (message) => showToast(message, { type: 'error' }),
    });

    const stage = initStage({ root: $('stage'), onParticipantClick: openParticipant });

    const chat = initChat({
        messagesEl: $('chat-messages'),
        formEl: $('chat-form'),
        inputEl: $('chat-input'),
        jumpEl: $('chat-jump'),
        attachBtn: $('btn-chat-attach'),
        imageInputEl: $('chat-image-input'),
        attachmentEl: $('composer-attachment'),
        attachmentPreviewEl: $('composer-attachment-preview'),
        attachmentNameEl: $('composer-attachment-name'),
        attachmentRemoveBtn: $('btn-attachment-remove'),
        chatStore,
        // getDisplayName() e não a variável displayName capturada no boot(): um rename
        // (btn-rename) só chama setDisplayName/session.setDisplayName/voicePanel.setName,
        // nunca reatribui essa variável - lendo direto do pref o nome enviado nunca fica
        // desatualizado depois de uma troca de nome.
        onSend: ({ text, imageUrl }) => chatSession.send(session.roomId, {
            text,
            imageUrl,
            name: getDisplayName() ?? displayName,
            stableId: getStableUserId(),
        }),
    });

    const contentLayout = initContentLayout({
        contentEl: $('content'),
        chatEl: $('chat-panel'),
        resizerEl: $('content-resizer'),
        collapseBtn: $('btn-chat-collapse'),
        stage,
    });

    const settings = initSettingsModal({
        root: $('settings-modal'),
        micSelect: $('mic-select'),
        cameraSelect: $('camera-select'),
        speakerSelect: $('speaker-select'),
        speakerRow: $('speaker-row'),
        soundsToggle: $('sounds-toggle'),
        closeButtons: [...document.querySelectorAll('[data-close="settings"]')],
        localMedia,
        session,
        onError: (message) => showToast(message, { type: 'error' }),
    });

    voicePanel = initVoicePanel({
        session,
        audioSink,
        identityEl: $('voice-identity'),
        nameEl: $('voice-name'),
        statusEl: $('voice-status'),
        channelEl: $('voice-channel'),
        micBtn: $('btn-mic'),
        deafenBtn: $('btn-deafen'),
        settingsBtn: $('btn-settings'),
        leaveBtn: $('btn-leave'),
        onOpenSettings: () => settings.open(),
        displayName,
        stableId: getStableUserId(),
    });
    voicePanel.setName = (name) => {
        $('voice-name').textContent = name;
    };

    $('btn-rename').addEventListener('click', () => nameGate.show({ current: getDisplayName() }));

    // ---------------------------------------------------------------- controles da chamada

    const cameraBtn = $('btn-camera');
    const screenBtn = $('btn-screen');
    const listenBtn = $('btn-listen');
    const hangupBtn = $('btn-hangup');

    cameraBtn.addEventListener('click', () => session.setCameraEnabled(!session.localState.camera));
    screenBtn.addEventListener('click', () => session.setScreenShareEnabled(!session.localState.screen));
    listenBtn.addEventListener('click', () => session.setListenAlongEnabled(!session.localState.listenAlong));
    hangupBtn.addEventListener('click', () => session.leave());

    session.addEventListener('localstate', (event) => {
        const desired = event.detail;
        voicePanel.setLocalState(desired);
        cameraBtn.classList.toggle('is-active', desired.camera);
        setIcon(cameraBtn, desired.camera ? 'camera' : 'camera-off');
        screenBtn.classList.toggle('is-active', desired.screen);
        setIcon(screenBtn, desired.screen ? 'screen-share' : 'screen-share-off');
        listenBtn.classList.toggle('is-active', desired.listenAlong);
    });

    // ---------------------------------------------------------------- estado da sessão

    let reconnectBanner = null;

    session.addEventListener('statechange', (event) => {
        const { state } = event.detail;
        const roomId = session.roomId;
        const room = roomId ? roomsById.get(roomId) : null;

        voicePanel.setState(state, room?.name);
        sidebar.setConnecting(state === 'joining' ? roomId : null);
        sidebar.setActiveChannel(roomId);
        setHeader(room);

        const connected = state === 'connected';
        $('call-controls').classList.toggle('hidden', state === 'idle');
        [cameraBtn, screenBtn, listenBtn].forEach((button) => {
            button.disabled = !connected;
        });
        chat.setEnabled(connected, connected
            ? `Mensagem em ${room?.name ?? ''}`
            : 'Entre num canal para conversar');

        const status = $('conn-status');
        status.dataset.state = state;
        status.textContent = state === 'reconnecting' ? 'reconectando…' : '';
    });

    session.addEventListener('joined', async (event) => {
        const { roomId } = event.detail;
        reconnectBanner?.();
        reconnectBanner = null;
        // Antes de renderizar: o histórico persistido (últimas 250 msgs) só existe no
        // backend agora - sem isso a pessoa veria só o que chegar dali pra frente, como
        // no chat efêmero de antes.
        await chatStore.ensureHistory(roomId);
        chat.renderChannel(roomId);
        syncUnreadBadge(roomId);
        chatStore.markRead(roomId);
        sidebar.setUnread(roomId, 0);
        presence.refresh();
        // Armar só AQUI: ParticipantConnected dispara pra cada pessoa que já estava na
        // sala no momento do connect, então armar antes tocaria um beep por participante.
        sounds.setArmed(true);
    });

    session.addEventListener('left', (event) => {
        sounds.setArmed(false);
        stage.clear();
        audioSink.clear();
        lastParticipants = [];
        sidebar.setPresence(presence.byRoom, false);
        presence.setLive(null, []);
        presence.refresh();
        if (event.detail.reason === 'user') {
            router.navigate(null);
            chat.renderChannel(null);
            syncUnreadBadge(null);
            setHeader(null);
        }
    });

    session.addEventListener('participants', (event) => {
        const { roomId, list } = event.detail;
        lastParticipants = list;
        stage.render({ participants: list, videoPubs: session.videoPubs });
        contentLayout.refresh();
        presence.setLive(roomId, list);
    });

    session.addEventListener('tracks', (event) => {
        const { video, audio } = event.detail;
        stage.render({ participants: lastParticipants, videoPubs: video });
        contentLayout.refresh();
        audioSink.sync(audio);
    });

    session.addEventListener('speakers', (event) => {
        stage.setSpeaking(event.detail.identities);
        sidebar.setSpeaking(event.detail.identities);
    });

    session.addEventListener('participantjoined', (event) => {
        showToast(`${event.detail.name} entrou no canal`);
        sounds.playJoin();
    });

    session.addEventListener('participantleft', (event) => {
        showToast(`${event.detail.name} saiu do canal`);
        sounds.playLeave();
        popover.closeIf(event.detail.identity);
    });

    // Chat não depende mais de estar com a voz conectada na sala: ChatSession assina o
    // tópico de TODAS as salas do catálogo já no connect(), então uma mensagem em canal
    // onde a pessoa nem está com a voz ligada também chega aqui - é isso que permite
    // badge de não-lida entre canais.
    chatSession.addEventListener('message', (event) => {
        const { roomId, message } = event.detail;
        const stored = chatStore.append(roomId, message);
        if (!stored) {
            return; // dedup: mensagem que já tínhamos (ex: history fetch e live se cruzando)
        }
        const isActive = chat.roomId === roomId;
        if (isActive) {
            chat.appendMessage(stored);
        }
        if (stored.isLocal) {
            return; // a própria mensagem nunca conta como não-lida, nem em outra aba
        }
        if (!isActive || document.hidden) {
            chatStore.markUnread(roomId);
        } else {
            chatStore.markRead(roomId, stored.timestamp);
        }
    });

    // O guard current() em voice-session.js só deixa 'kicked' disparar pra quem ainda
    // está de fato conectado àquela sala (this.#room === room da geração atual) - então,
    // ao contrário de 'left'/'error', não precisa reconferir qual sala está ativa aqui.
    session.addEventListener('kicked', () => {
        showToast('Esta sala foi removida.');
        reconnectBanner?.();
        reconnectBanner = null;
        router.navigate(null);
        chat.renderChannel(null);
        syncUnreadBadge(null);
        setHeader(null);
    });

    chatSession.addEventListener('roomcatalog', (event) => {
        const { type, room } = event.detail;
        if (type === 'created') {
            roomsById.set(room.id, room);
            sidebar.addChannel(room);
            chatSession.subscribeRoom(room.id);
        } else if (type === 'updated') {
            roomsById.set(room.id, room);
            sidebar.renameChannel(room.id, room);
            if (session.roomId === room.id) {
                setHeader(room);
            }
        } else if (type === 'deleted') {
            roomsById.delete(room.id);
            sidebar.removeChannel(room.id);
            chatSession.unsubscribeRoom(room.id);
        }
    });

    chatStore.addEventListener('unread', (event) => {
        sidebar.setUnread(event.detail.roomId, event.detail.count);
        if (event.detail.roomId === chat.roomId) {
            syncUnreadBadge(chat.roomId);
        }
    });

    // Volta a marcar como lido quando a aba reaparece com o canal aberto.
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && session.roomId) {
            chatStore.markRead(session.roomId);
        }
    });

    const unlockBtn = $('unlock-audio');
    session.addEventListener('audioplayback', (event) => {
        unlockBtn.classList.toggle('hidden', event.detail.canPlayback);
    });
    unlockBtn.addEventListener('click', () => session.unlockAudio());

    session.addEventListener('error', (event) => {
        const { scope, message, reconnectRoomId } = event.detail;
        if (scope === 'connect' && reconnectRoomId) {
            // Reconectar chamando join(), e NÃO location.reload(): recarregar é
            // exatamente o que o shell persistente existe pra evitar.
            reconnectBanner?.();
            reconnectBanner = showBanner(message, {
                dismissible: false,
                actionLabel: 'Reconectar',
                onAction: () => {
                    reconnectBanner?.();
                    reconnectBanner = null;
                    session.join(reconnectRoomId);
                },
            });
            return;
        }
        showToast(message, { type: 'error' });
    });

    // ---------------------------------------------------------------- presença

    presence.addEventListener('presence', (event) => {
        sidebar.setPresence(event.detail.byRoom, event.detail.degraded);
        sidebar.setSpeaking([...document.querySelectorAll('.member--speaking')].map((n) => n.dataset.identity));
    });
    presence.start();

    // ---------------------------------------------------------------- não-lidas no boot

    // Um fetch pequeno por sala (esperado ser poucas, é um app de laboratório) - reusa o
    // mesmo endpoint de histórico com "after", em vez de um endpoint só pra contar.
    (async function loadInitialUnread() {
        for (const room of rooms) {
            try {
                const since = chatStore.lastRead(room.id);
                const response = await fetch(`/api/rooms/${encodeURIComponent(room.id)}/messages?after=${since}`);
                if (!response.ok) {
                    continue;
                }
                const unread = await response.json();
                // Se a sala já virou a ativa enquanto o fetch estava em voo, o handler de
                // 'joined' já cuidou de marcar como lida - semear aqui por cima seria voltar
                // atrás numa contagem que já está certa.
                if (room.id !== chat.roomId) {
                    chatStore.seedUnread(room.id, unread.length);
                }
            } catch {
                // best-effort: uma sala sem contagem inicial não é motivo pra travar o boot
            }
        }
    })();

    // ---------------------------------------------------------------- navegação

    const enterChannel = (channelId) => {
        // Primeiro clique é um gesto do usuário: é a janela pra destravar o AudioContext
        // dos beeps, que nasce suspenso quando criado sem interação.
        sounds.primeAudio();
        router.navigate(channelId);
        session.join(channelId);
    };

    router.bindLinks($('channel-list'), (anchor) => anchor.closest('.channel')?.dataset.roomId ?? null, enterChannel);

    router.start((channelId, { initial }) => {
        if (channelId && roomsById.has(channelId)) {
            session.join(channelId);
        } else if (!initial) {
            // Voltar pra "/" pelo botão do navegador tem que SAIR da voz de verdade,
            // não só repintar a tela.
            session.leave();
        } else {
            chat.renderChannel(null);
            syncUnreadBadge(null);
            setHeader(null);
        }
    });

    // Sidebar em gaveta no mobile
    const sidebarEl = $('sidebar');
    $('btn-menu').addEventListener('click', () => sidebarEl.classList.toggle('sidebar--open'));
    $('sidebar-backdrop').addEventListener('click', () => sidebarEl.classList.remove('sidebar--open'));
    $('channel-list').addEventListener('click', () => sidebarEl.classList.remove('sidebar--open'));

    // pagehide e não beforeunload: o SDK já desconecta sozinho (disconnectOnPageLeave é
    // true por padrão), isto é só pra apagar a luz da câmera — e beforeunload
    // desqualificaria a página do cache de voltar/avançar do navegador.
    window.addEventListener('pagehide', () => localMedia.release());

    function setHeader(room) {
        $('header-icon').textContent = room?.icon ?? '';
        $('header-title').textContent = room?.name ?? 'NullPointerTalk';
        document.title = room ? `${room.name} · NullPointerTalk` : 'NullPointerTalk';
    }

    /** Sincroniza o badge de não-lidas do cabeçalho do chat com a sala ativa - chamado
     * toda vez que ela muda, e não só quando um evento 'unread' dispara (a sala nova
     * pode já nascer com 0 não-lidas, e o badge não pode ficar preso no valor da sala
     * anterior). */
    function syncUnreadBadge(roomId) {
        const badge = $('chat-header-unread');
        const count = roomId ? chatStore.unread(roomId) : 0;
        badge.textContent = count > 0 ? String(count) : '';
        badge.classList.toggle('hidden', count === 0);
    }
}
