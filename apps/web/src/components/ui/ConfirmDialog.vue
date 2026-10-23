<script setup lang="ts">
import AppButton from './AppButton.vue';
import AppDialog from './AppDialog.vue';

withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: 'primary' | 'danger';
  }>(),
  {
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    tone: 'primary',
  },
);

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();
</script>

<template>
  <AppDialog :open="open" :title="title" :description="message" @close="emit('cancel')">
    <template #footer>
      <AppButton variant="secondary" @click="emit('cancel')">{{ cancelLabel }}</AppButton>
      <AppButton :variant="tone === 'danger' ? 'danger' : 'primary'" @click="emit('confirm')">
        {{ confirmLabel }}
      </AppButton>
    </template>
  </AppDialog>
</template>
