<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  clientId: string;
  initials: string;
  hasAvatar: boolean;
  name: string;
}>();

const failed = ref(false);
watch(() => props.clientId, () => {
  failed.value = false;
});
</script>

<template>
  <img
    v-if="hasAvatar && !failed"
    class="avatar"
    :src="`/api/v1/clients/${clientId}/avatar`"
    alt=""
    @error="failed = true"
  />
  <span v-else class="avatar initials" :aria-label="`${name} initials`">{{ initials }}</span>
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
