<script setup lang="ts">
import { ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import AppIcon from '@/components/navigation/AppIcon.vue';
import { formatBytes } from '@/api/communication';
import FieldError from './FieldError.vue';

const files = defineModel<File[]>({ default: () => [] });

const props = withDefaults(
  defineProps<{
    label: string;
    hint?: string;
    accept?: string;
    multiple?: boolean;
    disabled?: boolean;
    maxSizeMb?: number;
  }>(),
  {
    multiple: false,
    disabled: false,
    maxSizeMb: 10,
  },
);

const { t } = useI18n();
const inputId = useId();
const hintId = `${inputId}-hint`;
const error = ref('');
const dragging = ref(false);

function addFiles(list: FileList | null): void {
  if (!list || props.disabled) {
    return;
  }
  const next = [...files.value];
  const maxBytes = props.maxSizeMb * 1024 * 1024;
  for (const file of list) {
    if (file.size > maxBytes) {
      error.value = t('upload.tooLarge', { name: file.name, size: props.maxSizeMb });
      continue;
    }
    error.value = '';
    next.push(file);
  }
  files.value = props.multiple ? next : next.slice(-1);
}

function onDrop(event: DragEvent): void {
  dragging.value = false;
  if (props.disabled) {
    return;
  }
  addFiles(event.dataTransfer?.files ?? null);
}

function onDragLeave(event: DragEvent): void {
  // Moving over a child element also fires dragleave; only clear when the pointer leaves the zone.
  const zone = event.currentTarget as HTMLElement;
  if (!zone.contains(event.relatedTarget as Node | null)) dragging.value = false;
}

function removeFile(index: number): void {
  files.value = files.value.filter((_, fileIndex) => fileIndex !== index);
}
</script>

<template>
  <div class="field">
    <span class="field-label">{{ label }}</span>
    <div
      class="dropzone"
      :class="{ 'is-disabled': disabled, 'is-dragging': dragging }"
      @dragover.prevent="dragging = !disabled"
      @dragleave="onDragLeave"
      @drop.prevent="onDrop"
    >
      <span class="dropzone-icon" aria-hidden="true"><AppIcon name="upload" :size="22" /></span>
      <p v-if="disabled" class="dropzone-text">{{ t('upload.disabled') }}</p>
      <p v-else-if="dragging" class="dropzone-text">{{ t('upload.release') }}</p>
      <p v-else class="dropzone-text">
        {{ multiple ? t('upload.dropMany') : t('upload.drop') }}
        <label class="dropzone-choose" :for="inputId">{{ multiple ? t('upload.chooseMany') : t('upload.choose') }}</label>
      </p>
      <p v-if="hint" :id="hintId" class="dropzone-hint">{{ hint }}</p>
      <input
        :id="inputId"
        class="visually-hidden"
        type="file"
        :accept="accept"
        :multiple="multiple"
        :disabled="disabled"
        :aria-label="label"
        :aria-describedby="hint ? hintId : undefined"
        @change="addFiles(($event.target as HTMLInputElement).files); ($event.target as HTMLInputElement).value = ''"
      />
    </div>
    <ul v-if="files.length" class="file-chips">
      <li v-for="(file, index) in files" :key="`${file.name}-${index}`" class="file-chip">
        <AppIcon name="file" :size="16" class="file-chip-icon" />
        <span class="file-chip-name">{{ file.name }}</span>
        <span class="file-chip-size">{{ formatBytes(file.size) }}</span>
        <button type="button" class="file-chip-remove" :disabled="disabled" :aria-label="t('upload.remove', { name: file.name })" @click="removeFile(index)">
          <AppIcon name="close" :size="14" />
        </button>
      </li>
    </ul>
    <FieldError :message="error" />
  </div>
</template>

<style scoped>
.dropzone {
  display: grid;
  justify-items: center;
  gap: 6px;
  padding: var(--space-5) var(--space-4);
  border: 1.5px dashed var(--color-border-strong);
  border-radius: var(--radius-lg);
  background: var(--color-surface-muted);
  text-align: center;
  transition: border-color var(--transition), background-color var(--transition);
}

.dropzone:hover,
.dropzone.is-dragging,
.dropzone:has(input:focus-visible) {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}

.dropzone:has(input:focus-visible) {
  box-shadow: var(--focus);
}

.dropzone.is-disabled {
  opacity: 0.7;
}

.dropzone-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--color-surface);
  color: var(--color-primary);
  box-shadow: var(--shadow-xs);
}

.dropzone-text {
  color: var(--color-ink);
  font-size: var(--text-sm);
  font-weight: 500;
}

.dropzone-choose {
  color: var(--color-primary-ink);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.is-disabled .dropzone-choose {
  cursor: not-allowed;
}

.dropzone-hint {
  max-width: 46ch;
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}

.file-chips {
  display: grid;
  gap: 6px;
  margin: var(--space-2) 0 0;
  padding: 0;
  list-style: none;
}

.file-chip {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 6px 6px 6px var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  font-size: var(--text-sm);
}

.file-chip-icon {
  flex: none;
  color: var(--color-primary);
}

.file-chip-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--color-ink);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-chip-size {
  flex: none;
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}

.file-chip-remove {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.file-chip-remove:hover {
  background: var(--color-surface-sunken);
  color: var(--color-ink);
}
</style>
