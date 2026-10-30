<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue';

export interface ActionMenuItem {
  key: string;
  label: string;
}

const props = defineProps<{ label: string; items: ActionMenuItem[] }>();
const emit = defineEmits<{ select: [key: string] }>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);

function onDocumentClick(event: MouseEvent): void {
  if (root.value && !root.value.contains(event.target as Node)) close();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    close();
    trigger.value?.focus();
  }
}

async function toggle(): Promise<void> {
  if (open.value) {
    close();
    return;
  }
  open.value = true;
  document.addEventListener('mousedown', onDocumentClick);
  document.addEventListener('keydown', onKeydown);
  await nextTick();
  root.value?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
}

function close(): void {
  open.value = false;
  document.removeEventListener('mousedown', onDocumentClick);
  document.removeEventListener('keydown', onKeydown);
}

function choose(key: string): void {
  close();
  emit('select', key);
}

onBeforeUnmount(close);
</script>

<template>
  <div ref="root" class="action-menu">
    <button
      ref="trigger"
      type="button"
      class="trigger"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-label="props.label"
      @click="toggle"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="5" r="1.8" />
        <circle cx="12" cy="12" r="1.8" />
        <circle cx="12" cy="19" r="1.8" />
      </svg>
    </button>
    <div v-if="open" class="menu" role="menu" :aria-label="props.label">
      <button
        v-for="item in props.items"
        :key="item.key"
        type="button"
        role="menuitem"
        class="menu-item"
        @click="choose(item.key)"
      >
        {{ item.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.action-menu {
  position: relative;
}

.trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.trigger:hover,
.trigger[aria-expanded='true'] {
  background: var(--color-surface-muted);
  border-color: var(--color-border);
  color: var(--color-ink);
}

.menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 30;
  min-width: 200px;
  padding: 6px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-md, 0 10px 24px rgba(18, 28, 36, 0.14));
}

.menu-item {
  display: block;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-ink);
  font: inherit;
  font-size: 0.9rem;
  text-align: left;
  cursor: pointer;
}

.menu-item:hover,
.menu-item:focus-visible {
  background: var(--color-primary-soft);
  outline: none;
}
</style>
