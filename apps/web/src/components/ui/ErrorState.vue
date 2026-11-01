<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import AppIcon from '@/components/navigation/AppIcon.vue';
import AppButton from './AppButton.vue';

const { t } = useI18n();

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
        <AppButton variant="secondary" @click="emit('retry')">{{ t('common.tryAgain') }}</AppButton>
      </slot>
    </div>
  </div>
</template>
