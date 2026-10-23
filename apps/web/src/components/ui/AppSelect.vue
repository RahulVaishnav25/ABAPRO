<script setup lang="ts">
import { computed, useId } from 'vue';
import type { SelectOption } from './types';
import FieldError from './FieldError.vue';

const model = defineModel<string>({ default: '' });

const props = defineProps<{
  label: string;
  options: SelectOption[];
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  hideLabel?: boolean;
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
    <label class="field-label" :class="{ 'visually-hidden': hideLabel }" :for="inputId">
      {{ label }}<span v-if="required" class="required-mark" aria-hidden="true">*</span>
    </label>
    <select
      :id="inputId"
      v-model="model"
      class="control"
      :required="required"
      :disabled="disabled"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
    >
      <option v-if="placeholder" disabled value="">{{ placeholder }}</option>
      <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
    </select>
    <p v-if="hint" :id="`${inputId}-hint`" class="field-hint">{{ hint }}</p>
    <FieldError :id="`${inputId}-error`" :message="error" />
  </div>
</template>
