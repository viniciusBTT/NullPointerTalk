/**
 * Configurações de dispositivo, num modal.
 *
 * Antes eram três <select> crus sempre visíveis numa barra em cima dos controles — algo
 * que só se olha uma vez e depois só atrapalha. Aqui ficam atrás da engrenagem, e a
 * escolha é lembrada entre sessões.
 */

import { el, clear } from '../lib/dom.js';
import { supportsAudioOutputSelection } from '../lib/media.js';
import { getPref, setPref, KEYS } from '../lib/prefs.js';
import { isEnabled as soundsEnabled, setEnabled as setSoundsEnabled } from '../lib/sounds.js';

export function initSettingsModal({
    root,
    micSelect,
    cameraSelect,
    speakerSelect,
    speakerRow,
    soundsToggle,
    closeButtons,
    localMedia,
    session,
    onError,
}) {
    soundsToggle.checked = soundsEnabled();
    soundsToggle.addEventListener('change', () => setSoundsEnabled(soundsToggle.checked));

    closeButtons.forEach((button) => button.addEventListener('click', () => close()));
    root.addEventListener('click', (event) => {
        if (event.target === root) {
            close(); // clique no backdrop
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !root.classList.contains('hidden')) {
            close();
        }
    });

    micSelect.addEventListener('change', () => switchDevice('audioIn', micSelect.value));
    cameraSelect.addEventListener('change', () => switchDevice('videoIn', cameraSelect.value));
    speakerSelect.addEventListener('change', () => switchDevice('audioOut', speakerSelect.value));

    localMedia.addEventListener('deviceschange', (event) => fill(event.detail));

    async function switchDevice(kind, deviceId) {
        if (!deviceId) {
            return;
        }
        try {
            if (kind === 'audioIn') {
                await localMedia.setAudioInput(deviceId);
            } else if (kind === 'videoIn') {
                await localMedia.setVideoInput(deviceId);
            } else {
                await session.setAudioOutput(deviceId);
            }
            const devices = getPref(KEYS.devices, {}) ?? {};
            setPref(KEYS.devices, { ...devices, [kind]: deviceId });
        } catch (error) {
            console.error('Falha ao trocar de dispositivo', error);
            onError?.(error?.message ?? 'Falha ao trocar de dispositivo');
        }
    }

    function fill({ audioIn, audioOut, videoIn }) {
        const saved = getPref(KEYS.devices, {}) ?? {};
        fillSelect(micSelect, audioIn, localMedia.micTrack?.getSettings().deviceId ?? saved.audioIn);
        fillSelect(cameraSelect, videoIn, localMedia.cameraTrack?.getSettings().deviceId ?? saved.videoIn);

        // A maioria dos navegadores mobile não implementa HTMLMediaElement.setSinkId -
        // esconder é melhor que mostrar um dropdown desabilitado sem explicação.
        if (supportsAudioOutputSelection()) {
            fillSelect(speakerSelect, audioOut, saved.audioOut);
            speakerRow.classList.remove('hidden');
        } else {
            speakerRow.classList.add('hidden');
        }

        cameraSelect.disabled = videoIn.length === 0;
        if (videoIn.length === 0) {
            clear(cameraSelect);
            cameraSelect.appendChild(el('option', { text: 'Nenhuma câmera encontrada' }));
        }
    }

    async function open() {
        try {
            fill(await localMedia.listDevices());
        } catch (error) {
            console.error('Falha ao listar dispositivos', error);
        }
        root.classList.remove('hidden');
    }

    function close() {
        root.classList.add('hidden');
    }

    return { open, close };
}

function fillSelect(select, devices, selectedId) {
    clear(select);
    devices.forEach((device, index) => {
        select.appendChild(el('option', {
            value: device.deviceId,
            // Os labels só vêm preenchidos depois da permissão concedida.
            text: device.label || `Dispositivo ${index + 1}`,
        }));
    });
    if (selectedId && devices.some((device) => device.deviceId === selectedId)) {
        select.value = selectedId;
    }
}
