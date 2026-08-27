<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useChatStore, type StoredMessage } from '@/stores/chat'
import Icon from '@/components/Icon.vue'
import Avatar from '@/components/Avatar.vue'

const props = defineProps<{
  roomId: string | null
  roomName: string | null
  connected: boolean
}>()

const chat = useChatStore()
const GROUP_WINDOW_MS = 5 * 60 * 1000
const AT_BOTTOM_SLACK = 40

type Item =
  | { type: 'separator'; key: string; label: string }
  | { type: 'message'; key: string; message: StoredMessage; continuation: boolean }

function dayLabel(date: Date): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today.getTime() - 86_400_000)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  if (target.getTime() === today.getTime()) return 'Hoje'
  if (target.getTime() === yesterday.getTime()) return 'Ontem'
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function timeLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const items = computed<Item[]>(() => {
  if (!props.roomId) {
    return []
  }
  const list = chat.messages(props.roomId)
  const result: Item[] = []
  let previous: StoredMessage | null = null
  let previousDate: Date | null = null
  for (const message of list) {
    const date = new Date(message.timestamp)
    if (!previousDate || date.toDateString() !== previousDate.toDateString()) {
      result.push({ type: 'separator', key: `sep-${message.id}`, label: dayLabel(date) })
      previous = null
    }
    const continuation = !!(
      previous &&
      previous.stableId === message.stableId &&
      message.timestamp - previous.timestamp < GROUP_WINDOW_MS
    )
    result.push({ type: 'message', key: message.id, message, continuation })
    previous = message
    previousDate = date
  }
  return result
})

const messagesEl = ref<HTMLElement | null>(null)
const showJump = ref(false)
let forceScrollNext = true

function isAtBottom(): boolean {
  const el = messagesEl.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight < AT_BOTTOM_SLACK
}

function scrollToBottom(): void {
  const el = messagesEl.value
  if (el) {
    el.scrollTop = el.scrollHeight
  }
  showJump.value = false
}

watch(
  () => props.roomId,
  async (roomId) => {
    forceScrollNext = true
    if (roomId) {
      await chat.ensureHistory(roomId)
      chat.setActiveRoom(roomId)
      if (!document.hidden) {
        chat.markRead(roomId)
      }
    } else {
      chat.setActiveRoom(null)
    }
  },
  { immediate: true },
)

watch(items, () => {
  const wasAtBottom = forceScrollNext || isAtBottom()
  forceScrollNext = false
  nextTick(() => {
    if (wasAtBottom) {
      scrollToBottom()
    } else {
      showJump.value = true
    }
  })
})

function onScroll(): void {
  if (isAtBottom()) {
    showJump.value = false
  }
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && props.roomId) {
    chat.markRead(props.roomId)
  }
})

const draft = ref('')
const placeholder = computed(() =>
  props.connected ? `Mensagem em ${props.roomName ?? ''}` : 'Entre num canal para conversar',
)

async function submit(): Promise<void> {
  const text = draft.value.trim()
  if (!text || !props.roomId) {
    return
  }
  draft.value = ''
  try {
    chat.send(props.roomId, text)
  } catch (error) {
    draft.value = text
    throw error
  }
}
</script>

<template>
  <section class="relative flex min-h-0 flex-1 flex-col bg-bg-main">
    <div ref="messagesEl" class="flex-1 space-y-0 overflow-y-auto px-4 py-3" @scroll="onScroll">
      <p v-if="!roomId" class="mt-8 text-center text-text-muted">Escolha um canal pra começar.</p>
      <p v-else-if="items.length === 0" class="mt-8 text-center text-text-muted">
        Nenhuma mensagem por aqui ainda.
      </p>
      <template v-for="item in items" :key="item.key">
        <div v-if="item.type === 'separator'" class="my-3 text-center text-xs text-text-muted">
          {{ item.label }}
        </div>
        <div
          v-else
          class="group flex gap-3 rounded px-2 py-0.5 hover:bg-black/[0.06]"
          :class="item.continuation ? 'mt-0' : 'mt-3.5'"
        >
          <div class="w-10 shrink-0">
            <Avatar v-if="!item.continuation" :name="item.message.name" :seed="item.message.stableId" :size="40" />
            <time
              v-else
              class="block pt-1 text-[11px] text-text-muted opacity-0 group-hover:opacity-100"
              >{{ timeLabel(item.message.timestamp) }}</time
            >
          </div>
          <div class="min-w-0 flex-1">
            <div v-if="!item.continuation" class="flex items-baseline gap-2">
              <span
                class="font-medium"
                :class="item.message.isLocal ? 'text-accent' : 'text-text-strong'"
                >{{ item.message.name }}</span
              >
              <time class="text-[11px] text-text-muted">{{ timeLabel(item.message.timestamp) }}</time>
            </div>
            <div class="break-words text-text">{{ item.message.text }}</div>
          </div>
        </div>
      </template>
    </div>

    <button
      v-if="showJump"
      type="button"
      class="absolute bottom-[68px] left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-sm text-white shadow-[0_4px_16px_rgba(0,0,0,0.4)] hover:bg-accent-hover"
      @click="scrollToBottom"
    >
      <Icon name="arrow-down" :size="14" />
      Novas mensagens
    </button>

    <form class="flex items-center gap-2 border-t border-black/20 p-3" @submit.prevent="submit">
      <input
        v-model="draft"
        type="text"
        maxlength="500"
        autocomplete="off"
        :disabled="!connected"
        :placeholder="placeholder"
        class="flex-1 rounded-md bg-bg-input px-3 py-2 text-text outline-none disabled:opacity-50"
      />
      <button
        type="submit"
        title="Enviar"
        :disabled="!connected"
        class="rounded-md p-2 text-interactive hover:bg-bg-hover hover:text-accent disabled:opacity-50"
      >
        <Icon name="send" :size="18" />
      </button>
    </form>
  </section>
</template>
