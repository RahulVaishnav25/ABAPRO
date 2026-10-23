<script setup lang="ts">
import { ref } from 'vue';
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

const error = ref('');

function addFiles(list: FileList | null): void {
  if (!list || props.disabled) {
    return;
  }
  const next = [...files.value];
  const maxBytes = props.maxSizeMb * 1024 * 1024;
  for (const file of list) {
    if (file.size > maxBytes) {
      error.value = `${file.name} is larger than ${props.maxSizeMb} MB.`;
      continue;
    }
    error.value = '';
    next.push(file);
  }
  files.value = props.multiple ? next : next.slice(-1);
}

function onDrop(event: DragEvent): void {
  if (props.disabled) {
    return;
  }
  addFiles(event.dataTransfer?.files ?? null);
}

function removeFile(index: number): void {
  files.value = files.value.filter((_, fileIndex) => fileIndex !== index);
}
</script>

<template>
  <div class="field">
    <span class="field-label" :id="`${label}-label`">{{ label }}</span>
    <div
      class="upload"
      :class="{ 'is-disabled': disabled }"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <p>{{ disabled ? 'Uploads are disabled.' : 'Drag a file here or choose one from your device.' }}</p>
      <p v-if="hint" class="field-hint">{{ hint }}</p>
      <label class="btn btn-secondary" :class="{ 'is-disabled': disabled }">
        Choose file
        <input
          class="visually-hidden"
          type="file"
          :accept="accept"
          :multiple="multiple"
          :disabled="disabled"
          @change="addFiles(($event.target as HTMLInputElement).files)"
        />
      </label>
      <ul v-if="files.length" class="upload-list">
        <li v-for="(file, index) in files" :key="`${file.name}-${index}`">
          <span>{{ file.name }}</span>
          <button type="button" class="btn btn-ghost btn-sm" :disabled="disabled" @click="removeFile(index)">
            Remove
          </button>
        </li>
      </ul>
    </div>
    <FieldError :message="error" />
  </div>
</template>

<style scoped>
.upload {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

label.btn {
  position: relative;
}
</style>
