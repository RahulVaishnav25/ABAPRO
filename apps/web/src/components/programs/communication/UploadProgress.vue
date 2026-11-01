<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{ progress: number | null }>();
const { t } = useI18n();
</script>

<template>
  <div v-if="progress !== null" class="upload-progress">
    <div
      class="upload-track"
      role="progressbar"
      :aria-label="t('upload.progress')"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="Math.round(progress * 100)"
    >
      <div class="upload-fill" :style="{ inlineSize: `${Math.round(progress * 100)}%` }"></div>
    </div>
    <span class="upload-label">{{ progress < 1 ? t('upload.uploading', { percent: Math.round(progress * 100) }) : t('upload.saving') }}</span>
  </div>
</template>

<style scoped>
.upload-progress {
  display: flex;
  align-items: center;
  gap: 10px;
}

.upload-track {
  flex: 1;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--color-surface-sunken);
}

.upload-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--color-primary);
  transition: inline-size 0.15s;
}

.upload-label {
  min-width: 110px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--color-text-muted);
}
</style>
