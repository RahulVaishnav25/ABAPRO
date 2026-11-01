<script setup lang="ts">
import AppIcon from '@/components/navigation/AppIcon.vue';

withDefaults(
  defineProps<{
    title: string;
    description?: string;
    /** An AppIcon name shown above the title. */
    icon?: string;
  }>(),
  { icon: 'inbox' },
);
</script>

<template>
  <div class="empty-state">
    <span class="state-icon" aria-hidden="true"><AppIcon :name="icon" :size="22" /></span>
    <h2>{{ title }}</h2>
    <p v-if="description">{{ description }}</p>
    <div v-if="$slots.actions" class="state-actions">
      <slot name="actions" />
    </div>
  </div>
</template>
