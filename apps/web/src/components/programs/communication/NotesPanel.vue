<script setup lang="ts">
import { reactive, ref } from 'vue';
import { ROLE_LABELS, type ProgramCommunication, type ProgramNote, type ProgramNoteVersion } from '@abapro/shared';
import { noteHistoryRequest, saveNoteRequest } from '@/api/communication';
import AppButton from '@/components/ui/AppButton.vue';
import AppDialog from '@/components/ui/AppDialog.vue';
import AppInput from '@/components/ui/AppInput.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import { formatShortDate } from '@/lib/format';
import { errorMessage } from '@/lib/loader';
import { useToastStore } from '@/stores/toast';
import RichTextEditor from './RichTextEditor.vue';

const props = defineProps<{ data: ProgramCommunication; legacyNotes: string }>();
const emit = defineEmits<{ updated: [data: ProgramCommunication] }>();
const toast = useToastStore();

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const stamp = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

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
  errors.title = form.title.trim() ? '' : 'Give the note a title.';
  errors.bodyHtml = text ? '' : 'Write the note before saving it.';
  errors.noteDate = form.noteDate ? '' : 'Choose the note date.';
  if (errors.title || errors.bodyHtml || errors.noteDate) return;
  saving.value = true;
  try {
    emit('updated', await saveNoteRequest(props.data.programId, { ...form }, editing.value?.id));
    toast.push({ tone: 'success', title: editing.value ? 'Note updated' : 'Note added', message: form.title.trim() });
    editorOpen.value = false;
  } catch (saveError) {
    toast.push({ tone: 'danger', title: 'Note was not saved', message: errorMessage(saveError, 'Try again.') });
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
    toast.push({ tone: 'danger', title: 'History unavailable', message: errorMessage(historyError, 'Try again.') });
    historyNote.value = null;
  }
}
</script>

<template>
  <div class="panel-stack">
    <div class="panel-bar">
      <p class="panel-hint">Notes are shared with the child’s parents.</p>
      <AppButton v-if="data.canWrite" @click="openEditor(null)">New note</AppButton>
    </div>

    <EmptyState
      v-if="data.notes.length === 0"
      title="No notes yet"
      :description="data.canWrite ? 'Add a note after a session, or dictate one.' : 'Notes written by the care team appear here.'"
    />
    <article v-for="note in data.notes" :key="note.id" class="note-card">
      <header class="note-head">
        <div>
          <h3 class="note-title">{{ note.title }}</h3>
          <p class="note-meta">
            {{ formatShortDate(note.noteDate) }} · {{ note.authorName }}, {{ ROLE_LABELS[note.authorRole] ?? note.authorRole }} · Added {{ stamp(note.createdAt) }}
            <template v-if="note.version > 1"> · Edited {{ stamp(note.updatedAt) }}<template v-if="note.updatedByName"> by {{ note.updatedByName }}</template></template>
          </p>
        </div>
        <div class="note-actions">
          <AppButton v-if="note.version > 1" size="sm" variant="ghost" @click="openHistory(note)">History</AppButton>
          <AppButton v-if="note.canEdit" size="sm" variant="secondary" @click="openEditor(note)">Edit</AppButton>
        </div>
      </header>
      <!-- Sanitised by the API: basic formatting tags only, no attributes. -->
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div class="note-body" v-html="note.bodyHtml"></div>
    </article>

    <details v-if="legacyNotes" class="legacy-notes">
      <summary>General program notes</summary>
      <p>{{ legacyNotes }}</p>
      <p class="panel-hint">Written on the program form for the care team. Not shared with parents.</p>
    </details>

    <AppDialog :open="editorOpen" :title="editing ? 'Edit note' : 'New note'" wide @close="editorOpen = false">
      <div class="note-form">
        <div class="note-form-row">
          <AppInput v-model="form.title" label="Title" :error="errors.title" required />
          <AppInput v-model="form.noteDate" label="Date" type="date" :error="errors.noteDate" required />
        </div>
        <RichTextEditor v-model="form.bodyHtml" label="Description" :error="errors.bodyHtml" />
        <p v-if="editing" class="panel-hint">Saving keeps the earlier version in the note’s history.</p>
      </div>
      <template #footer>
        <AppButton variant="secondary" @click="editorOpen = false">Cancel</AppButton>
        <AppButton :loading="saving" @click="save">{{ editing ? 'Save changes' : 'Save note' }}</AppButton>
      </template>
    </AppDialog>

    <AppDialog :open="historyNote !== null" :title="`History · ${historyNote?.title ?? ''}`" wide @close="historyNote = null">
      <SkeletonBlock v-if="!history" height="160px" />
      <ol v-else class="history-list">
        <li v-for="version in history" :key="version.version" class="history-item">
          <p class="note-meta">
            <strong>Version {{ version.version }}</strong> · {{ stamp(version.editedAt) }} · {{ version.editedByName }},
            {{ ROLE_LABELS[version.editorRole] ?? version.editorRole }} · Note date {{ formatShortDate(version.noteDate) }}
          </p>
          <h4 class="note-title">{{ version.title }}</h4>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div class="note-body" v-html="version.bodyHtml"></div>
        </li>
      </ol>
    </AppDialog>
  </div>
</template>

<style scoped>
.panel-stack {
  display: grid;
  gap: 12px;
}

.panel-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
}

.panel-hint {
  margin: 0;
  font-size: 0.88rem;
  color: var(--color-text-muted);
}

.note-card {
  padding: 14px 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 10px);
  background: var(--color-surface);
}

.note-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
}

.note-title {
  margin: 0;
  font-size: 1rem;
  color: var(--color-ink);
}

.note-meta {
  margin: 2px 0 0;
  font-size: 0.82rem;
  color: var(--color-text-muted);
}

.note-actions {
  display: flex;
  gap: 6px;
  align-items: flex-start;
}

.note-body {
  margin-top: 10px;
  color: var(--color-ink);
  line-height: 1.55;
}

.note-body :deep(p) {
  margin: 0 0 8px;
}

.note-body :deep(h3),
.note-body :deep(h4) {
  margin: 8px 0 4px;
  font-size: 1rem;
}

.legacy-notes {
  padding: 10px 14px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md, 10px);
}

.legacy-notes summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--color-ink);
}

.note-form {
  display: grid;
  gap: 14px;
}

.note-form-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 190px;
  gap: 12px;
}

.history-list {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.history-item {
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 10px);
}

@media (max-width: 600px) {
  .note-form-row {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
