<script setup lang="ts">
import { computed, useId } from 'vue';
import FieldError from './FieldError.vue';

const model = defineModel<string>({ default: '' });

const props = defineProps<{
  label: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  rows?: number;
}>();

const inputId = useId();
const describedBy = computed(() => {
  const ids = [];
  if (props.hint) ids.push(`${inputId}-hint`);
  if (props.error) ids.push(`${inputId}-error`);
  return ids.join(' ') || undefined;
});
</script>

<template>
  <div class="field">
    <label class="field-label" :for="inputId">{{ label }}</label>
    <textarea
      :id="inputId"
      v-model="model"
      class="control"
      :rows="rows ?? 4"
      :placeholder="placeholder"
      :required="required"
      :disabled="disabled"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
    ></textarea>
    <p v-if="hint" :id="`${inputId}-hint`" class="field-hint">{{ hint }}</p>
    <FieldError :id="`${inputId}-error`" :message="error" />
  </div>
</template>
