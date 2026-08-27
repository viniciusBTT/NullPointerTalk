<script setup lang="ts">
import { ref } from 'vue'
import { usePresenceStore } from '@/stores/presence'
import ChannelList from './ChannelList.vue'
import VoicePanel from './VoicePanel.vue'
import Icon from '@/components/Icon.vue'

const emit = defineEmits<{
  addRoom: []
  editRoom: [roomId: string]
  deleteRoom: [roomId: string]
  participantClick: [identity: string, anchor: HTMLElement]
  openSettings: []
  rename: []
}>()

const presence = usePresenceStore()
const open = ref(false)

function toggle(): void {
  open.value = !open.value
}

function closeDrawer(): void {
  open.value = false
}

defineExpose({ toggle })
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-10 bg-black/50 max-[900px]:block min-[901px]:hidden"
    @click="closeDrawer"
  />
  <nav
    class="flex w-60 shrink-0 flex-col bg-bg-sidebar transition-transform duration-[180ms] ease-out max-[900px]:fixed max-[900px]:inset-y-0 max-[900px]:left-0 max-[900px]:z-20"
    :class="open ? 'max-[900px]:translate-x-0' : 'max-[900px]:-translate-x-full'"
  >
    <div class="flex items-center px-4 py-3">
      <span class="font-semibold text-text-strong">NullPointerTalk</span>
    </div>

    <div class="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2" @click="closeDrawer">
      <h2 class="px-4 py-1 text-xs font-semibold tracking-wide text-text-muted uppercase">Canais de voz</h2>
      <ChannelList
        @edit-room="(id) => emit('editRoom', id)"
        @delete-room="(id) => emit('deleteRoom', id)"
        @participant-click="(identity, anchor) => emit('participantClick', identity, anchor)"
      />
      <button
        type="button"
        class="mx-2 mt-1 flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-text-muted hover:bg-bg-hover"
        @click.stop="emit('addRoom')"
      >
        <Icon name="plus" :size="16" />
        Nova sala
      </button>
      <p v-if="presence.isStale" class="mx-2 mt-2 rounded bg-warn/10 px-2 py-1 text-xs text-warn">
        Presença indisponível — mostrando o último dado conhecido.
      </p>
    </div>

    <VoicePanel @open-settings="emit('openSettings')" @rename="emit('rename')" />
  </nav>
</template>
