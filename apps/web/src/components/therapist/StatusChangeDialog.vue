<script setup lang="ts">
import { ref, watch } from 'vue';
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
    error.value = 'Explain the change in at least 12 characters.';
    return;
  }
  emit('confirm', reason.value.trim());
}
</script>

<template>
  <AppDialog :open="open" :title="title" :description="description" @close="emit('close')">
    <AppTextarea v-model="reason" label="Reason for the change" :rows="3" :error="error" required />
    <template #footer>
      <AppButton type="button" variant="secondary" @click="emit('close')">Cancel</AppButton>
      <AppButton type="button" :loading="saving" @click="confirm">{{ confirmLabel }}</AppButton>
    </template>
  </AppDialog>
</template>
