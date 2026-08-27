<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useLocalMedia, supportsAudioOutputSelection } from '@/composables/useLocalMedia'
import { useVoiceStore } from '@/stores/voice'
import { getPref, setPref, KEYS } from '@/lib/prefs'
import Icon from '@/components/Icon.vue'

const localMedia = useLocalMedia()
const voice = useVoiceStore()

const visible = ref(false)
const audioIn = ref<MediaDeviceInfo[]>([])
const audioOut = ref<MediaDeviceInfo[]>([])
const videoIn = ref<MediaDeviceInfo[]>([])
const selectedAudioIn = ref('')
const selectedAudioOut = ref('')
const selectedVideoIn = ref('')
const soundsEnabled = ref(getPref(KEYS.sounds, true) !== false)

const showSpeakerRow = supportsAudioOutputSelection()

function labelFor(device: MediaDeviceInfo, index: number): string {
  return device.label || `Dispositivo ${index + 1}`
}

function fill(devices: { audioIn: MediaDeviceInfo[]; audioOut: MediaDeviceInfo[]; videoIn: MediaDeviceInfo[] }): void {
  audioIn.value = devices.audioIn
  audioOut.value = devices.audioOut
  videoIn.value = devices.videoIn

  const saved = getPref<Record<string, string>>(KEYS.devices, {})
  const preferredAudioIn = localMedia.micTrack.value?.getSettings().deviceId ?? saved.audioIn
  const preferredVideoIn = localMedia.cameraTrack.value?.getSettings().deviceId ?? saved.videoIn

  selectedAudioIn.value = devices.audioIn.some((d) => d.deviceId === preferredAudioIn) ? (preferredAudioIn ?? '') : ''
  selectedVideoIn.value = devices.videoIn.some((d) => d.deviceId === preferredVideoIn) ? (preferredVideoIn ?? '') : ''
  selectedAudioOut.value = devices.audioOut.some((d) => d.deviceId === saved.audioOut) ? saved.audioOut : ''
}

const unsubscribeDevices = localMedia.on((detail) => {
  if (detail.type === 'deviceschange') {
    fill({ audioIn: detail.audioIn, audioOut: detail.audioOut, videoIn: detail.videoIn })
  }
})
onBeforeUnmount(unsubscribeDevices)

async function open(): Promise<void> {
  try {
    fill(await localMedia.listDevices())
  } catch (error) {
    console.error(error)
  }
  visible.value = true
}

function close(): void {
  visible.value = false
}

function persistDevice(kind: 'audioIn' | 'videoIn' | 'audioOut', deviceId: string): void {
  const devices = getPref<Record<string, string>>(KEYS.devices, {})
  setPref(KEYS.devices, { ...devices, [kind]: deviceId })
}

async function switchDevice(kind: 'audioIn' | 'videoIn' | 'audioOut', deviceId: string): Promise<void> {
  if (!deviceId) return
  try {
    if (kind === 'audioIn') await localMedia.setAudioInput(deviceId)
    else if (kind === 'videoIn') await localMedia.setVideoInput(deviceId)
    else await voice.setAudioOutput(deviceId)
    persistDevice(kind, deviceId)
  } catch (error) {
    console.error(error)
  }
}

function onSoundsToggle(): void {
  setPref(KEYS.sounds, soundsEnabled.value)
}

defineExpose({ open, close })
</script>

<template>
  <div v-if="visible" class="fixed inset-0 z-40 grid place-items-center bg-black/75 p-4" @click.self="close">
    <div class="w-full max-w-sm rounded-lg bg-bg-panel p-6 shadow-[0_8px_16px_rgba(0,0,0,0.24)]">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-text-strong">Configurações</h2>
        <button type="button" title="Fechar" class="rounded p-1 text-interactive hover:bg-bg-hover" @click="close">
          <Icon name="close" :size="18" />
        </button>
      </div>

      <label class="mt-4 block text-sm">
        <span class="text-text-muted">Microfone</span>
        <select
          v-model="selectedAudioIn"
          class="mt-1 w-full rounded-md bg-bg-input px-2 py-1.5 text-text"
          @change="switchDevice('audioIn', selectedAudioIn)"
        >
          <option v-for="(device, index) in audioIn" :key="device.deviceId" :value="device.deviceId">
            {{ labelFor(device, index) }}
          </option>
        </select>
      </label>

      <label class="mt-3 block text-sm">
        <span class="text-text-muted">Câmera</span>
        <select
          v-model="selectedVideoIn"
          :disabled="videoIn.length === 0"
          class="mt-1 w-full rounded-md bg-bg-input px-2 py-1.5 text-text disabled:opacity-50"
          @change="switchDevice('videoIn', selectedVideoIn)"
        >
          <option v-if="videoIn.length === 0" value="">Nenhuma câmera encontrada</option>
          <option v-for="(device, index) in videoIn" :key="device.deviceId" :value="device.deviceId">
            {{ labelFor(device, index) }}
          </option>
        </select>
      </label>

      <label v-if="showSpeakerRow" class="mt-3 block text-sm">
        <span class="text-text-muted">Saída de áudio</span>
        <select
          v-model="selectedAudioOut"
          class="mt-1 w-full rounded-md bg-bg-input px-2 py-1.5 text-text"
          @change="switchDevice('audioOut', selectedAudioOut)"
        >
          <option v-for="(device, index) in audioOut" :key="device.deviceId" :value="device.deviceId">
            {{ labelFor(device, index) }}
          </option>
        </select>
      </label>

      <label class="mt-4 flex items-center gap-2 text-sm">
        <input v-model="soundsEnabled" type="checkbox" @change="onSoundsToggle" />
        <span class="text-text-muted">Sons de entrada e saída</span>
      </label>

      <div class="mt-5 flex justify-end">
        <button type="button" class="rounded-md bg-accent px-4 py-1.5 font-medium text-white hover:bg-accent-hover" @click="close">
          Fechar
        </button>
      </div>
    </div>
  </div>
</template>
