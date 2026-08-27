<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { PubView } from '@/stores/voice'
import { qualityLabel } from '@/stores/voice'
import Icon from '@/components/Icon.vue'
import Avatar from '@/components/Avatar.vue'

export interface TileView {
  key: string
  kind: 'video' | 'avatar'
  identity: string
  stableId: string
  name: string
  isLocal: boolean
  source: string
  speaking: boolean
  quality: string
  micOn: boolean
  listeningAlong: boolean
  pub: PubView | null
}

const props = defineProps<{ view: TileView; focused: boolean }>()
const emit = defineEmits<{ click: [event: MouseEvent] }>()

const videoEl = ref<HTMLVideoElement | null>(null)
let attachedPub: PubView | null = null

onMounted(() => {
  if (props.view.kind === 'video' && videoEl.value && props.view.pub) {
    props.view.pub.attach(videoEl.value)
    attachedPub = props.view.pub
  }
})

// Nunca reanexa a track quando o view muda (badges/quality/speaking) - so guarda a
// referencia mais recente do pub pra usar no detach, exatamente como destroyTile no
// tile.js original.
watch(
  () => props.view.pub,
  (pub) => {
    if (pub) attachedPub = pub
  },
)

onUnmounted(() => {
  if (videoEl.value && attachedPub) {
    try {
      attachedPub.detach(videoEl.value)
    } catch {
      // a track pode ja ter sido encerrada do outro lado
    }
  }
})

const mirror = computed(() => props.view.isLocal && props.view.source === 'camera')
const isScreen = computed(() => props.view.source === 'screen_share')

const label = computed(() => {
  const name = props.view.isLocal ? `${props.view.name} (você)` : props.view.name
  return isScreen.value ? `${name} — tela` : name
})

function onClick(event: MouseEvent): void {
  emit('click', event)
}
</script>

<template>
  <div
    class="tile relative overflow-hidden rounded-lg bg-bg-tile shadow-[inset_0_0_0_0_transparent] transition-shadow hover:shadow-[inset_0_0_0_2px_var(--color-bg-elevated)]"
    :class="[view.speaking && 'shadow-[inset_0_0_0_3px_var(--color-ok)]!', focused ? 'order-first' : '']"
    :style="!focused ? 'aspect-ratio:16/9' : undefined"
    @click="onClick"
  >
    <video
      v-if="view.kind === 'video'"
      ref="videoEl"
      autoplay
      playsinline
      muted
      class="h-full w-full"
      :class="[isScreen ? 'object-contain' : 'object-cover', mirror && '-scale-x-100']"
    />
    <div v-else class="grid h-full w-full place-items-center">
      <Avatar :name="view.name" :seed="view.stableId" :size="null" class="h-[45%] max-h-24 min-h-9 w-[45%] max-w-24 min-w-9" />
    </div>

    <div class="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
      <span class="truncate text-sm text-white">{{ label }}</span>
      <span class="flex items-center gap-1">
        <span v-if="view.source !== 'screen_share' && !view.micOn" class="rounded bg-black/65 p-1 text-danger" title="Microfone desligado">
          <Icon name="mic-off" :size="14" />
        </span>
        <span v-if="view.source !== 'screen_share' && view.listeningAlong" class="rounded bg-black/65 p-1 text-interactive" title="Compartilhando áudio de uma aba">
          <Icon name="music" :size="14" />
        </span>
      </span>
    </div>

    <span
      v-if="view.quality === 'poor' || view.quality === 'lost'"
      class="absolute top-1.5 right-1.5 rounded bg-black/55 p-1"
      :class="view.quality === 'poor' ? 'text-warn' : 'text-danger'"
      :title="`Conexão: ${qualityLabel(view.quality)}`"
    >
      <Icon name="signal" :size="14" />
    </span>
  </div>
</template>
