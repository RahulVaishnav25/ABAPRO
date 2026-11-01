<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import AppIcon from '@/components/navigation/AppIcon.vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description?: string;
    /** sm for confirmations, md for most forms, lg for graphs, tables and long forms. The body scrolls when tall. */
    size?: 'sm' | 'md' | 'lg';
  }>(),
  { description: undefined, size: 'md' },
);

const emit = defineEmits<{
  close: [];
}>();

const dialogRef = ref<HTMLElement | null>(null);
const titleId = `dialog-title-${Math.random().toString(36).slice(2, 8)}`;
let previousFocus: HTMLElement | null = null;

const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
    return;
  }
  if (event.key !== 'Tab' || !dialogRef.value) {
    return;
  }
  const focusable = [...dialogRef.value.querySelectorAll<HTMLElement>(focusableSelector)].filter(
    (element) => !element.hasAttribute('disabled'),
  );
  if (focusable.length === 0) {
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) {
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      document.addEventListener('keydown', onKeydown);
      document.body.style.overflow = 'hidden';
      await nextTick();
      // Start in the content, not on the close button.
      const initial = dialogRef.value?.querySelector<HTMLElement>(`.dialog-body :is(${focusableSelector}), .dialog-footer :is(${focusableSelector})`);
      (initial ?? dialogRef.value)?.focus();
      return;
    }
    document.removeEventListener('keydown', onKeydown);
    document.body.style.overflow = '';
    previousFocus?.focus();
  },
);

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  document.body.style.overflow = '';
});
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @mousedown.self="emit('close')">
      <div
        ref="dialogRef"
        class="dialog"
        :class="`is-${size}`"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="description ? `${titleId}-description` : undefined"
        tabindex="-1"
      >
        <header class="dialog-header">
          <h2 :id="titleId">{{ title }}</h2>
          <button type="button" class="btn btn-ghost btn-sm btn-icon dialog-close" aria-label="Close" @click="emit('close')">
            <AppIcon name="close" :size="18" />
          </button>
        </header>
        <div class="dialog-body">
          <p v-if="description" :id="`${titleId}-description`" class="dialog-description">{{ description }}</p>
          <slot />
        </div>
        <footer v-if="$slots.footer" class="dialog-footer">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>
