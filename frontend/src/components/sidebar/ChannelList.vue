<script setup lang="ts">
import { computed } from 'vue'
import { usePresenceStore } from '@/stores/presence'
import { useChatStore } from '@/stores/chat'
import { useVoiceStore } from '@/stores/voice'
import Icon from '@/components/Icon.vue'
import Avatar from '@/components/Avatar.vue'

const emit = defineEmits<{
  editRoom: [roomId: string]
  deleteRoom: [roomId: string]
  participantClick: [identity: string, anchor: HTMLElement]
}>()

const presence = usePresenceStore()
const chat = useChatStore()
const voice = useVoiceStore()

const connectingRoomId = computed(() => (voice.state === 'joining' ? voice.roomId : null))

function members(roomId: string) {
  return presence.byRoom[roomId] ?? []
}

function unreadLabel(roomId: string): string {
  const count = chat.unread(roomId)
  return count > 99 ? '99+' : String(count)
}

function onMemberClick(event: MouseEvent, identity: string): void {
  event.preventDefault()
  event.stopPropagation()
  emit('participantClick', identity, event.currentTarget as HTMLElement)
}
</script>

<template>
  <ul class="flex flex-col gap-0.5 px-2">
    <li v-for="room in presence.rooms" :key="room.id" class="channel group/channel">
      <div
        class="flex items-center gap-2 rounded px-2 py-1.5"
        :class="voice.roomId === room.id ? 'bg-bg-active font-medium text-text-strong' : 'hover:bg-bg-hover'"
      >
        <RouterLink :to="`/room/${room.id}`" class="flex min-w-0 flex-1 items-center gap-2">
          <span class="shrink-0">{{ room.icon }}</span>
          <span class="min-w-0 flex-1 truncate text-sm">{{ room.name }}</span>
          <span
            v-if="connectingRoomId === room.id"
            class="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-text-muted border-t-transparent"
          />
          <span
            v-if="chat.unread(room.id) > 0"
            class="shrink-0 rounded-full bg-danger px-1.5 text-xs leading-5 text-white"
          >
            {{ unreadLabel(room.id) }}
          </span>
        </RouterLink>
        <span class="hidden shrink-0 items-center gap-1 group-hover/channel:flex">
          <button type="button" title="Editar sala" class="rounded p-1 text-interactive hover:bg-bg-hover" @click.prevent.stop="emit('editRoom', room.id)">
            <Icon name="edit" :size="14" />
          </button>
          <button type="button" title="Apagar sala" class="rounded p-1 text-interactive hover:bg-bg-hover" @click.prevent.stop="emit('deleteRoom', room.id)">
            <Icon name="trash" :size="14" />
          </button>
        </span>
      </div>

      <ul v-if="members(room.id).length" class="ml-6 flex flex-col gap-0.5 py-1">
        <li
          v-for="member in members(room.id)"
          :key="member.identity"
          :data-identity="member.identity"
          class="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs hover:bg-bg-hover"
          :class="member.speaking ? 'text-text-strong' : 'text-text-muted'"
          @click="onMemberClick($event, member.identity)"
        >
          <Avatar
            :name="member.name"
            :seed="member.stableId ?? member.name"
            :size="24"
            :class="member.speaking ? 'shadow-[0_0_0_2px_var(--color-ok)]' : ''"
          />
          <span class="min-w-0 flex-1 truncate">{{ member.name }}<template v-if="member.isLocal"> (você)</template></span>
          <span v-if="member.live && member.micOn === false" class="text-danger" title="Microfone desligado">
            <Icon name="mic-off" :size="12" />
          </span>
        </li>
      </ul>
    </li>
  </ul>
</template>
