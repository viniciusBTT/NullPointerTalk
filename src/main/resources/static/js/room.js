import { Room, RoomEvent, Track, ConnectionQuality } from './vendor/livekit-client.esm.min.js';
import {
    getLocalMedia,
    stopStream,
    listAudioDevices,
    listVideoDevices,
    supportsAudioOutputSelection,
} from './media.js';
import { getScreenStream } from './screenshare.js';
import { showToast, showBanner } from './ui-feedback.js';

const USERNAME_KEY = 'npt.username';

const body = document.body;
const roomId = body.dataset.roomId;

const name = localStorage.getItem(USERNAME_KEY);
if (!name) {
    window.location.href = '/';
    throw new Error('Nome não definido, redirecionando para a home');
}

const identity = crypto.randomUUID();

const videoGrid = document.getElementById('video-grid');
const connectionStatus = document.getElementById('connection-status');
const roomLoading = document.getElementById('room-loading');
const micBtn = document.getElementById('toggle-mic');
const cameraBtn = document.getElementById('toggle-camera');
const screenBtn = document.getElementById('toggle-screen');
const leaveBtn = document.getElementById('leave-room');
const micSelect = document.getElementById('mic-select');
const speakerSelect = document.getElementById('speaker-select');
const cameraSelect = document.getElementById('camera-select');
const enableAudioBtn = document.getElementById('enable-audio-btn');
const controlButtons = [micBtn, cameraBtn, screenBtn];

let room;
let localStream; // captura combinada (1 só permissão) - mic vai publicado, câmera fica só "quente" até ligar
let micTrack;
let cameraTrack;
let screenStream = null;
let micEnabled = true;
let cameraEnabled = false; // câmera começa desligada - usuário liga manualmente ao entrar
let leaving = false;
let focusedTileId = null;

// Última track de vídeo (câmera OU tela) efetivamente exibida em cada tile - evita anexar
// duas tracks de vídeo simultâneas no mesmo <video> (só a primeira seria renderizada).
const attachedVideoTracks = new Map();

function setControlsEnabled(enabled) {
    controlButtons.forEach((btn) => {
        btn.disabled = !enabled;
    });
}

// Navegadores mobile (principalmente Chrome/Android) às vezes só autoplayam o <video>
// remoto silenciando o áudio internamente, sem rejeitar a Promise do play() - por isso
// o botão aparece de forma proativa ao chegar mídia remota, não só quando play() falha.
function tryPlay(video) {
    const playResult = video.play();
    if (playResult && typeof playResult.catch === 'function') {
        playResult.catch(() => {
            enableAudioBtn.classList.remove('hidden');
        });
    }
}

enableAudioBtn.addEventListener('click', () => {
    videoGrid.querySelectorAll('video').forEach((video) => tryPlay(video));
    enableAudioBtn.classList.add('hidden');
});

function ensureTile(tileId, label, { local = false } = {}) {
    let tile = document.getElementById(`tile-${tileId}`);
    if (tile) {
        tile.querySelector('.video-tile__name').textContent = label;
        return tile;
    }

    tile = document.createElement('div');
    tile.className = 'video-tile video-tile--no-video';
    tile.id = `tile-${tileId}`;
    tile.classList.toggle('video-tile--mirror', local);

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = local; // nunca reproduzir o próprio áudio de volta (eco)
    tile.appendChild(video);

    const placeholder = document.createElement('span');
    placeholder.className = 'video-tile__placeholder';
    tile.appendChild(placeholder);

    const nameTag = document.createElement('span');
    nameTag.className = 'video-tile__name';
    nameTag.textContent = label;
    tile.appendChild(nameTag);

    const badges = document.createElement('span');
    badges.className = 'video-tile__badges';
    badges.innerHTML =
        '<span class="badge badge--mic-off hidden" title="Microfone desligado">🎤🚫</span>' +
        '<span class="badge badge--camera-off hidden" title="Câmera desligada">📷🚫</span>';
    tile.appendChild(badges);

    const statusDot = document.createElement('span');
    statusDot.className = 'video-tile__status-dot';
    tile.appendChild(statusDot);

    tile.addEventListener('click', () => toggleFocusedTile(tileId));

    videoGrid.appendChild(tile);
    if (!local) {
        enableAudioBtn.classList.remove('hidden');
    }
    return tile;
}

function removeTile(tileId) {
    attachedVideoTracks.delete(tileId);
    document.getElementById(`tile-${tileId}`)?.remove();
    if (focusedTileId === tileId) {
        setFocusedTile(null);
    }
}

// Dar foco (fixar em destaque) numa transmissão/webcam - clique de novo pra voltar ao grid normal.
function setFocusedTile(tileId) {
    focusedTileId = tileId;
    videoGrid.classList.toggle('video-grid--focused', tileId !== null);
    videoGrid.querySelectorAll('.video-tile').forEach((tile) => {
        tile.classList.toggle('video-tile--focused', tile.id === `tile-${tileId}`);
    });
}

function toggleFocusedTile(tileId) {
    setFocusedTile(focusedTileId === tileId ? null : tileId);
}

function setTileBadges(tileId, { audioEnabled, videoEnabled }) {
    const tile = document.getElementById(`tile-${tileId}`);
    if (!tile) {
        return;
    }
    tile.querySelector('.badge--mic-off')?.classList.toggle('hidden', audioEnabled);
    tile.querySelector('.badge--camera-off')?.classList.toggle('hidden', videoEnabled);
}

const QUALITY_LABELS = {
    excellent: 'ok',
    good: 'ok',
    poor: 'instável',
    lost: 'falhou',
    unknown: 'conectando',
};

function setTileStatus(tileId, quality) {
    const tile = document.getElementById(`tile-${tileId}`);
    const dot = tile?.querySelector('.video-tile__status-dot');
    if (!dot) {
        return;
    }
    dot.classList.remove(
        'video-tile__status-dot--ok',
        'video-tile__status-dot--warn',
        'video-tile__status-dot--bad',
    );
    if (quality === ConnectionQuality.Excellent || quality === ConnectionQuality.Good) {
        dot.classList.add('video-tile__status-dot--ok');
    } else if (quality === ConnectionQuality.Lost) {
        dot.classList.add('video-tile__status-dot--bad');
    } else {
        dot.classList.add('video-tile__status-dot--warn');
    }
    dot.title = `Conexão: ${QUALITY_LABELS[quality] ?? quality}`;
}

/** Câmera OU tela compartilhada, nunca as duas - um <video> só renderiza uma track por vez. */
function pickPrimaryVideoTrack(participant) {
    const screenPub = participant.getTrackPublication(Track.Source.ScreenShare);
    const cameraPub = participant.getTrackPublication(Track.Source.Camera);
    return screenPub?.track ?? cameraPub?.track ?? null;
}

function refreshParticipantVideo(participant) {
    const tileId = participant.identity;
    const tile = document.getElementById(`tile-${tileId}`);
    if (!tile) {
        return;
    }
    const video = tile.querySelector('video');
    const primary = pickPrimaryVideoTrack(participant);
    const previous = attachedVideoTracks.get(tileId) ?? null;
    if (previous === primary) {
        return;
    }
    if (previous) {
        previous.detach(video);
    }
    if (primary) {
        primary.attach(video);
        tryPlay(video);
    }
    tile.classList.toggle('video-tile--no-video', !primary);
    attachedVideoTracks.set(tileId, primary);
}

function refreshParticipantBadges(participant) {
    const micPub = participant.getTrackPublication(Track.Source.Microphone);
    const camPub = participant.getTrackPublication(Track.Source.Camera);
    setTileBadges(participant.identity, {
        audioEnabled: !!micPub && !micPub.isMuted,
        videoEnabled: !!camPub && !camPub.isMuted,
    });
}

function displayNameFor(participant) {
    if (participant.isLocal) {
        return `${name} (você)`;
    }
    return participant.name || 'Participante';
}

function handleTrackAdded(track, publication, participant) {
    ensureTile(participant.identity, displayNameFor(participant), { local: participant.isLocal });
    if (track.kind === Track.Kind.Audio) {
        const tile = document.getElementById(`tile-${participant.identity}`);
        const video = tile?.querySelector('video');
        if (video) {
            track.attach(video);
            tryPlay(video);
        }
    } else {
        refreshParticipantVideo(participant);
    }
    refreshParticipantBadges(participant);
}

function handleTrackRemoved(track, publication, participant) {
    const tile = document.getElementById(`tile-${participant.identity}`);
    const video = tile?.querySelector('video');
    if (video) {
        track.detach(video);
    }
    if (track.kind === Track.Kind.Video) {
        attachedVideoTracks.delete(participant.identity);
        refreshParticipantVideo(participant);
    }
    refreshParticipantBadges(participant);
}

function wireRoomEvents() {
    room.on(RoomEvent.TrackSubscribed, handleTrackAdded);
    room.on(RoomEvent.TrackUnsubscribed, handleTrackRemoved);
    room.on(RoomEvent.LocalTrackPublished, (publication, participant) =>
        handleTrackAdded(publication.track, publication, participant));
    room.on(RoomEvent.LocalTrackUnpublished, (publication, participant) =>
        handleTrackRemoved(publication.track, publication, participant));

    room.on(RoomEvent.TrackMuted, (publication, participant) => refreshParticipantBadges(participant));
    room.on(RoomEvent.TrackUnmuted, (publication, participant) => refreshParticipantBadges(participant));

    room.on(RoomEvent.ParticipantConnected, (participant) => {
        showToast(`${participant.name || 'Alguém'} entrou na sala`);
    });
    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        showToast(`${participant.name || 'Alguém'} saiu da sala`);
        removeTile(participant.identity);
    });

    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const speakingIds = new Set(speakers.map((participant) => participant.identity));
        videoGrid.querySelectorAll('.video-tile').forEach((tile) => {
            const tileId = tile.id.slice('tile-'.length);
            tile.classList.toggle('video-tile--speaking', speakingIds.has(tileId));
        });
    });

    room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
        setTileStatus((participant ?? room.localParticipant).identity, quality);
    });

    room.on(RoomEvent.Reconnecting, () => {
        connectionStatus.textContent = 'conexão: reconectando…';
    });
    room.on(RoomEvent.Reconnected, () => {
        connectionStatus.textContent = 'conexão: conectado';
    });
    room.on(RoomEvent.Disconnected, () => {
        if (leaving) {
            return;
        }
        connectionStatus.textContent = 'conexão: perdida';
        showBanner('Conexão com o servidor de mídia perdida.', {
            dismissible: false,
            actionLabel: 'Recarregar página',
            onAction: () => window.location.reload(),
        });
    });
}

async function fetchAccessToken() {
    const params = new URLSearchParams({ identity, name });
    const response = await fetch(`/room/${roomId}/token?${params}`);
    if (!response.ok) {
        throw new Error('Falha ao obter token de acesso da sala');
    }
    return response.json();
}

async function init() {
    roomLoading?.classList.remove('hidden');
    setControlsEnabled(false);

    let credentials;
    try {
        credentials = await fetchAccessToken();
        localStream = await getLocalMedia();
    } catch (error) {
        roomLoading?.classList.add('hidden');
        console.error(error);
        showBanner(error.message, {
            dismissible: false,
            actionLabel: 'Tentar novamente',
            onAction: () => window.location.reload(),
        });
        return;
    }

    micTrack = localStream.getAudioTracks()[0] ?? null;
    cameraTrack = localStream.getVideoTracks()[0] ?? null;

    room = new Room({ adaptiveStream: true, dynacast: true });
    wireRoomEvents();

    try {
        await room.connect(credentials.url, credentials.token);
    } catch (error) {
        roomLoading?.classList.add('hidden');
        console.error(error);
        showBanner('Não foi possível conectar à sala.', {
            dismissible: false,
            actionLabel: 'Tentar novamente',
            onAction: () => window.location.reload(),
        });
        return;
    }

    // Cria o próprio tile já na entrada (mesmo sem nenhuma track publicada ainda) -
    // publishTrack do microfone dispara LocalTrackPublished logo em seguida e preenche o resto.
    ensureTile(identity, `${name} (você)`, { local: true });
    if (micTrack) {
        await room.localParticipant.publishTrack(micTrack, { source: Track.Source.Microphone, name: 'microphone' });
    }
    // A câmera fica capturada (permissão já concedida, luz acesa) mas sem publicar - só manda
    // vídeo pros outros quando o usuário liga manualmente, e sem gastar banda enquanto isso.
    cameraBtn.classList.toggle('is-off', !cameraEnabled);

    roomLoading?.classList.add('hidden');
    setControlsEnabled(true);
    connectionStatus.textContent = 'conexão: conectado';

    await populateDeviceSelectors();
    navigator.mediaDevices.addEventListener('devicechange', populateDeviceSelectors);
}

function fillSelect(select, devices, selectedDeviceId) {
    const previousValue = select.value;
    select.innerHTML = '';
    devices.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `Dispositivo ${index + 1}`;
        select.appendChild(option);
    });
    const toSelect = selectedDeviceId ?? previousValue;
    if (toSelect && devices.some((d) => d.deviceId === toSelect)) {
        select.value = toSelect;
    }
}

async function populateDeviceSelectors() {
    const { inputs, outputs } = await listAudioDevices();
    const videoInputs = await listVideoDevices();
    fillSelect(micSelect, inputs, micTrack?.getSettings().deviceId);
    fillSelect(cameraSelect, videoInputs, cameraTrack?.getSettings().deviceId);

    // A maioria dos navegadores mobile (Chrome/Safari Android e iOS) não implementa
    // HTMLMediaElement.setSinkId - nesse caso é melhor esconder o seletor do que mostrar
    // um dropdown desabilitado confuso.
    if (supportsAudioOutputSelection()) {
        fillSelect(speakerSelect, outputs);
    } else {
        speakerSelect.closest('.device-select').classList.add('hidden');
    }
}

micSelect.addEventListener('change', async () => {
    const deviceId = micSelect.value;
    if (!deviceId || !room) {
        return;
    }
    try {
        await room.switchActiveDevice('audioinput', deviceId);
        micTrack = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack
            ?? micTrack;
    } catch (error) {
        console.error('Falha ao trocar de microfone', error);
        showToast(error.message ?? 'Falha ao trocar de microfone', { type: 'error' });
    }
});

cameraSelect.addEventListener('change', async () => {
    const deviceId = cameraSelect.value;
    if (!deviceId || !room) {
        return;
    }
    try {
        await room.switchActiveDevice('videoinput', deviceId);
        cameraTrack = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track?.mediaStreamTrack
            ?? cameraTrack;
    } catch (error) {
        console.error('Falha ao trocar de câmera', error);
        showToast(error.message ?? 'Falha ao trocar de câmera', { type: 'error' });
    }
});

speakerSelect.addEventListener('change', async () => {
    try {
        await room.switchActiveDevice('audiooutput', speakerSelect.value);
    } catch (error) {
        console.error('Falha ao trocar saída de áudio', error);
    }
});

micBtn.addEventListener('click', async () => {
    const publication = room?.localParticipant.getTrackPublication(Track.Source.Microphone);
    if (!publication) {
        return;
    }
    micEnabled = !micEnabled;
    micBtn.classList.toggle('is-off', !micEnabled);
    await (micEnabled ? publication.unmute() : publication.mute());
});

cameraBtn.addEventListener('click', async () => {
    if (!room || !cameraTrack) {
        return;
    }
    cameraEnabled = !cameraEnabled;
    cameraBtn.classList.toggle('is-off', !cameraEnabled);
    try {
        if (cameraEnabled) {
            await room.localParticipant.publishTrack(cameraTrack, { source: Track.Source.Camera, name: 'camera' });
        } else {
            await room.localParticipant.unpublishTrack(cameraTrack);
        }
    } catch (error) {
        console.error('Falha ao alternar câmera', error);
        showToast('Falha ao alternar câmera', { type: 'error' });
        cameraEnabled = !cameraEnabled;
        cameraBtn.classList.toggle('is-off', !cameraEnabled);
    }
});

screenBtn.addEventListener('click', async () => {
    if (screenStream) {
        await stopScreenShare();
        return;
    }
    try {
        screenStream = await getScreenStream();
    } catch {
        return; // usuário cancelou o seletor de tela
    }

    const screenTrack = screenStream.getVideoTracks()[0];
    await room.localParticipant.publishTrack(screenTrack, { source: Track.Source.ScreenShare, name: 'screen' });

    // Nem todo compartilhamento vem com áudio (depende do SO/navegador e se o usuário marcou
    // a opção no seletor nativo). Publicado como track separada - continua tocando junto com
    // o microfone (que segue publicado normalmente), sem precisar mixar os dois manualmente.
    const systemAudioTrack = screenStream.getAudioTracks()[0];
    if (systemAudioTrack) {
        await room.localParticipant.publishTrack(systemAudioTrack, {
            source: Track.Source.ScreenShareAudio,
            name: 'screen_audio',
        });
    }

    screenTrack.addEventListener('ended', () => stopScreenShare());
    screenBtn.classList.add('is-active');
    cameraSelect.disabled = true;
});

async function stopScreenShare() {
    if (!screenStream) {
        return;
    }
    const screenTrack = screenStream.getVideoTracks()[0];
    const systemAudioTrack = screenStream.getAudioTracks()[0];
    if (screenTrack) {
        await room.localParticipant.unpublishTrack(screenTrack);
    }
    if (systemAudioTrack) {
        await room.localParticipant.unpublishTrack(systemAudioTrack);
    }
    stopStream(screenStream);
    screenStream = null;
    screenBtn.classList.remove('is-active');
    cameraSelect.disabled = false;
}

leaveBtn.addEventListener('click', () => {
    leaving = true;
    room?.disconnect();
    if (screenStream) stopStream(screenStream);
    if (localStream) stopStream(localStream);
    // Pequeno atraso antes de navegar: em algumas combinações de SO/driver a câmera não é
    // liberada instantaneamente após track.stop(), e uma navegação imediata pode fazer a
    // próxima getUserMedia (ao entrar na próxima sala) falhar por "dispositivo não encontrado".
    setTimeout(() => {
        window.location.href = '/';
    }, 150);
});

window.addEventListener('beforeunload', () => {
    leaving = true;
    room?.disconnect();
    if (screenStream) stopStream(screenStream);
    if (localStream) stopStream(localStream);
});

init();
