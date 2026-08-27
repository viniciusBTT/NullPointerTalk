<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useIdentityStore } from '@/stores/identity'

const identity = useIdentityStore()
const visible = ref(false)
const name = ref('')
const inputEl = ref<HTMLInputElement | null>(null)

if (!identity.displayName) {
  visible.value = true
}

async function show(current: string | null = null): Promise<void> {
  name.value = current ?? ''
  visible.value = true
  await nextTick()
  inputEl.value?.focus()
  inputEl.value?.select()
}

function submit(): void {
  const trimmed = name.value.trim()
  if (!trimmed) {
    return
  }
  identity.setDisplayName(trimmed)
  visible.value = false
}

defineExpose({ show })
</script>

<template>
  <div v-if="visible" class="fixed inset-0 z-40 grid place-items-center bg-black/75 p-4">
    <form
      class="w-full max-w-sm rounded-lg bg-bg-panel p-6 shadow-[0_8px_16px_rgba(0,0,0,0.24)]"
      @submit.prevent="submit"
    >
      <h2 class="text-lg font-semibold text-text-strong">Como podemos te chamar?</h2>
      <p class="mt-1 text-sm text-text-muted">Sem login, sem senha — só um nome pra identificar você nos canais.</p>
      <input
        ref="inputEl"
        v-model="name"
        type="text"
        maxlength="30"
        placeholder="Seu nome"
        autocomplete="off"
        required
        class="mt-4 w-full rounded-md bg-bg-input px-3 py-2 text-text outline-none focus-visible:outline-2 focus-visible:outline-accent"
      />
      <button
        type="submit"
        class="mt-4 w-full rounded-md bg-accent px-3 py-2 font-medium text-white hover:bg-accent-hover"
      >
        Entrar
      </button>
    </form>
  </div>
</template>
