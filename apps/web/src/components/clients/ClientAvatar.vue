<script setup lang="ts">
import { ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    clientId: string;
    initials: string;
    hasAvatar: boolean;
    name: string;
    /** Diameter in pixels. */
    size?: number;
  }>(),
  { size: 40 },
);

const failed = ref(false);
watch(() => props.clientId, () => {
  failed.value = false;
});
</script>

<template>
  <img
    v-if="hasAvatar && !failed"
    class="avatar"
    :style="{ width: `${size}px`, height: `${size}px` }"
    :src="`/api/v1/clients/${clientId}/avatar`"
    alt=""
    @error="failed = true"
  />
  <span v-else class="avatar initials" :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.36)}px` }" aria-hidden="true">{{ initials }}</span>
</template>

<style scoped>
.avatar {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  object-fit: cover;
  background: var(--color-primary-soft);
  color: var(--color-primary-ink);
  display: inline-grid;
  place-items: center;
  font-weight: 700;
  flex-shrink: 0;
}
</style>
