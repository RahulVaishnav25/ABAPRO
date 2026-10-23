<script setup lang="ts">
import { computed, useId } from 'vue';
import FieldError from './FieldError.vue';

const model = defineModel<string>({ default: '' });

const props = withDefaults(
  defineProps<{
    label: string;
    type?: string;
    placeholder?: string;
    hint?: string;
    error?: string;
    required?: boolean;
    disabled?: boolean;
    autocomplete?: string;
    hideLabel?: boolean;
  }>(),
  {
    type: 'text',
    required: false,
    disabled: false,
    hideLabel: false,
  },
);

const inputId = useId();
const hintId = computed(() => (props.hint ? `${inputId}-hint` : undefined));
const errorId = computed(() => (props.error ? `${inputId}-error` : undefined));
const describedBy = computed(() => [hintId.value, errorId.value].filter(Boolean).join(' ') || undefined);
</script>

<template>
  <div class="field">
    <label class="field-label" :class="{ 'visually-hidden': hideLabel }" :for="inputId">
      {{ label }}<span v-if="required" class="required-mark" aria-hidden="true">*</span>
    </label>
    <input
      :id="inputId"
      v-model="model"
      class="control"
      :type="type"
      :placeholder="placeholder"
      :required="required"
      :disabled="disabled"
      :autocomplete="autocomplete"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
    />
    <p v-if="hint" :id="hintId" class="field-hint">{{ hint }}</p>
    <FieldError :id="errorId" :message="error" />
  </div>
</template>
