<script setup lang="ts">
import { computed } from 'vue'
import { colorFor, initialsFor } from '@/lib/avatar'

const props = defineProps<{
  name: string | null | undefined
  /** Semente da cor - passar o stableId, não o nome, pra cor sobreviver a uma troca de nome. */
  seed?: string | null
  /** Omitir para deixar o CSS do container dimensionar (tiles do stage). */
  size?: number | null
}>()

const background = computed(() => colorFor(props.seed ?? props.name))
const initials = computed(() => initialsFor(props.name))
const style = computed(() =>
  props.size
    ? { width: `${props.size}px`, height: `${props.size}px`, fontSize: `${Math.round(props.size * 0.4)}px`, background: background.value }
    : { background: background.value },
)
</script>

<template>
  <div
    class="avatar flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none"
    :style="style"
  >
    {{ initials }}
  </div>
</template>
