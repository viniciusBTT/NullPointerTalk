<script setup lang="ts">
import { toasts, banners, useUiFeedback } from '@/composables/useUiFeedback'

const { dismissBanner } = useUiFeedback()
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4">
    <div
      v-for="banner in banners"
      :key="banner.id"
      class="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-md bg-bg-float px-4 py-2.5 text-sm text-text shadow-[0_4px_16px_rgba(0,0,0,0.4)]"
    >
      <span class="flex-1">{{ banner.message }}</span>
      <button
        v-if="banner.actionLabel && banner.onAction"
        type="button"
        class="shrink-0 rounded-md bg-accent px-3 py-1 font-medium text-white hover:bg-accent-hover"
        @click="banner.onAction?.()"
      >
        {{ banner.actionLabel }}
      </button>
      <button v-if="banner.dismissible" type="button" class="shrink-0 text-text-muted" @click="dismissBanner(banner.id)">
        ×
      </button>
    </div>

    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="pointer-events-auto w-full max-w-md rounded-md bg-bg-float px-4 py-2.5 text-sm text-text shadow-[0_4px_16px_rgba(0,0,0,0.4)]"
      :class="toast.type === 'error' ? 'border-l-[3px] border-danger' : ''"
    >
      {{ toast.message }}
    </div>
  </div>
</template>
