<script setup lang="ts">
withDefaults(
  defineProps<{
    width?: string;
    height?: string;
    rounded?: boolean;
  }>(),
  {
    width: '100%',
    height: '14px',
    rounded: false,
  },
);
</script>

<template>
  <span class="skeleton" :class="{ 'is-round': rounded }" :style="{ width, height }" aria-hidden="true"></span>
</template>

<style scoped>
.is-round {
  border-radius: 999px;
}
</style>
