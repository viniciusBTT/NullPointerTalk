<script setup lang="ts">
import { computed } from 'vue'
import { useVoiceStore } from '@/stores/voice'
import { useIdentityStore } from '@/stores/identity'
import { usePresenceStore } from '@/stores/presence'
import { useAudioSink } from '@/composables/useAudioSink'
import Icon from '@/components/Icon.vue'
import Avatar from '@/components/Avatar.vue'

const emit = defineEmits<{ openSettings: []; rename: [] }>()

const voice = useVoiceStore()
const identity = useIdentityStore()
const presence = usePresenceStore()
const audioSink = useAudioSink()

const STATE_LABELS: Record<string, string> = {
  idle: 'Fora de um canal',
  joining: 'Entrando…',
  connected: 'Conectado',
  reconnecting: 'Reconectando…',
}

const statusLabel = computed(() => STATE_LABELS[voice.state] ?? voice.state)
const statusColor = computed(() => {
  if (voice.state === 'connected') return 'text-ok'
  if (voice.state === 'joining' || voice.state === 'reconnecting') return 'text-warn'
  return 'text-text-muted'
})
const connected = computed(() => voice.state !== 'idle')
const roomName = computed(() => (voice.roomId ? presence.roomsById.get(voice.roomId)?.name : null))

let micIntentBeforeDeafen: boolean | null = null

function toggleMic(): void {
  const turningOn = !voice.desired.mic
  if (turningOn && audioSink.deafened.value) {
    micIntentBeforeDeafen = null
    audioSink.setDeafened(false)
  }
  void voice.setMicEnabled(turningOn)
}

function toggleDeafen(): void {
  const next = !audioSink.deafened.value
  if (next) {
    micIntentBeforeDeafen = voice.desired.mic
    audioSink.setDeafened(true)
    void voice.setMicEnabled(false)
  } else {
    audioSink.setDeafened(false)
    void voice.setMicEnabled(micIntentBeforeDeafen ?? true)
    micIntentBeforeDeafen = null
  }
}
</script>

<template>
  <div class="flex flex-col gap-2 border-t border-black/20 bg-bg-panel p-2">
    <div class="flex items-center gap-2 px-1 text-xs">
      <span :class="statusColor">{{ statusLabel }}</span>
      <span v-if="connected && roomName" class="truncate text-text-muted">{{ roomName }}</span>
    </div>
    <div class="flex items-center gap-2">
      <Avatar :name="identity.displayName" :seed="identity.stableUserId" :size="32" />
      <span class="min-w-0 flex-1 truncate text-sm text-text">{{ identity.displayName }}</span>
      <button
        type="button"
        title="Trocar nome"
        class="rounded p-1.5 text-interactive hover:bg-bg-hover hover:text-interactive-hover"
        @click="emit('rename')"
      >
        <Icon name="edit" :size="16" />
      </button>
    </div>
    <div class="flex items-center gap-1">
      <button
        type="button"
        :title="voice.desired.mic ? 'Desligar microfone' : 'Ligar microfone'"
        class="rounded p-2 hover:bg-bg-hover"
        :class="voice.desired.mic ? 'text-interactive' : 'text-danger hover:bg-danger/10'"
        @click="toggleMic"
      >
        <Icon :name="voice.desired.mic ? 'mic' : 'mic-off'" :size="20" />
      </button>
      <button
        type="button"
        :title="audioSink.deafened.value ? 'Voltar a ouvir' : 'Ficar surdo'"
        class="rounded p-2 hover:bg-bg-hover"
        :class="!audioSink.deafened.value ? 'text-interactive' : 'text-danger hover:bg-danger/10'"
        @click="toggleDeafen"
      >
        <Icon :name="audioSink.deafened.value ? 'headphones-off' : 'headphones'" :size="20" />
      </button>
      <button
        type="button"
        title="Configurações"
        class="rounded p-2 text-interactive hover:bg-bg-hover"
        @click="emit('openSettings')"
      >
        <Icon name="gear" :size="20" />
      </button>
      <button
        v-if="connected"
        type="button"
        title="Sair do canal"
        class="ml-auto rounded p-2 text-danger hover:bg-danger/10"
        @click="voice.leave()"
      >
        <Icon name="phone-off" :size="20" />
      </button>
    </div>
  </div>
</template>
