<script setup lang="ts">
import { useId } from 'vue';
import type { RadioOption } from './types';
import FieldError from './FieldError.vue';

const model = defineModel<string>({ default: '' });

defineProps<{
  label: string;
  name: string;
  options: RadioOption[];
  hint?: string;
  error?: string;
  disabled?: boolean;
}>();

const groupId = useId();
</script>

<template>
  <fieldset class="choice-group" :aria-describedby="error ? `${groupId}-error` : undefined">
    <legend>{{ label }}</legend>
    <label v-for="option in options" :key="option.value" class="choice">
      <input v-model="model" type="radio" :name="name" :value="option.value" :disabled="disabled" />
      <span>{{ option.label }}</span>
    </label>
    <p v-if="hint" class="field-hint">{{ hint }}</p>
    <FieldError :id="`${groupId}-error`" :message="error" />
  </fieldset>
</template>
