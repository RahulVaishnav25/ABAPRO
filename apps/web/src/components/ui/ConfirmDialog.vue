<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import AppButton from './AppButton.vue';
import AppDialog from './AppDialog.vue';

const { t } = useI18n();

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
    confirmLabel: undefined,
    cancelLabel: undefined,
    tone: 'primary',
  },
);

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();
</script>

<template>
  <AppDialog :open="open" :title="title" :description="message" size="sm" @close="emit('cancel')">
    <template #footer>
      <AppButton variant="secondary" @click="emit('cancel')">{{ cancelLabel ?? t('common.cancel') }}</AppButton>
      <AppButton :variant="tone === 'danger' ? 'danger' : 'primary'" @click="emit('confirm')">
        {{ confirmLabel ?? t('common.confirm') }}
      </AppButton>
    </template>
  </AppDialog>
</template>
