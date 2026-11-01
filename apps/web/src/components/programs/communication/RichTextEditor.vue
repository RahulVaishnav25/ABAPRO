<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDictation } from '@/lib/dictation';
import AppIcon from '@/components/navigation/AppIcon.vue';
import FieldError from '@/components/ui/FieldError.vue';

const model = defineModel<string>({ default: '' });
defineProps<{ label: string; error?: string }>();

const { t } = useI18n();
const editor = ref<HTMLElement | null>(null);
const labelId = useId();
const hintId = useId();

// Basic formatting only; the API removes anything else when the note is saved.
// Grouped: character styles, lists, then block type. Toggles report whether they apply at the cursor.
interface Tool {
  command: string;
  value?: string;
  key: string;
  text: string;
  style: string;
  toggle: boolean;
}
const GROUPS: Tool[][] = [
  [
    { command: 'bold', key: 'bold', text: 'B', style: 'font-weight:800', toggle: true },
    { command: 'italic', key: 'italic', text: 'I', style: 'font-style:italic;font-family:Georgia,serif', toggle: true },
    { command: 'underline', key: 'underline', text: 'U', style: 'text-decoration:underline', toggle: true },
  ],
  [
    { command: 'insertUnorderedList', key: 'bullets', text: '•', style: 'font-size:1.2em', toggle: true },
    { command: 'insertOrderedList', key: 'numbers', text: '1.', style: '', toggle: true },
  ],
  [
    { command: 'formatBlock', value: 'h3', key: 'heading', text: 'H', style: 'font-weight:800', toggle: false },
    { command: 'formatBlock', value: 'p', key: 'normal', text: '¶', style: '', toggle: false },
  ],
];
const active = ref(new Set<string>());

/** Which character styles and lists apply where the cursor is. */
function refreshActive(): void {
  const element = editor.value;
  const selection = window.getSelection();
  if (!element || !selection || !element.contains(selection.anchorNode)) return;
  const next = new Set<string>();
  for (const tool of GROUPS.flat()) {
    if (tool.toggle && document.queryCommandState(tool.command)) next.add(tool.command);
  }
  active.value = next;
}

function sync(): void {
  model.value = editor.value?.innerHTML ?? '';
}

function run(command: string, value?: string): void {
  editor.value?.focus();
  document.execCommand(command, false, value);
  sync();
  refreshActive();
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
  document.addEventListener('selectionchange', refreshActive);
});

onBeforeUnmount(() => document.removeEventListener('selectionchange', refreshActive));

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
        <div v-for="(group, index) in GROUPS" :key="index" class="rte-group">
          <button
            v-for="tool in group"
            :key="tool.key"
            type="button"
            class="rte-tool"
            :class="{ 'is-active': active.has(tool.command) }"
            :title="t(`comms.editor.${tool.key}`)"
            :aria-label="t(`comms.editor.${tool.key}`)"
            :aria-pressed="tool.toggle ? active.has(tool.command) : undefined"
            @mousedown.prevent
            @click="run(tool.command, tool.value)"
          >
            <span :style="tool.style" aria-hidden="true">{{ tool.text }}</span>
          </button>
        </div>
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
          <AppIcon name="mic" :size="16" />
          {{ dictation.listening.value ? t('comms.editor.stopDictation') : t('comms.editor.dictate') }}
        </button>
      </div>
      <div
        ref="editor"
        class="rte-body"
        contenteditable="true"
        dir="auto"
        role="textbox"
        aria-multiline="true"
        :aria-labelledby="labelId"
        :aria-describedby="hintId"
        :aria-invalid="error ? 'true' : undefined"
        :data-placeholder="t('comms.editor.placeholder')"
        @input="sync"
        @blur="sync"
        @paste="onPaste"
        @keyup="refreshActive"
        @mouseup="refreshActive"
      ></div>
    </div>
    <p v-if="dictation.listening.value" :id="hintId" class="rte-status" aria-live="polite">
      <span class="rte-dot" aria-hidden="true"></span>
      {{ t('comms.editor.listening') }} <span v-if="dictation.interim.value" class="rte-interim">{{ dictation.interim.value }}</span>
    </p>
    <p v-else-if="!dictation.supported" :id="hintId" class="field-hint">{{ t('comms.editor.unsupported') }}</p>
    <p v-else :id="hintId" class="field-hint">{{ t('comms.editor.hint') }}</p>
    <FieldError :message="dictation.error.value || error" />
  </div>
</template>

<style scoped>
.rte {
  overflow: hidden;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  transition: border-color var(--transition), box-shadow var(--transition);
}

.rte:focus-within {
  border-color: var(--color-primary);
  box-shadow: var(--focus);
}

.rte.has-error {
  border-color: var(--color-danger);
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

.rte-group {
  display: flex;
  gap: 2px;
}

.rte-group + .rte-group {
  padding-inline-start: 6px;
  border-inline-start: 1px solid var(--color-border);
}

.rte-tool {
  display: grid;
  place-items: center;
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-ink);
  cursor: pointer;
}

.rte-tool:hover {
  background: var(--color-surface);
  border-color: var(--color-border);
}

.rte-tool:focus-visible {
  outline: none;
  box-shadow: var(--focus);
}

.rte-tool.is-active {
  border-color: transparent;
  background: var(--color-primary-soft);
  color: var(--color-primary-ink);
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
  border-radius: var(--radius-full);
  background: var(--color-surface);
  color: var(--color-ink);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
}

.rte-dictate:hover {
  border-color: var(--color-primary);
  color: var(--color-primary-ink);
}

.rte-dictate.is-listening {
  border-color: #b42318;
  background: #fdecea;
  color: #b42318;
}

.rte-body {
  min-height: 200px;
  max-height: 380px;
  overflow-y: auto;
  padding: var(--space-3) var(--space-4);
  color: var(--color-ink);
  line-height: 1.6;
  outline: none;
}

.rte-body:empty::before {
  content: attr(data-placeholder);
  color: var(--color-text-subtle);
}

.rte-body :deep(h3) {
  margin: 8px 0 4px;
  font-size: var(--text-md);
}

.rte-body :deep(p) {
  margin: 0 0 8px;
}

.rte-body :deep(ul),
.rte-body :deep(ol) {
  margin: 0 0 8px;
  padding-inline-start: 1.4em;
}

.rte-status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  color: #b42318;
  font-size: var(--text-sm);
  font-weight: 600;
}

.rte-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #b42318;
  animation: pulse 1s ease-in-out infinite;
}

.rte-interim {
  color: var(--color-text-muted);
  font-weight: 400;
}

@keyframes pulse {
  50% {
    opacity: 0.3;
  }
}

@media (prefers-reduced-motion: reduce) {
  .rte-dot {
    animation: none;
  }
}
</style>
