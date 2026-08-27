<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useVoiceStore } from '@/stores/voice'
import { useChatStore } from '@/stores/chat'
import { usePresenceStore } from '@/stores/presence'
import { useIdentityStore } from '@/stores/identity'
import { useAudioSink } from '@/composables/useAudioSink'
import { useLocalMedia } from '@/composables/useLocalMedia'
import { useSounds } from '@/composables/useSounds'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { useBrowserSupport } from '@/composables/useBrowserSupport'

import IconSprite from '@/components/IconSprite.vue'
import Icon from '@/components/Icon.vue'
import Sidebar from '@/components/sidebar/Sidebar.vue'
import RoomAdminModal from '@/components/sidebar/RoomAdminModal.vue'
import Stage from '@/components/stage/Stage.vue'
import ParticipantPopover from '@/components/stage/ParticipantPopover.vue'
import ChatPanel from '@/components/chat/ChatPanel.vue'
import NameGate from '@/components/overlays/NameGate.vue'
import SettingsModal from '@/components/overlays/SettingsModal.vue'
import ToastHost from '@/components/overlays/ToastHost.vue'

const route = useRoute()
const router = useRouter()
const voice = useVoiceStore()
const chat = useChatStore()
const presence = usePresenceStore()
const identity = useIdentityStore()
const audioSink = useAudioSink()
const localMedia = useLocalMedia()
const sounds = useSounds()
const { showToast, showBanner } = useUiFeedback()
const { checkSupport } = useBrowserSupport()

const sidebarEl = ref<InstanceType<typeof Sidebar> | null>(null)
const roomAdminEl = ref<InstanceType<typeof RoomAdminModal> | null>(null)
const settingsEl = ref<InstanceType<typeof SettingsModal> | null>(null)
const nameGateEl = ref<InstanceType<typeof NameGate> | null>(null)
const popoverEl = ref<InstanceType<typeof ParticipantPopover> | null>(null)

const activeRoom = computed(() => {
  const id = route.params.roomId as string | undefined
  return id ? (presence.roomsById.get(id) ?? null) : null
})

watch(
  activeRoom,
  (room) => {
    document.title = room ? `${room.name} · NullPointerTalk` : 'NullPointerTalk'
  },
  { immediate: true },
)

const connected = computed(() => voice.state === 'connected' && voice.roomId === route.params.roomId)

// ---------------------------------------------------------------- eventos da voz

let reconnectDismiss: (() => void) | null = null

voice.on((event) => {
  if (event.type === 'joined') {
    void chat.ensureHistory(event.roomId).then(() => {
      if (!document.hidden) chat.markRead(event.roomId)
    })
    presence.refresh()
    sounds.setArmed(true)
  } else if (event.type === 'left') {
    sounds.setArmed(false)
    audioSink.clear()
    presence.setLive(null, [])
    presence.refresh()
    if (event.reason === 'user' && router.currentRoute.value.name !== 'home') {
      router.push('/')
    }
  } else if (event.type === 'kicked') {
    showToast('Esta sala foi removida.')
    reconnectDismiss?.()
    reconnectDismiss = null
    router.push('/')
  } else if (event.type === 'error') {
    if (event.detail.scope === 'connect' && event.detail.reconnectRoomId) {
      reconnectDismiss?.()
      const targetRoomId = event.detail.reconnectRoomId
      reconnectDismiss = showBanner(event.detail.message, {
        dismissible: false,
        actionLabel: 'Reconectar',
        onAction: () => {
          reconnectDismiss?.()
          reconnectDismiss = null
          void voice.join(targetRoomId)
        },
      })
    } else {
      showToast(event.detail.message, { type: 'error' })
    }
  } else if (event.type === 'participantjoined') {
    showToast(`${event.name} entrou no canal`)
    sounds.playJoin()
  } else if (event.type === 'participantleft') {
    showToast(`${event.name} saiu do canal`)
    sounds.playLeave()
    popoverEl.value?.closeIf(event.identity)
  }
})

// A verdade do LiveKit pro canal conectado sobrepõe o polling de presença.
watch(
  () => voice.participants,
  (list) => {
    if (voice.roomId) {
      presence.setLive(
        voice.roomId,
        list.map((p) => ({
          identity: p.identity,
          name: p.name,
          stableId: p.stableId,
          live: true,
          micOn: p.micOn,
          speaking: p.speaking,
          isLocal: p.isLocal,
        })),
      )
    }
  },
)

// ---------------------------------------------------------------- boot

let previousRoomId: string | null = null

onMounted(async () => {
  checkSupport()
  await router.isReady()
  await presence.ensureCatalogLoaded()
  presence.startPresencePolling()
  const roomIds = presence.rooms.map((r) => r.id)
  chat.syncRoomSubscriptions(roomIds)
  void chat.loadInitialUnread(roomIds)

  watch(
    () => presence.rooms.map((r) => r.id).join(','),
    () => chat.syncRoomSubscriptions(presence.rooms.map((r) => r.id)),
  )

  watch(
    () => route.params.roomId as string | undefined,
    async (id) => {
      const roomId = id ?? null
      if (roomId) {
        sounds.primeAudio()
        await voice.join(roomId)
      } else if (previousRoomId) {
        await voice.leave()
      }
      previousRoomId = roomId
    },
    { immediate: true },
  )
})

window.addEventListener('pagehide', () => localMedia.release())

// ---------------------------------------------------------------- interações da sidebar

function onParticipantClick(participantIdentity: string, anchor: HTMLElement): void {
  const target = voice.participants.find((p) => p.identity === participantIdentity)
  popoverEl.value?.open(target, anchor)
}

function onEditRoom(roomId: string): void {
  roomAdminEl.value?.openEdit(roomId)
}

function onDeleteRoom(roomId: string): void {
  void roomAdminEl.value?.remove(roomId)
}

function toggleCamera(): void {
  void voice.setCameraEnabled(!voice.desired.camera)
}

function toggleScreenShare(): void {
  void voice.setScreenShareEnabled(!voice.desired.screen)
}

function toggleListenAlong(): void {
  void voice.setListenAlongEnabled(!voice.desired.listenAlong)
}
</script>

<template>
  <IconSprite />
  <div class="grid h-dvh grid-cols-[72px_auto_1fr] bg-bg-main text-text">
    <aside class="flex flex-col items-center bg-bg-rail py-3">
      <div class="grid h-11 w-11 place-items-center rounded-2xl bg-bg-elevated text-xs font-bold text-text-strong" title="NullPointerTalk">
        NPT
      </div>
    </aside>

    <Sidebar
      ref="sidebarEl"
      @add-room="roomAdminEl?.openCreate()"
      @edit-room="onEditRoom"
      @delete-room="onDeleteRoom"
      @participant-click="onParticipantClick"
      @open-settings="settingsEl?.open()"
      @rename="nameGateEl?.show(identity.displayName)"
    />

    <main class="flex min-h-0 min-w-0 flex-col">
      <header class="flex items-center gap-2 border-b border-black/20 px-3 py-2">
        <button
          type="button"
          title="Canais"
          class="rounded p-1.5 text-interactive hover:bg-bg-hover min-[901px]:hidden"
          @click="sidebarEl?.toggle()"
        >
          <Icon name="menu" :size="20" />
        </button>
        <span v-if="activeRoom" class="text-lg">{{ activeRoom.icon }}</span>
        <h1 class="min-w-0 flex-1 truncate font-semibold text-text-strong">
          {{ activeRoom?.name ?? 'NullPointerTalk' }}
        </h1>
        <span v-if="voice.state === 'reconnecting'" class="text-xs text-warn">reconectando…</span>
      </header>

      <div class="grid min-h-0 flex-1" :class="voice.videoPubs.length > 0 ? 'grid-rows-[minmax(0,45%)_minmax(0,1fr)]' : 'grid-rows-[minmax(0,1fr)]'">
        <Stage @participant-click="onParticipantClick" />
        <ChatPanel :room-id="(route.params.roomId as string) ?? null" :room-name="activeRoom?.name ?? null" :connected="connected" />
      </div>

      <footer v-if="voice.state !== 'idle'" class="flex items-center justify-center gap-2 border-t border-black/20 p-3">
        <button
          type="button"
          title="Ligar câmera"
          :disabled="voice.state !== 'connected'"
          class="rounded-full p-3 hover:bg-bg-hover disabled:opacity-50"
          :class="voice.desired.camera ? 'bg-accent text-white' : 'text-interactive'"
          @click="toggleCamera"
        >
          <Icon :name="voice.desired.camera ? 'camera' : 'camera-off'" :size="22" />
        </button>
        <button
          type="button"
          title="Compartilhar tela"
          :disabled="voice.state !== 'connected'"
          class="rounded-full p-3 hover:bg-bg-hover disabled:opacity-50"
          :class="voice.desired.screen ? 'bg-accent text-white' : 'text-interactive'"
          @click="toggleScreenShare"
        >
          <Icon :name="voice.desired.screen ? 'screen-share' : 'screen-share-off'" :size="22" />
        </button>
        <button
          type="button"
          title="Ouvir junto (áudio de uma aba)"
          :disabled="voice.state !== 'connected'"
          class="rounded-full p-3 hover:bg-bg-hover disabled:opacity-50"
          :class="voice.desired.listenAlong ? 'bg-accent text-white' : 'text-interactive'"
          @click="toggleListenAlong"
        >
          <Icon name="music" :size="22" />
        </button>
        <button
          type="button"
          title="Sair do canal"
          class="rounded-full bg-danger p-3 text-white hover:bg-danger-hover"
          @click="voice.leave()"
        >
          <Icon name="phone-off" :size="22" />
        </button>
      </footer>
    </main>
  </div>

  <button
    v-if="!voice.canPlaybackAudio"
    type="button"
    class="fixed top-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-bg-float px-4 py-2 text-sm text-text shadow-[0_4px_16px_rgba(0,0,0,0.4)]"
    @click="voice.unlockAudio()"
  >
    <Icon name="volume" :size="16" />
    Toque para ativar o áudio
  </button>

  <NameGate ref="nameGateEl" />
  <SettingsModal ref="settingsEl" />
  <RoomAdminModal ref="roomAdminEl" />
  <ParticipantPopover ref="popoverEl" />
  <ToastHost />
</template>
