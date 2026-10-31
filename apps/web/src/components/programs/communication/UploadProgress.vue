<script setup lang="ts">
defineProps<{ progress: number | null }>();
</script>

<template>
  <div v-if="progress !== null" class="upload-progress">
    <div
      class="upload-track"
      role="progressbar"
      aria-label="Upload progress"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="Math.round(progress * 100)"
    >
      <div class="upload-fill" :style="{ width: `${Math.round(progress * 100)}%` }"></div>
    </div>
    <span class="upload-label">{{ progress < 1 ? `Uploading ${Math.round(progress * 100)}%` : 'Saving…' }}</span>
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
  background: var(--color-surface-muted);
}

.upload-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--color-primary);
  transition: width 0.15s;
}

.upload-label {
  min-width: 110px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--color-text-muted);
}
</style>
