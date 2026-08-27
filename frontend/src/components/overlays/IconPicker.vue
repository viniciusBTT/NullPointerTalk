<script setup lang="ts">
import { ref } from 'vue'
import { ROOM_ICON_CATALOG } from '@/lib/roomIcons'

const emit = defineEmits<{ select: [glyph: string] }>()

const visible = ref(false)
const current = ref<string | null>(null)

function open(currentGlyph: string | null): void {
  current.value = currentGlyph
  visible.value = true
}

function close(): void {
  visible.value = false
}

function choose(glyph: string): void {
  close()
  emit('select', glyph)
}

defineExpose({ open, close })
</script>

<template>
  <div v-if="visible" class="fixed inset-0 z-40 grid place-items-center bg-black/75 p-4" @click.self="close">
    <div class="w-full max-w-md rounded-lg bg-bg-panel p-6 shadow-[0_8px_16px_rgba(0,0,0,0.24)]">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-text-strong">Escolher ícone</h2>
        <button type="button" title="Fechar" class="rounded p-1 text-interactive hover:bg-bg-hover" @click="close">✕</button>
      </div>
      <div class="mt-4 grid grid-cols-[repeat(auto-fill,minmax(48px,1fr))] gap-2">
        <button
          v-for="option in ROOM_ICON_CATALOG"
          :key="option.glyph"
          type="button"
          :title="option.label"
          class="rounded-md py-2 text-xl"
          :class="option.glyph === current ? 'bg-accent' : 'hover:bg-bg-hover'"
          @click="choose(option.glyph)"
        >
          {{ option.glyph }}
        </button>
      </div>
    </div>
  </div>
</template>
