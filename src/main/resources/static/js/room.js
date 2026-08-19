import { SignalingSocket } from './signaling.js';
import {
    getLocalMedia,
    toggleAudioTrack,
    toggleVideoTrack,
    stopStream,
    listAudioDevices,
    listVideoDevices,
    getAudioTrackForDevice,
    getVideoTrackForDevice,
    supportsAudioOutputSelection,
} from './media.js';
import { getScreenStream } from './screenshare.js';
import { PeerMesh } from './peers.js';
import { showToast, showBanner } from './ui-feedback.js';
import { audioActivityMonitor } from './audio-level.js';
import { mixAudioTracks } from './audio-mixer.js';

const USERNAME_KEY = 'npt.username';

const body = document.body;
const roomId = body.dataset.roomId;
const iceServers = JSON.parse(body.dataset.iceServers);

const name = localStorage.getItem(USERNAME_KEY);
if (!name) {
    window.location.href = '/';
    throw new Error('Nome não definido, redirecionando para a home');
}

const peerId = crypto.randomUUID();

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

let localStream;
let cameraTrack;
let micTrack;
let screenStream = null;
let mixedAudio = null; // { track, stop() } - só existe enquanto compartilha tela com áudio do sistema
let peerMesh;
let signalingSocket;
let micEnabled = true;
let cameraEnabled = false; // câmera começa desligada - usuário liga manualmente ao entrar
let leaving = false;
let hasConnectedBefore = false;
let currentSinkId = null;
let dismissReconnectBanner = null;

function setControlsEnabled(enabled) {
    controlButtons.forEach((btn) => {
        btn.disabled = !enabled;
    });
}

async function applySinkId(videoEl) {
    if (!currentSinkId || typeof videoEl.setSinkId !== 'function') {
        return;
    }
    try {
        await videoEl.setSinkId(currentSinkId);
    } catch (error) {
        console.error('Falha ao trocar a saída de áudio', error);
    }
}

// Navegadores mobile (principalmente Chrome/Android) às vezes só autoplayam o <video>
// remoto silenciando o áudio internamente, sem rejeitar a Promise do play() - por isso
// o botão aparece de forma proativa ao chegar um peer remoto, não só quando play() falha.
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

/**
 * `audioStream` é opcional e serve pro tile local durante compartilhamento de tela:
 * o vídeo exibido é o da tela (`stream`), mas o indicador de "falando" continua
 * monitorando o microfone (`localStream`), não o áudio do sistema.
 */
function upsertTile(tileId, stream, label, { muted, mirror = false, audioStream } = {}) {
    let tile = document.getElementById(`tile-${tileId}`);
    if (!tile) {
        tile = document.createElement('div');
        tile.className = 'video-tile';
        tile.id = `tile-${tileId}`;

        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.muted = muted;
        tile.appendChild(video);

        const nameTag = document.createElement('span');
        nameTag.className = 'video-tile__name';
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

        videoGrid.appendChild(tile);
    }
    const video = tile.querySelector('video');
    video.srcObject = stream;
    tile.querySelector('.video-tile__name').textContent = label;
    tile.classList.toggle('video-tile--mirror', mirror);
    applySinkId(video);
    tryPlay(video);
    if (tileId !== 'local') {
        enableAudioBtn.classList.remove('hidden');
    }

    audioActivityMonitor.watch(tileId, audioStream ?? stream, (speaking) => {
        tile.classList.toggle('video-tile--speaking', speaking);
    });
}

function removeTile(tileId) {
    audioActivityMonitor.unwatch(tileId);
    document.getElementById(`tile-${tileId}`)?.remove();
}

function setTileBadges(tileId, { audioEnabled, videoEnabled }) {
    const tile = document.getElementById(`tile-${tileId}`);
    if (!tile) {
        return;
    }
    tile.querySelector('.badge--mic-off')?.classList.toggle('hidden', audioEnabled);
    tile.querySelector('.badge--camera-off')?.classList.toggle('hidden', videoEnabled);
}

const PEER_STATE_LABELS = {
    connected: 'ok',
    completed: 'ok',
    checking: 'conectando',
    new: 'conectando',
    disconnected: 'instável',
    failed: 'falhou',
    closed: 'encerrado',
};

function setTileStatus(tileId, state) {
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
    if (state === 'connected' || state === 'completed') {
        dot.classList.add('video-tile__status-dot--ok');
    } else if (state === 'failed') {
        dot.classList.add('video-tile__status-dot--bad');
    } else {
        dot.classList.add('video-tile__status-dot--warn');
    }
    dot.title = `Conexão: ${PEER_STATE_LABELS[state] ?? state}`;
}

function getLocalMediaState() {
    return { audioEnabled: micEnabled, videoEnabled: cameraEnabled };
}

async function init() {
    roomLoading?.classList.remove('hidden');
    setControlsEnabled(false);

    try {
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

    cameraTrack = localStream.getVideoTracks()[0];
    micTrack = localStream.getAudioTracks()[0];
    // Captura a câmera junto (pra não pedir permissão de novo ao ligar), mas já entra
    // desabilitada - só manda vídeo pros remotos quando o usuário ligar manualmente.
    toggleVideoTrack(localStream, cameraEnabled);
    upsertTile('local', localStream, `${name} (você)`, { muted: true, mirror: true });
    cameraBtn.classList.toggle('is-off', !cameraEnabled);
    setTileBadges('local', getLocalMediaState());

    signalingSocket = new SignalingSocket({ roomId, peerId, name });
    signalingSocket.onOpen(() => {
        connectionStatus.textContent = 'sinalização: conectado';
        dismissReconnectBanner?.();
        dismissReconnectBanner = null;
        roomLoading?.classList.add('hidden');
        setControlsEnabled(true);
        if (hasConnectedBefore) {
            // Sessão nova no servidor (afterConnectionEstablished trata reconexão como
            // conexão do zero) - descarta as RTCPeerConnection antigas antes da próxima
            // mensagem "peers" chegar, senão o mesh duplica/faz oferta em cima de conexão morta.
            peerMesh.resetForReconnect();
        }
        hasConnectedBefore = true;
    });
    signalingSocket.onClose(() => {
        if (!leaving) {
            connectionStatus.textContent = 'sinalização: desconectado';
        }
    });
    signalingSocket.onReconnectAttempt((attempt, delayMs) => {
        connectionStatus.textContent = `sinalização: reconectando (tentativa ${attempt}, ${Math.round(delayMs / 1000)}s)…`;
    });
    signalingSocket.onReconnectFailed(() => {
        connectionStatus.textContent = 'sinalização: perdida';
        dismissReconnectBanner = showBanner('Conexão com o servidor perdida.', {
            dismissible: false,
            actionLabel: 'Recarregar página',
            onAction: () => window.location.reload(),
        });
    });

    peerMesh = new PeerMesh({
        signaling: signalingSocket,
        iceServers,
        localStream,
        onRemoteStream: (remotePeerId, stream, remoteName) => {
            upsertTile(remotePeerId, stream, remoteName ?? 'Participante', { muted: false });
        },
        onRemoteStreamRemoved: (remotePeerId) => {
            removeTile(remotePeerId);
        },
        onPeerJoined: (_remotePeerId, remoteName) => {
            showToast(`${remoteName ?? 'Alguém'} entrou na sala`);
        },
        onPeerLeft: (_remotePeerId, remoteName) => {
            showToast(`${remoteName ?? 'Alguém'} saiu da sala`);
        },
        onPeerStateChange: (remotePeerId, state) => {
            setTileStatus(remotePeerId, state);
        },
        onRemoteMediaState: (remotePeerId, audioEnabled, videoEnabled) => {
            setTileBadges(remotePeerId, { audioEnabled, videoEnabled });
        },
        getLocalMediaState,
    });

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
    fillSelect(micSelect, inputs, localStream?.getAudioTracks()[0]?.getSettings().deviceId);
    fillSelect(cameraSelect, videoInputs, cameraTrack?.getSettings().deviceId);

    // A maioria dos navegadores mobile (Chrome/Safari Android e iOS) não implementa
    // HTMLMediaElement.setSinkId - nesse caso é melhor esconder o seletor do que mostrar
    // um dropdown desabilitado confuso.
    if (supportsAudioOutputSelection()) {
        fillSelect(speakerSelect, outputs, currentSinkId);
    } else {
        speakerSelect.closest('.device-select').classList.add('hidden');
    }
}

micSelect.addEventListener('change', async () => {
    const deviceId = micSelect.value;
    if (!deviceId) {
        return;
    }
    try {
        const newTrack = await getAudioTrackForDevice(deviceId);
        const oldTrack = localStream.getAudioTracks()[0];
        if (oldTrack) {
            localStream.removeTrack(oldTrack);
            oldTrack.stop();
        }
        newTrack.enabled = micEnabled;
        localStream.addTrack(newTrack);
        micTrack = newTrack;
        peerMesh?.replaceAudioTrack(newTrack);
        // upsertTile não é chamado aqui (o tile já existe, só a track de áudio mudou) - reconecta
        // o indicador de "falando" à nova track, senão ele fica preso na antiga (já parada).
        const localTile = document.getElementById('tile-local');
        if (localTile) {
            audioActivityMonitor.watch('local', localStream, (speaking) => {
                localTile.classList.toggle('video-tile--speaking', speaking);
            });
        }
    } catch (error) {
        console.error('Falha ao trocar de microfone', error);
        showToast(error.message ?? 'Falha ao trocar de microfone', { type: 'error' });
    }
});

cameraSelect.addEventListener('change', async () => {
    const deviceId = cameraSelect.value;
    if (!deviceId) {
        return;
    }
    try {
        const newTrack = await getVideoTrackForDevice(deviceId);
        const oldTrack = localStream.getVideoTracks()[0];
        if (oldTrack) {
            localStream.removeTrack(oldTrack);
            oldTrack.stop();
        }
        newTrack.enabled = cameraEnabled;
        localStream.addTrack(newTrack);
        cameraTrack = newTrack;
        peerMesh?.replaceVideoTrack(newTrack);
        upsertTile('local', localStream, `${name} (você)`, { muted: true, mirror: true });
    } catch (error) {
        console.error('Falha ao trocar de câmera', error);
        showToast(error.message ?? 'Falha ao trocar de câmera', { type: 'error' });
    }
});

speakerSelect.addEventListener('change', async () => {
    currentSinkId = speakerSelect.value;
    const videos = videoGrid.querySelectorAll('video');
    for (const video of videos) {
        await applySinkId(video);
    }
});

micBtn.addEventListener('click', () => {
    if (!localStream) return;
    micEnabled = !micEnabled;
    toggleAudioTrack(localStream, micEnabled);
    micBtn.classList.toggle('is-off', !micEnabled);
    setTileBadges('local', getLocalMediaState());
    peerMesh?.broadcastMediaState(getLocalMediaState());
});

cameraBtn.addEventListener('click', () => {
    if (!localStream) return;
    cameraEnabled = !cameraEnabled;
    toggleVideoTrack(localStream, cameraEnabled);
    cameraBtn.classList.toggle('is-off', !cameraEnabled);
    setTileBadges('local', getLocalMediaState());
    peerMesh?.broadcastMediaState(getLocalMediaState());
});

screenBtn.addEventListener('click', async () => {
    if (screenStream) {
        stopScreenShare();
        return;
    }
    try {
        screenStream = await getScreenStream();
    } catch {
        return; // usuário cancelou o seletor de tela
    }
    const screenTrack = screenStream.getVideoTracks()[0];
    peerMesh.replaceVideoTrack(screenTrack);

    // Nem todo compartilhamento vem com áudio (depende do SO/navegador e se o usuário
    // marcou a opção no seletor nativo) - só mixa se realmente veio uma track de áudio.
    const systemAudioTrack = screenStream.getAudioTracks()[0];
    if (systemAudioTrack) {
        mixedAudio = mixAudioTracks(micTrack, systemAudioTrack);
        peerMesh.replaceAudioTrack(mixedAudio.track);
        micSelect.disabled = true;
    }

    upsertTile('local', screenStream, `${name} (compartilhando tela)`, {
        muted: true,
        mirror: false,
        audioStream: localStream,
    });
    screenTrack.addEventListener('ended', stopScreenShare);
    screenBtn.classList.add('is-active');
    cameraSelect.disabled = true;
});

function stopScreenShare() {
    if (!screenStream) {
        return;
    }
    stopStream(screenStream);
    screenStream = null;

    if (mixedAudio) {
        mixedAudio.stop();
        mixedAudio = null;
        peerMesh?.replaceAudioTrack(micTrack);
        micSelect.disabled = false;
    }

    peerMesh?.replaceVideoTrack(cameraTrack);
    upsertTile('local', localStream, `${name} (você)`, { muted: true, mirror: true });
    screenBtn.classList.remove('is-active');
    cameraSelect.disabled = false;
}

leaveBtn.addEventListener('click', () => {
    leaving = true;
    peerMesh?.closeAll();
    signalingSocket?.close();
    if (mixedAudio) mixedAudio.stop();
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
    peerMesh?.closeAll();
    signalingSocket?.close();
    if (mixedAudio) mixedAudio.stop();
    if (screenStream) stopStream(screenStream);
    if (localStream) stopStream(localStream);
});

init();
