<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useVoiceStore } from '@/stores/voice'
import ParticipantTile, { type TileView } from './ParticipantTile.vue'

const emit = defineEmits<{ participantClick: [identity: string, anchor: HTMLElement] }>()
const voice = useVoiceStore()
const focusedKey = ref<string | null>(null)

const views = computed<TileView[]>(() => {
  const byIdentity = new Map(voice.participants.map((p) => [p.identity, p]))
  const result: TileView[] = voice.videoPubs.map((pub) => {
    const participant = byIdentity.get(pub.identity)
    return {
      key: pub.key,
      kind: 'video',
      identity: pub.identity,
      stableId: pub.stableId,
      name: pub.name,
      isLocal: pub.isLocal,
      source: pub.source,
      speaking: participant?.speaking ?? false,
      quality: participant?.quality ?? 'unknown',
      micOn: participant?.micOn ?? false,
      listeningAlong: participant?.listeningAlong ?? false,
      pub,
    }
  })
  // So mostra avatar de quem não tem vídeo SE já existe pelo menos um tile de vídeo -
  // numa chamada 100% voz, a sidebar já lista todo mundo; abrir o stage cheio de círculos
  // seria inútil (stage.js original).
  if (result.length > 0) {
    const withVideo = new Set(result.map((v) => v.identity))
    for (const participant of voice.participants) {
      if (!withVideo.has(participant.identity)) {
        result.push({
          key: `${participant.identity}|avatar`,
          kind: 'avatar',
          identity: participant.identity,
          stableId: participant.stableId,
          name: participant.name,
          isLocal: participant.isLocal,
          source: 'avatar',
          speaking: participant.speaking,
          quality: participant.quality,
          micOn: participant.micOn,
          listeningAlong: participant.listeningAlong,
          pub: null,
        })
      }
    }
  }
  return result
})

function weight(view: TileView): number {
  if (view.source === 'screen_share') return 0
  if (view.kind === 'video' && view.speaking) return 1
  if (view.kind === 'video') return 2
  return 3
}

const sorted = computed(() =>
  [...views.value].sort((a, b) => weight(a) - weight(b) || a.key.localeCompare(b.key)),
)

const hasVideo = computed(() => voice.videoPubs.length > 0)

watch(sorted, (list) => {
  if (focusedKey.value && !list.some((v) => v.key === focusedKey.value)) {
    focusedKey.value = null
  }
})

function onTileClick(view: TileView, event: MouseEvent): void {
  if (view.kind === 'avatar') {
    emit('participantClick', view.identity, event.currentTarget as HTMLElement)
    return
  }
  focusedKey.value = focusedKey.value === view.key ? null : view.key
}

defineExpose({ hasVideo })
</script>

<template>
  <section
    v-if="hasVideo"
    class="min-h-0 gap-2 overflow-y-auto p-2"
    :class="
      focusedKey
        ? 'flex flex-wrap content-start'
        : 'grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] auto-rows-[minmax(0,1fr)]'
    "
  >
    <ParticipantTile
      v-for="view in sorted"
      :key="view.key"
      :view="view"
      :focused="focusedKey === view.key"
      :class="
        focusedKey
          ? view.key === focusedKey
            ? 'order-first h-[calc(100%-158px)] min-h-[180px] flex-[1_0_100%]! [aspect-ratio:auto]!'
            : 'flex-[0_0_140px]!'
          : ''
      "
      @click="onTileClick(view, $event)"
    />
  </section>
</template>
