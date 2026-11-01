<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue';
import type { SelectOption } from './types';
import FieldError from './FieldError.vue';

const model = defineModel<string>({ default: '' });

const props = withDefaults(
  defineProps<{
    label: string;
    options: Array<string | SelectOption>;
    placeholder?: string;
    hint?: string;
    error?: string;
    required?: boolean;
    disabled?: boolean;
    hideLabel?: boolean;
    multiline?: boolean;
    rows?: number;
  }>(),
  {
    required: false,
    disabled: false,
    hideLabel: false,
    multiline: false,
    rows: 2,
  },
);

const inputId = useId();
const listboxId = computed(() => `${inputId}-listbox`);
const hintId = computed(() => (props.hint ? `${inputId}-hint` : undefined));
const errorId = computed(() => (props.error ? `${inputId}-error` : undefined));
const describedBy = computed(() => [hintId.value, errorId.value].filter(Boolean).join(' ') || undefined);

const rootRef = ref<HTMLElement | null>(null);
const isOpen = ref(false);
const highlightedIndex = ref(-1);

const normalizedOptions = computed<SelectOption[]>(() =>
  props.options.map((opt) => (typeof opt === 'string' ? { value: opt, label: opt } : opt)),
);

const isKnownOption = computed(() =>
  normalizedOptions.value.some((o) => o.value === model.value),
);

const selectedDropdownValue = computed(() =>
  isKnownOption.value ? model.value : '',
);

function onDropdownChange(event: Event): void {
  const target = event.target as HTMLSelectElement;
  if (target.value) {
    model.value = target.value;
  }
}

function toggleDropdown(): void {
  if (props.disabled) return;
  isOpen.value = !isOpen.value;
  if (isOpen.value) {
    highlightedIndex.value = normalizedOptions.value.findIndex((o) => o.value === model.value);
  }
}

function openDropdown(): void {
  if (props.disabled || isOpen.value) return;
  isOpen.value = true;
  highlightedIndex.value = normalizedOptions.value.findIndex((o) => o.value === model.value);
}

function closeDropdown(): void {
  isOpen.value = false;
  highlightedIndex.value = -1;
}

function selectOption(value: string): void {
  model.value = value;
  closeDropdown();
}

function onKeydown(e: KeyboardEvent): void {
  if (props.disabled) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (!isOpen.value) {
      openDropdown();
    } else if (normalizedOptions.value.length > 0) {
      highlightedIndex.value = (highlightedIndex.value + 1) % normalizedOptions.value.length;
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (!isOpen.value) {
      openDropdown();
    } else if (normalizedOptions.value.length > 0) {
      highlightedIndex.value =
        (highlightedIndex.value - 1 + normalizedOptions.value.length) % normalizedOptions.value.length;
    }
  } else if (e.key === 'Enter') {
    if (isOpen.value && highlightedIndex.value >= 0 && highlightedIndex.value < normalizedOptions.value.length) {
      e.preventDefault();
      selectOption(normalizedOptions.value[highlightedIndex.value].value);
    }
  } else if (e.key === 'Escape') {
    if (isOpen.value) {
      e.preventDefault();
      closeDropdown();
    }
  }
}

function handleClickOutside(event: MouseEvent): void {
  if (rootRef.value && !rootRef.value.contains(event.target as Node)) {
    closeDropdown();
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleClickOutside);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleClickOutside);
});
</script>

<template>
  <div ref="rootRef" class="field">
    <!-- Multi-line text area mode with integrated dropdown -->
    <template v-if="multiline">
      <div class="field-header">
        <label class="field-label" :class="{ 'visually-hidden': hideLabel }" :for="inputId">
          {{ label }}<span v-if="required" class="required-mark" aria-hidden="true">*</span>
        </label>
        <div class="dropdown-wrapper">
          <label :for="`${inputId}-select`" class="dropdown-label">Preset:</label>
          <select
            :id="`${inputId}-select`"
            class="dropdown-select"
            :value="selectedDropdownValue"
            :disabled="disabled"
            @change="onDropdownChange"
          >
            <option value="" disabled>{{ isKnownOption ? 'Select option' : 'Custom option' }}</option>
            <option v-for="option in normalizedOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>
      </div>
      <textarea
        :id="inputId"
        v-model="model"
        class="control"
        :rows="rows"
        :placeholder="placeholder || 'Select an option from the dropdown or enter custom text...'"
        :required="required"
        :disabled="disabled"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
      ></textarea>
    </template>

    <!-- Single-line text input mode with integrated combobox popup -->
    <template v-else>
      <label class="field-label" :class="{ 'visually-hidden': hideLabel }" :for="inputId">
        {{ label }}<span v-if="required" class="required-mark" aria-hidden="true">*</span>
      </label>
      <div class="combobox-wrapper">
        <input
          :id="inputId"
          v-model="model"
          type="text"
          class="control combobox-input"
          :placeholder="placeholder"
          :required="required"
          :disabled="disabled"
          :aria-invalid="error ? 'true' : undefined"
          :aria-describedby="describedBy"
          :aria-expanded="isOpen"
          :aria-controls="listboxId"
          autocomplete="off"
          role="combobox"
          @keydown="onKeydown"
        />
        <button
          type="button"
          class="combobox-toggle"
          :disabled="disabled"
          tabindex="-1"
          aria-label="Toggle options"
          @click="toggleDropdown"
        >
          <svg
            class="chevron"
            :class="{ open: isOpen }"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M5 7.5 10 12.5 15 7.5" />
          </svg>
        </button>
        <ul
          v-if="isOpen && normalizedOptions.length > 0"
          :id="listboxId"
          class="combobox-menu"
          role="listbox"
        >
          <li
            v-for="(option, idx) in normalizedOptions"
            :key="option.value"
            role="option"
            :aria-selected="model === option.value"
            class="combobox-item"
            :class="{ active: highlightedIndex === idx, selected: model === option.value }"
            @mousedown.prevent="selectOption(option.value)"
            @mouseenter="highlightedIndex = idx"
          >
            {{ option.label }}
          </li>
        </ul>
      </div>
    </template>

    <p v-if="hint" :id="hintId" class="field-hint">{{ hint }}</p>
    <FieldError :id="errorId" :message="error" />
  </div>
</template>

<style scoped>
.field-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dropdown-wrapper {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.dropdown-label {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.dropdown-select {
  padding: 4px 26px 4px 10px;
  font-size: 0.85rem;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-ink);
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%23556575' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 7.5 10 12.5 15 7.5'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  background-size: 14px 14px;
  cursor: pointer;
}

[dir='rtl'] .dropdown-select {
  background-position: left 8px center;
}

.dropdown-select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.combobox-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}

.combobox-input {
  width: 100%;
  padding-inline-end: 36px;
}

.combobox-toggle {
  position: absolute;
  inset-inline-end: 6px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--color-text-muted);
  border-radius: var(--radius-sm);
  padding: 0;
}

.combobox-toggle:hover:not(:disabled) {
  color: var(--color-ink);
  background: var(--color-surface-hover, rgba(0, 0, 0, 0.05));
}

.combobox-toggle:focus-visible {
  outline: 2px solid var(--color-primary);
}

.chevron {
  width: 16px;
  height: 16px;
  transition: transform 0.15s ease;
}

.chevron.open {
  transform: rotate(180deg);
}

.combobox-menu {
  position: absolute;
  top: calc(100% + 4px);
  inset-inline-start: 0;
  inset-inline-end: 0;
  z-index: 50;
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  list-style: none;
  padding: 4px 0;
  margin: 0;
  max-height: 200px;
  overflow-y: auto;
}

.combobox-item {
  padding: 8px 12px;
  cursor: pointer;
  font-size: 0.95rem;
  color: var(--color-ink);
  transition: background 0.1s ease;
}

.combobox-item:hover,
.combobox-item.active {
  background: var(--color-surface-hover, rgba(0, 0, 0, 0.06));
}

.combobox-item.selected {
  font-weight: 600;
  color: var(--color-primary);
}
</style>
