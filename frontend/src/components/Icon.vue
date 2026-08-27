<script setup lang="ts">
import type { IconName } from '@/lib/icons'

const props = withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 20 })
</script>

<template>
  <svg class="icon" :width="props.size" :height="props.size" aria-hidden="true" focusable="false">
    <use :href="`#npt-${props.name}`" />
  </svg>
</template>

<style scoped>
.icon {
  display: inline-block;
  vertical-align: middle;
}
</style>
