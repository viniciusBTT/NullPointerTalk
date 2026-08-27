<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue'
import { useAudioSink } from '@/composables/useAudioSink'
import Icon from '@/components/Icon.vue'
import Avatar from '@/components/Avatar.vue'

export interface PopoverParticipant {
  identity: string
  stableId: string
  name: string
  isLocal: boolean
}

const audioSink = useAudioSink()
const visible = ref(false)
const participant = ref<PopoverParticipant | null>(null)
const rootEl = ref<HTMLElement | null>(null)
const style = ref<{ left: string; top: string }>({ left: '0px', top: '0px' })

const volumePercent = ref(0)
const muted = ref(false)

async function open(target: PopoverParticipant | undefined, anchor: HTMLElement): Promise<void> {
  if (!target || target.isLocal) {
    return
  }
  participant.value = target
  muted.value = audioSink.isMutedFor(target.stableId)
  volumePercent.value = Math.round(audioSink.getVolume(target.stableId) * 100)
  visible.value = true
  await nextTick()
  position(anchor)
}

function close(): void {
  visible.value = false
  participant.value = null
}

function closeIf(identity: string): void {
  if (participant.value?.identity === identity) {
    close()
  }
}

function position(anchor: HTMLElement): void {
  const box = anchor.getBoundingClientRect()
  const own = rootEl.value?.getBoundingClientRect()
  if (!own) return
  const margin = 8
  const left = Math.min(box.right + margin, window.innerWidth - own.width - margin)
  const top = Math.min(box.top, window.innerHeight - own.height - margin)
  style.value = { left: `${Math.max(margin, left)}px`, top: `${Math.max(margin, top)}px` }
}

function onVolumeInput(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  volumePercent.value = value
  if (participant.value) {
    audioSink.setVolume(participant.value.stableId, value / 100)
  }
}

function toggleMute(): void {
  if (!participant.value) return
  muted.value = !muted.value
  audioSink.setMutedFor(participant.value.stableId, muted.value)
}

function onDocumentClick(event: MouseEvent): void {
  if (!visible.value) return
  const target = event.target as HTMLElement
  if (rootEl.value?.contains(target) || target.closest('[data-identity]')) {
    return
  }
  close()
}

function onKeydown(event: KeyboardEvent): void {
  if (visible.value && event.key === 'Escape') {
    close()
  }
}

document.addEventListener('click', onDocumentClick)
document.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})

defineExpose({ open, close, closeIf })
</script>

<template>
  <div
    v-if="visible && participant"
    ref="rootEl"
    class="fixed z-30 w-60 rounded-lg bg-bg-float p-3 shadow-[0_8px_16px_rgba(0,0,0,0.24)]"
    :style="style"
  >
    <div class="flex items-center gap-2">
      <Avatar :name="participant.name" :seed="participant.stableId" :size="32" />
      <span class="truncate text-sm font-medium text-text-strong">{{ participant.name }}</span>
    </div>

    <label class="mt-3 flex items-center gap-2 text-xs text-text-muted">
      <Icon name="volume" :size="14" />
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        :value="volumePercent"
        :disabled="muted"
        class="flex-1"
        @input="onVolumeInput"
      />
      <span class="w-9 text-right">{{ volumePercent }}%</span>
    </label>

    <button
      type="button"
      class="mt-3 w-full rounded-md px-3 py-1.5 text-sm hover:bg-bg-hover"
      :class="muted ? 'text-danger' : 'text-text'"
      @click="toggleMute"
    >
      {{ muted ? 'Voltar a ouvir' : 'Silenciar só pra mim' }}
    </button>
  </div>
</template>
