<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ProgramCommunication, ProgramNote, ProgramNoteVersion } from '@abapro/shared';
import { noteHistoryRequest, saveNoteRequest } from '@/api/communication';
import AppIcon from '@/components/navigation/AppIcon.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppDialog from '@/components/ui/AppDialog.vue';
import AppInput from '@/components/ui/AppInput.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import { roleName } from '@/i18n';
import { formatDate, formatDateTime } from '@/lib/format';
import { errorMessage } from '@/lib/loader';
import { useToastStore } from '@/stores/toast';
import RichTextEditor from './RichTextEditor.vue';

const props = defineProps<{ data: ProgramCommunication; legacyNotes: string }>();
const emit = defineEmits<{ updated: [data: ProgramCommunication] }>();
const toast = useToastStore();
const { t } = useI18n();

/** Up to two initials for the author's avatar. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = (word?: string) => Array.from(word ?? '')[0] ?? '';
  return (words.length > 1 ? first(words[0]) + first(words[words.length - 1]) : first(words[0])).toLocaleUpperCase() || '?';
}

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const stamp = (iso: string) => formatDateTime(iso);

// Editor.
const editing = ref<ProgramNote | null>(null);
const editorOpen = ref(false);
const saving = ref(false);
const form = reactive({ title: '', bodyHtml: '', noteDate: today() });
const errors = reactive({ title: '', bodyHtml: '', noteDate: '' });

function openEditor(note: ProgramNote | null): void {
  editing.value = note;
  Object.assign(form, note ? { title: note.title, bodyHtml: note.bodyHtml, noteDate: note.noteDate } : { title: '', bodyHtml: '', noteDate: today() });
  Object.assign(errors, { title: '', bodyHtml: '', noteDate: '' });
  editorOpen.value = true;
}

async function save(): Promise<void> {
  const text = form.bodyHtml.replace(/<[^>]*>|&nbsp;/g, '').trim();
  errors.title = form.title.trim() ? '' : t('comms.notes.errors.title');
  errors.bodyHtml = text ? '' : t('comms.notes.errors.body');
  errors.noteDate = form.noteDate ? '' : t('comms.notes.errors.date');
  if (errors.title || errors.bodyHtml || errors.noteDate) return;
  saving.value = true;
  try {
    emit('updated', await saveNoteRequest(props.data.programId, { ...form }, editing.value?.id));
    toast.push({ tone: 'success', title: editing.value ? t('comms.notes.savedEdit') : t('comms.notes.savedNew'), message: form.title.trim() });
    editorOpen.value = false;
  } catch (saveError) {
    toast.push({ tone: 'danger', title: t('comms.notes.notSaved'), message: errorMessage(saveError, t('errors.generic')) });
  } finally {
    saving.value = false;
  }
}

// History.
const historyNote = ref<ProgramNote | null>(null);
const history = ref<ProgramNoteVersion[] | null>(null);

async function openHistory(note: ProgramNote): Promise<void> {
  historyNote.value = note;
  history.value = null;
  try {
    history.value = await noteHistoryRequest(props.data.programId, note.id);
  } catch (historyError) {
    toast.push({ tone: 'danger', title: t('comms.notes.historyUnavailable'), message: errorMessage(historyError, t('errors.generic')) });
    historyNote.value = null;
  }
}
</script>

<template>
  <div class="panel-stack">
    <div class="panel-bar">
      <p class="panel-hint"><AppIcon name="user" :size="14" />{{ t('comms.notes.hint') }}</p>
      <AppButton v-if="data.canWrite" icon="plus" @click="openEditor(null)">{{ t('comms.notes.new') }}</AppButton>
    </div>

    <EmptyState
      v-if="data.notes.length === 0"
      icon="file"
      :title="t('comms.notes.empty')"
      :description="data.canWrite ? t('comms.notes.emptyWriter') : t('comms.notes.emptyReader')"
    />
    <article v-for="note in data.notes" :key="note.id" class="note-card">
      <header class="note-head">
        <span class="note-avatar" aria-hidden="true">{{ initials(note.authorName) }}</span>
        <div class="note-heading">
          <h3 class="note-title" dir="auto">{{ note.title }}</h3>
          <p class="note-meta">
            <span class="note-author">{{ note.authorName }}</span>
            <span>{{ roleName(note.authorRole) }}</span>
            <span>{{ t('comms.notes.added', { date: stamp(note.createdAt) }) }}</span>
            <span v-if="note.version > 1">
              {{ note.updatedByName ? t('comms.notes.editedBy', { date: stamp(note.updatedAt), name: note.updatedByName }) : t('comms.notes.edited', { date: stamp(note.updatedAt) }) }}
            </span>
          </p>
        </div>
        <span class="note-date">{{ formatDate(note.noteDate) }}</span>
      </header>
      <!-- Sanitised by the API: basic formatting tags only, no attributes. -->
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div class="note-body" dir="auto" v-html="note.bodyHtml"></div>
      <footer v-if="note.version > 1 || note.canEdit" class="note-actions">
        <AppButton v-if="note.version > 1" size="sm" variant="ghost" icon="history" @click="openHistory(note)">{{ t('comms.notes.history') }}</AppButton>
        <AppButton v-if="note.canEdit" size="sm" variant="secondary" icon="edit" @click="openEditor(note)">{{ t('comms.notes.edit') }}</AppButton>
      </footer>
    </article>

    <details v-if="legacyNotes" class="legacy-notes">
      <summary>{{ t('comms.notes.legacy') }}</summary>
      <p class="legacy-body" dir="auto">{{ legacyNotes }}</p>
      <p class="panel-hint">{{ t('comms.notes.legacyHint') }}</p>
    </details>

    <AppDialog :open="editorOpen" :title="editing ? t('comms.notes.editTitle') : t('comms.notes.newTitle')" size="lg" @close="editorOpen = false">
      <div class="note-form">
        <div class="note-form-row">
          <AppInput v-model="form.title" :label="t('comms.notes.title')" :error="errors.title" required />
          <AppInput v-model="form.noteDate" :label="t('comms.notes.date')" type="date" :error="errors.noteDate" required />
        </div>
        <RichTextEditor v-model="form.bodyHtml" :label="t('comms.notes.body')" :error="errors.bodyHtml" />
        <p v-if="editing" class="panel-hint"><AppIcon name="history" :size="14" />{{ t('comms.notes.keepsHistory') }}</p>
      </div>
      <template #footer>
        <AppButton variant="secondary" @click="editorOpen = false">{{ t('common.cancel') }}</AppButton>
        <AppButton :loading="saving" @click="save">{{ editing ? t('comms.notes.saveChanges') : t('comms.notes.save') }}</AppButton>
      </template>
    </AppDialog>

    <AppDialog :open="historyNote !== null" :title="t('comms.notes.historyTitle', { title: historyNote?.title ?? '' })" size="lg" @close="historyNote = null">
      <SkeletonBlock v-if="!history" height="160px" />
      <ol v-else class="history-list">
        <li v-for="(version, index) in history" :key="version.version" class="history-item">
          <p class="history-meta">
            <strong>{{ t('comms.notes.version', { n: version.version }) }}</strong>
            <span v-if="index === 0 && version.version === historyNote?.version" class="history-current">{{ t('comms.notes.current') }}</span>
            <span>{{ stamp(version.editedAt) }}</span>
            <span>{{ version.editedByName }}, {{ roleName(version.editorRole) }}</span>
            <span>{{ t('comms.notes.noteDate', { date: formatDate(version.noteDate) }) }}</span>
          </p>
          <h4 class="note-title" dir="auto">{{ version.title }}</h4>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div class="note-body" dir="auto" v-html="version.bodyHtml"></div>
        </li>
      </ol>
    </AppDialog>
  </div>
</template>

<style scoped>
.panel-stack {
  display: grid;
  gap: var(--space-3);
}

.panel-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2) var(--space-4);
}

.panel-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.note-card {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  transition: box-shadow var(--transition);
}

.note-card:hover {
  box-shadow: var(--shadow-xs);
}

.note-head {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

.note-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--color-primary-soft);
  color: var(--color-primary-ink);
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1;
}

.note-heading {
  flex: 1;
  min-width: 0;
}

.note-title {
  color: var(--color-ink);
  font-size: var(--text-md);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.note-meta,
.history-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 2px var(--space-3);
  margin-top: 2px;
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}

.note-author {
  color: var(--color-text);
  font-weight: 600;
}

.note-date {
  flex: none;
  padding: 2px 10px;
  border-radius: var(--radius-full);
  background: var(--color-surface-sunken);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-weight: 600;
  white-space: nowrap;
}

.note-body {
  color: var(--color-ink);
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.note-body :deep(p) {
  margin: 0 0 8px;
}

.note-body :deep(p:last-child) {
  margin-bottom: 0;
}

.note-body :deep(h3),
.note-body :deep(h4) {
  margin: 8px 0 4px;
  font-size: var(--text-base);
}

.note-body :deep(ul),
.note-body :deep(ol) {
  margin: 0 0 8px;
  padding-inline-start: 1.4em;
}

.note-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-border);
}

.legacy-notes {
  padding: var(--space-3) var(--space-4);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
}

.legacy-notes summary {
  color: var(--color-ink);
  font-weight: 600;
  cursor: pointer;
}

.legacy-body {
  margin: var(--space-2) 0;
  white-space: pre-wrap;
}

.note-form {
  display: grid;
  gap: var(--space-4);
}

.note-form-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 190px;
  gap: var(--space-3);
}

/* History: a timeline, newest first. */
.history-list {
  display: grid;
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  padding-inline-start: var(--space-5);
  border-inline-start: 2px solid var(--color-border);
  list-style: none;
}

.history-item {
  position: relative;
  display: grid;
  gap: var(--space-2);
}

.history-item::before {
  content: '';
  position: absolute;
  top: 4px;
  inset-inline-start: calc(-1 * var(--space-5) - 6px);
  width: 10px;
  height: 10px;
  border: 2px solid var(--color-primary);
  border-radius: 50%;
  background: var(--color-surface);
}

.history-current {
  padding: 0 8px;
  border-radius: var(--radius-full);
  background: var(--color-primary-soft);
  color: var(--color-primary-ink);
  font-weight: 600;
}

@media (max-width: 600px) {
  .note-form-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .note-head {
    flex-wrap: wrap;
  }
}
</style>
