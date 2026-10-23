<script setup lang="ts">
import { useId } from 'vue';
import FieldError from './FieldError.vue';

const model = defineModel<boolean>({ default: false });

defineProps<{
  label: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
}>();

const inputId = useId();
</script>

<template>
  <div class="field">
    <label class="choice" :for="inputId">
      <input :id="inputId" v-model="model" type="checkbox" :disabled="disabled" :aria-invalid="error ? 'true' : undefined" />
      <span>
        {{ label }}
        <span v-if="hint" class="field-hint">{{ hint }}</span>
      </span>
    </label>
    <FieldError :message="error" />
  </div>
</template>
