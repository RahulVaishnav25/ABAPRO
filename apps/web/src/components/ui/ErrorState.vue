<script setup lang="ts">
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
    <h2>{{ title }}</h2>
    <p v-if="description">{{ description }}</p>
    <div class="state-actions">
      <slot name="actions">
        <AppButton variant="secondary" @click="emit('retry')">Try again</AppButton>
      </slot>
    </div>
  </div>
</template>
