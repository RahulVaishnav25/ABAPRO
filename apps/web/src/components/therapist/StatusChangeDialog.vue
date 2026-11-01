<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AppButton from '@/components/ui/AppButton.vue';
import AppDialog from '@/components/ui/AppDialog.vue';
import AppTextarea from '@/components/ui/AppTextarea.vue';

const props = defineProps<{
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  saving: boolean;
}>();
const emit = defineEmits<{ confirm: [reason: string]; close: [] }>();

const { t } = useI18n();
const reason = ref('');
const error = ref('');

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      reason.value = '';
      error.value = '';
    }
  },
);

function confirm(): void {
  // The API records a reason with every status change.
  if (reason.value.trim().length < 12) {
    error.value = t('workspace.statusDialog.reasonTooShort');
    return;
  }
  emit('confirm', reason.value.trim());
}
</script>

<template>
  <AppDialog :open="open" :title="title" :description="description" size="sm" @close="emit('close')">
    <AppTextarea v-model="reason" :label="t('workspace.statusDialog.reason')" :rows="3" :error="error" required />
    <template #footer>
      <AppButton type="button" variant="secondary" @click="emit('close')">{{ t('common.cancel') }}</AppButton>
      <AppButton type="button" :loading="saving" @click="confirm">{{ confirmLabel }}</AppButton>
    </template>
  </AppDialog>
</template>
