<script setup lang="ts">
import AppIcon from '@/components/navigation/AppIcon.vue';
import AppButton from './AppButton.vue';

defineProps<{
  title: string;
  description?: string;
}>();

const emit = defineEmits<{
  retry: [];
}>();
</script>

<template>
  <div class="error-state" role="alert">
    <span class="state-icon" aria-hidden="true"><AppIcon name="alert" :size="22" /></span>
    <h2>{{ title }}</h2>
    <p v-if="description">{{ description }}</p>
    <div class="state-actions">
      <slot name="actions">
        <AppButton variant="secondary" @click="emit('retry')">Try again</AppButton>
      </slot>
    </div>
  </div>
</template>
