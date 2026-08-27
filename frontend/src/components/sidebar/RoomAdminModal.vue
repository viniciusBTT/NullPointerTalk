<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { usePresenceStore } from '@/stores/presence'
import { createRoom, updateRoom, deleteRoom } from '@/api/rooms'
import { ApiError } from '@/api/http'
import { useUiFeedback } from '@/composables/useUiFeedback'
import IconPicker from '@/components/overlays/IconPicker.vue'

const presence = usePresenceStore()
const { showToast } = useUiFeedback()

const visible = ref(false)
const editingRoomId = ref<string | null>(null)
const idValue = ref('')
const nameValue = ref('')
const iconValue = ref('')
const errorMessage = ref('')
const idInputEl = ref<HTMLInputElement | null>(null)
const nameInputEl = ref<HTMLInputElement | null>(null)
const iconPickerEl = ref<InstanceType<typeof IconPicker> | null>(null)

const title = () => (editingRoomId.value === null ? 'Nova sala' : `Editar "${nameValue.value}"`)
const submitLabel = () => (editingRoomId.value === null ? 'Criar' : 'Salvar')

async function openCreate(): Promise<void> {
  editingRoomId.value = null
  idValue.value = ''
  nameValue.value = ''
  iconValue.value = ''
  errorMessage.value = ''
  visible.value = true
  await nextTick()
  nameInputEl.value?.focus()
}

async function openEdit(roomId: string): Promise<void> {
  const room = presence.roomsById.get(roomId)
  if (!room) return
  editingRoomId.value = roomId
  idValue.value = room.id
  nameValue.value = room.name
  iconValue.value = room.icon
  errorMessage.value = ''
  visible.value = true
  await nextTick()
  nameInputEl.value?.focus()
}

function close(): void {
  visible.value = false
}

function openIconPicker(): void {
  iconPickerEl.value?.open(iconValue.value || null)
}

function onIconSelected(glyph: string): void {
  iconValue.value = glyph
}

async function submit(): Promise<void> {
  errorMessage.value = ''
  // O campo de icone e' readonly - navegadores isentam campos readonly do "required"
  // nativo, entao a validacao precisa ser manual (mesma regra do room-admin.js original).
  if (!iconValue.value.trim()) {
    errorMessage.value = 'Escolha um ícone para a sala.'
    return
  }
  const isCreate = editingRoomId.value === null
  try {
    if (isCreate) {
      await createRoom({ id: idValue.value.trim(), name: nameValue.value.trim(), icon: iconValue.value.trim() })
    } else {
      await updateRoom(editingRoomId.value!, { name: nameValue.value.trim(), icon: iconValue.value.trim() })
    }
    // A linha da sidebar so atualiza via /topic/room-catalog (mesmo caminho pra "eu
    // mudei" e "outra aba mudou") - aqui so fecha o modal.
    close()
  } catch (error) {
    errorMessage.value = error instanceof ApiError ? error.message : 'Falha de rede ao salvar a sala.'
  }
}

async function remove(roomId: string): Promise<void> {
  const room = presence.roomsById.get(roomId)
  if (!window.confirm(`Apagar a sala "${room?.name ?? roomId}"? Isso remove o histórico de chat dela.`)) {
    return
  }
  try {
    await deleteRoom(roomId)
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Falha ao apagar a sala.', { type: 'error' })
  }
}

defineExpose({ openCreate, openEdit, remove })
</script>

<template>
  <div v-if="visible" class="fixed inset-0 z-40 grid place-items-center bg-black/75 p-4" @click.self="close">
    <form class="w-full max-w-sm rounded-lg bg-bg-panel p-6 shadow-[0_8px_16px_rgba(0,0,0,0.24)]" @submit.prevent="submit">
      <h2 class="text-lg font-semibold text-text-strong">{{ title() }}</h2>

      <label class="mt-4 block text-sm">
        <span class="text-text-muted">Identificador (id)</span>
        <input
          ref="idInputEl"
          v-model="idValue"
          type="text"
          maxlength="32"
          pattern="[a-z0-9\-]{1,32}"
          placeholder="ex: matematica"
          autocomplete="off"
          required
          :disabled="editingRoomId !== null"
          class="mt-1 w-full rounded-md bg-bg-input px-3 py-2 text-text disabled:opacity-50"
        />
      </label>

      <label class="mt-3 block text-sm">
        <span class="text-text-muted">Nome</span>
        <input
          ref="nameInputEl"
          v-model="nameValue"
          type="text"
          maxlength="60"
          placeholder="Nome da sala"
          autocomplete="off"
          required
          class="mt-1 w-full rounded-md bg-bg-input px-3 py-2 text-text"
        />
      </label>

      <label class="mt-3 block text-sm">
        <span class="text-text-muted">Ícone (emoji)</span>
        <div class="mt-1 flex gap-2">
          <input
            v-model="iconValue"
            type="text"
            maxlength="8"
            placeholder="🗨️"
            autocomplete="off"
            required
            readonly
            class="w-16 rounded-md bg-bg-input px-3 py-2 text-center text-text"
          />
          <button type="button" class="rounded-md bg-bg-elevated px-3 py-2 text-sm text-text hover:bg-bg-hover" @click="openIconPicker">
            Escolher ícone
          </button>
        </div>
      </label>

      <p v-if="errorMessage" class="mt-3 text-sm text-danger">{{ errorMessage }}</p>

      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="rounded-md px-4 py-1.5 text-sm text-text hover:bg-bg-hover" @click="close">Cancelar</button>
        <button type="submit" class="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-hover">
          {{ submitLabel() }}
        </button>
      </div>
    </form>

    <IconPicker ref="iconPickerEl" @select="onIconSelected" />
  </div>
</template>
