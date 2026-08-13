import { SignalingSocket } from './signaling.js';
import {
    getLocalMedia,
    toggleAudioTrack,
    toggleVideoTrack,
    stopStream,
    listAudioDevices,
    getAudioTrackForDevice,
    supportsAudioOutputSelection,
} from './media.js';
import { getScreenStream } from './screenshare.js';
import { PeerMesh } from './peers.js';

const USERNAME_KEY = 'npt.username';

const body = document.body;
const roomId = body.dataset.roomId;
const iceServerUrl = body.dataset.iceServerUrl;

const name = localStorage.getItem(USERNAME_KEY);
if (!name) {
    window.location.href = '/';
    throw new Error('Nome não definido, redirecionando para a home');
}

const peerId = crypto.randomUUID();

const videoGrid = document.getElementById('video-grid');
const connectionStatus = document.getElementById('connection-status');
const micBtn = document.getElementById('toggle-mic');
const cameraBtn = document.getElementById('toggle-camera');
const screenBtn = document.getElementById('toggle-screen');
const leaveBtn = document.getElementById('leave-room');
const micSelect = document.getElementById('mic-select');
const speakerSelect = document.getElementById('speaker-select');

let localStream;
let cameraTrack;
let screenStream = null;
let peerMesh;
let signalingSocket;
let micEnabled = true;
let cameraEnabled = true;
let leaving = false;
let currentSinkId = null;

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

function upsertTile(tileId, stream, label, muted) {
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

        videoGrid.appendChild(tile);
    }
    const video = tile.querySelector('video');
    video.srcObject = stream;
    tile.querySelector('.video-tile__name').textContent = label;
    applySinkId(video);
}

function removeTile(tileId) {
    document.getElementById(`tile-${tileId}`)?.remove();
}

async function init() {
    try {
        localStream = await getLocalMedia();
    } catch (error) {
        connectionStatus.textContent = 'erro ao acessar câmera/microfone';
        console.error(error);
        return;
    }

    cameraTrack = localStream.getVideoTracks()[0];
    upsertTile('local', localStream, `${name} (você)`, true);

    signalingSocket = new SignalingSocket({ roomId, peerId, name });
    signalingSocket.onOpen(() => {
        connectionStatus.textContent = 'conectado';
    });
    signalingSocket.onClose(() => {
        if (!leaving) {
            connectionStatus.textContent = 'desconectado';
        }
    });

    peerMesh = new PeerMesh({
        signaling: signalingSocket,
        iceServerUrl,
        localStream,
        onRemoteStream: (remotePeerId, stream, remoteName) => {
            upsertTile(remotePeerId, stream, remoteName ?? 'Participante', false);
        },
        onRemoteStreamRemoved: (remotePeerId) => {
            removeTile(remotePeerId);
        },
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
    fillSelect(micSelect, inputs, localStream?.getAudioTracks()[0]?.getSettings().deviceId);

    if (supportsAudioOutputSelection()) {
        fillSelect(speakerSelect, outputs, currentSinkId);
    } else {
        speakerSelect.disabled = true;
        speakerSelect.title = 'Troca de saída de áudio não suportada neste navegador';
        const option = document.createElement('option');
        option.textContent = 'não suportado';
        speakerSelect.innerHTML = '';
        speakerSelect.appendChild(option);
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
        peerMesh?.replaceAudioTrack(newTrack);
    } catch (error) {
        console.error('Falha ao trocar de microfone', error);
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
});

cameraBtn.addEventListener('click', () => {
    if (!localStream) return;
    cameraEnabled = !cameraEnabled;
    toggleVideoTrack(localStream, cameraEnabled);
    cameraBtn.classList.toggle('is-off', !cameraEnabled);
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
    upsertTile('local', screenStream, `${name} (compartilhando tela)`, true);
    screenTrack.addEventListener('ended', stopScreenShare);
    screenBtn.classList.add('is-active');
});

function stopScreenShare() {
    if (!screenStream) {
        return;
    }
    stopStream(screenStream);
    screenStream = null;
    peerMesh?.replaceVideoTrack(cameraTrack);
    upsertTile('local', localStream, `${name} (você)`, true);
    screenBtn.classList.remove('is-active');
}

leaveBtn.addEventListener('click', () => {
    leaving = true;
    peerMesh?.closeAll();
    signalingSocket?.close();
    if (screenStream) stopStream(screenStream);
    if (localStream) stopStream(localStream);
    window.location.href = '/';
});

window.addEventListener('beforeunload', () => {
    peerMesh?.closeAll();
    signalingSocket?.close();
    if (screenStream) stopStream(screenStream);
    if (localStream) stopStream(localStream);
});

init();
