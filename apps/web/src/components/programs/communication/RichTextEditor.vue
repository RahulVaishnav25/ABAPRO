<script setup lang="ts">
import { onMounted, ref, useId, watch } from 'vue';
import { useDictation } from '@/lib/dictation';
import FieldError from '@/components/ui/FieldError.vue';

const model = defineModel<string>({ default: '' });
defineProps<{ label: string; error?: string }>();

const editor = ref<HTMLElement | null>(null);
const labelId = useId();

// Basic formatting only; the API removes anything else when the note is saved.
const TOOLS = [
  { command: 'bold', label: 'Bold', text: 'B', style: 'font-weight:800' },
  { command: 'italic', label: 'Italic', text: 'I', style: 'font-style:italic' },
  { command: 'underline', label: 'Underline', text: 'U', style: 'text-decoration:underline' },
  { command: 'insertUnorderedList', label: 'Bulleted list', text: '•', style: '' },
  { command: 'insertOrderedList', label: 'Numbered list', text: '1.', style: '' },
  { command: 'formatBlock', value: 'h3', label: 'Heading', text: 'H', style: 'font-weight:800' },
  { command: 'formatBlock', value: 'p', label: 'Normal text', text: '¶', style: '' },
];

function sync(): void {
  model.value = editor.value?.innerHTML ?? '';
}

function run(command: string, value?: string): void {
  editor.value?.focus();
  document.execCommand(command, false, value);
  sync();
}

/** Puts the caret at the end when the editor has no selection, so dictated text is added after what is there. */
function focusForInsert(): void {
  const element = editor.value;
  if (!element) return;
  const selection = window.getSelection();
  if (document.activeElement !== element || !selection || !element.contains(selection.anchorNode)) {
    element.focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
}

const dictation = useDictation((text) => {
  if (!text) return;
  focusForInsert();
  const before = editor.value?.textContent ?? '';
  document.execCommand('insertText', false, `${before && !/\s$/.test(before) ? ' ' : ''}${text}`);
  sync();
});

/** Pasted content keeps its text but not its formatting, which may carry markup from other apps. */
function onPaste(event: ClipboardEvent): void {
  event.preventDefault();
  document.execCommand('insertText', false, event.clipboardData?.getData('text/plain') ?? '');
  sync();
}

onMounted(() => {
  if (editor.value) editor.value.innerHTML = model.value;
});

// Loading a different note replaces the content; typing does not reach here because it already matches.
watch(model, (value) => {
  if (editor.value && editor.value.innerHTML !== value) editor.value.innerHTML = value;
});
</script>

<template>
  <div class="field">
    <span :id="labelId" class="field-label">{{ label }}</span>
    <div class="rte" :class="{ 'has-error': error }">
      <div class="rte-toolbar" role="toolbar" :aria-labelledby="labelId">
        <button
          v-for="tool in TOOLS"
          :key="tool.label"
          type="button"
          class="rte-tool"
          :title="tool.label"
          :aria-label="tool.label"
          @mousedown.prevent
          @click="run(tool.command, tool.value)"
        >
          <span :style="tool.style">{{ tool.text }}</span>
        </button>
        <span class="rte-spacer"></span>
        <button
          v-if="dictation.supported"
          type="button"
          class="rte-dictate"
          :class="{ 'is-listening': dictation.listening.value }"
          :aria-pressed="dictation.listening.value"
          @mousedown.prevent
          @click="dictation.listening.value ? dictation.stop() : dictation.start()"
        >
          <span class="rte-dot" aria-hidden="true"></span>
          {{ dictation.listening.value ? 'Stop dictation' : 'Dictate' }}
        </button>
      </div>
      <div
        ref="editor"
        class="rte-body"
        contenteditable="true"
        role="textbox"
        aria-multiline="true"
        :aria-labelledby="labelId"
        :aria-invalid="error ? 'true' : undefined"
        data-placeholder="Write the note, or press Dictate and speak."
        @input="sync"
        @blur="sync"
        @paste="onPaste"
      ></div>
    </div>
    <p v-if="dictation.listening.value" class="rte-status" aria-live="polite">
      Listening… <span v-if="dictation.interim.value" class="rte-interim">{{ dictation.interim.value }}</span>
    </p>
    <p v-else-if="!dictation.supported" class="field-hint">Dictation is not available in this browser. Chrome, Edge and Safari support it.</p>
    <p v-else class="field-hint">Dictated text appears where the cursor is, and can be edited like typed text.</p>
    <FieldError :message="dictation.error.value || error" />
  </div>
</template>

<style scoped>
.rte {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 10px);
  background: var(--color-surface);
  overflow: hidden;
}

.rte:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 18%, transparent);
}

.rte.has-error {
  border-color: var(--color-danger, #b42318);
}

.rte-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 6px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-muted);
}

.rte-tool {
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--color-ink);
  cursor: pointer;
}

.rte-tool:hover,
.rte-tool:focus-visible {
  border-color: var(--color-border);
  background: var(--color-surface);
}

.rte-spacer {
  flex: 1;
}

.rte-dictate {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-ink);
  font-weight: 600;
  cursor: pointer;
}

.rte-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-text-muted);
}

.rte-dictate.is-listening {
  border-color: #b42318;
  color: #b42318;
}

.rte-dictate.is-listening .rte-dot {
  background: #b42318;
  animation: pulse 1s ease-in-out infinite;
}

.rte-body {
  min-height: 180px;
  max-height: 360px;
  overflow-y: auto;
  padding: 12px 14px;
  color: var(--color-ink);
  line-height: 1.55;
  outline: none;
}

.rte-body:empty::before {
  content: attr(data-placeholder);
  color: var(--color-text-muted);
}

.rte-body :deep(h3) {
  margin: 8px 0 4px;
  font-size: 1.05rem;
}

.rte-body :deep(p) {
  margin: 0 0 8px;
}

.rte-status {
  margin: 6px 0 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: #b42318;
}

.rte-interim {
  font-weight: 400;
  color: var(--color-text-muted);
}

@keyframes pulse {
  50% {
    opacity: 0.3;
  }
}

@media (prefers-reduced-motion: reduce) {
  .rte-dictate.is-listening .rte-dot {
    animation: none;
  }
}
</style>
