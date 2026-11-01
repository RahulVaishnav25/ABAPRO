<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ATTACHMENT_TYPES, type HomeActivity, type HomeActivityStatus, type ProgramCommunication } from '@abapro/shared';
import { saveActivityRequest } from '@/api/communication';
import AppIcon from '@/components/navigation/AppIcon.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppDialog from '@/components/ui/AppDialog.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTextarea from '@/components/ui/AppTextarea.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import FileUpload from '@/components/ui/FileUpload.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { errorMessage } from '@/lib/loader';
import { useToastStore } from '@/stores/toast';
import AttachmentList from './AttachmentList.vue';
import UploadProgress from './UploadProgress.vue';
import { useUpload } from './useUpload';
import { roleName } from '@/i18n';
import { formatDayOf } from '@/lib/format';

const ACCEPT = Object.keys(ATTACHMENT_TYPES).join(',');
const FILTERS: Array<'all' | HomeActivityStatus> = ['active', 'completed', 'all'];

const props = defineProps<{ data: ProgramCommunication }>();
const emit = defineEmits<{ updated: [data: ProgramCommunication] }>();
const toast = useToastStore();
const { t } = useI18n();
const statusOptions = computed(() => [
  { value: 'active', label: t('comms.activities.active') },
  { value: 'completed', label: t('comms.activities.completed') },
]);
const emptyTitle = computed(() => {
  if (props.data.activities.length === 0) return t('comms.activities.emptyAll');
  return filter.value === 'completed' ? t('comms.activities.emptyCompleted') : t('comms.activities.emptyActive');
});

const filter = ref<'all' | HomeActivityStatus>('active');
const shown = computed(() => props.data.activities.filter((activity) => filter.value === 'all' || activity.status === filter.value));
const count = (status: 'all' | HomeActivityStatus) => props.data.activities.filter((activity) => status === 'all' || activity.status === status).length;
const date = (iso: string) => formatDayOf(iso);

// Form.
const editing = ref<HomeActivity | null>(null);
const formOpen = ref(false);
const saving = ref(false);
const form = reactive({ title: '', instructions: '', purpose: '', frequency: '', guidance: '', status: 'active' as HomeActivityStatus });
const errors = reactive({ title: '', instructions: '' });

function openForm(activity: HomeActivity | null): void {
  editing.value = activity;
  Object.assign(form, activity
    ? { title: activity.title, instructions: activity.instructions, purpose: activity.purpose, frequency: activity.frequency, guidance: activity.guidance, status: activity.status }
    : { title: '', instructions: '', purpose: '', frequency: '', guidance: '', status: 'active' });
  Object.assign(errors, { title: '', instructions: '' });
  formOpen.value = true;
}

async function persist(body: typeof form, activity: HomeActivity | null, success: string): Promise<boolean> {
  saving.value = true;
  try {
    emit('updated', await saveActivityRequest(props.data.programId, { ...body }, activity?.id));
    toast.push({ tone: 'success', title: success, message: body.title.trim() });
    return true;
  } catch (saveError) {
    toast.push({ tone: 'danger', title: t('comms.activities.notSaved'), message: errorMessage(saveError, t('errors.generic')) });
    return false;
  } finally {
    saving.value = false;
  }
}

async function save(): Promise<void> {
  errors.title = form.title.trim() ? '' : t('comms.activities.errors.title');
  errors.instructions = form.instructions.trim() ? '' : t('comms.activities.errors.instructions');
  if (errors.title || errors.instructions) return;
  if (await persist(form, editing.value, editing.value ? t('comms.activities.savedEdit') : t('comms.activities.savedNew'))) formOpen.value = false;
}

function toggleStatus(activity: HomeActivity): void {
  const status: HomeActivityStatus = activity.status === 'active' ? 'completed' : 'active';
  const { title, instructions, purpose, frequency, guidance } = activity;
  void persist({ title, instructions, purpose, frequency, guidance, status }, activity, status === 'completed' ? t('comms.activities.markedCompleted') : t('comms.activities.markedActive'));
}

// Supporting files, one activity at a time.
const uploadFor = ref('');
const files = ref<File[]>([]);
const { progress, uploading, upload } = useUpload(() => props.data.programId, (data) => emit('updated', data));

function openUpload(activity: HomeActivity): void {
  uploadFor.value = uploadFor.value === activity.id ? '' : activity.id;
  files.value = [];
}

async function uploadFile(activity: HomeActivity): Promise<void> {
  const file = files.value[0];
  if (file && (await upload(file, file.name, activity.id))) {
    files.value = [];
    uploadFor.value = '';
  }
}
</script>

<template>
  <div class="panel-stack">
    <div class="panel-bar">
      <div class="activity-filters" role="group" :aria-label="t('comms.activities.show')">
        <button
          v-for="option in FILTERS"
          :key="option"
          type="button"
          class="activity-filter"
          :class="{ 'is-active': filter === option }"
          :aria-pressed="filter === option"
          @click="filter = option"
        >
          {{ t(`comms.activities.filters.${option}`) }} <span class="activity-count">{{ count(option) }}</span>
        </button>
      </div>
      <AppButton v-if="data.canWrite" icon="plus" @click="openForm(null)">{{ t('comms.activities.new') }}</AppButton>
    </div>
    <p class="panel-hint">{{ t('comms.activities.hint') }}</p>

    <EmptyState
      v-if="shown.length === 0"
      icon="inbox"
      :title="emptyTitle"
      :description="data.activities.length === 0 && data.canWrite ? t('comms.activities.emptyWriter') : t('comms.activities.emptyReader')"
    />

    <article v-for="activity in shown" :key="activity.id" class="activity-card" :class="`is-${activity.status}`">
      <header class="activity-head">
        <div class="activity-heading">
          <h3 class="activity-title" dir="auto">{{ activity.title }}</h3>
          <p class="activity-meta">
            <span>{{ activity.createdByName }}, {{ roleName(activity.creatorRole) }}</span>
            <span>{{ t('comms.activities.added', { date: date(activity.createdAt) }) }}</span>
            <span v-if="activity.completedAt">{{ t('comms.activities.completedOn', { date: date(activity.completedAt) }) }}</span>
          </p>
        </div>
        <StatusBadge
          :tone="activity.status === 'active' ? 'success' : 'neutral'"
          :label="activity.status === 'active' ? t('comms.activities.active') : t('comms.activities.completed')"
        />
      </header>

      <div class="activity-instructions">
        <span class="activity-label">{{ t('comms.activities.instructions') }}</span>
        <p dir="auto">{{ activity.instructions }}</p>
      </div>
      <dl v-if="activity.purpose || activity.frequency || activity.guidance" class="activity-details">
        <div v-if="activity.purpose">
          <dt>{{ t('comms.activities.purpose') }}</dt>
          <dd dir="auto">{{ activity.purpose }}</dd>
        </div>
        <div v-if="activity.frequency">
          <dt>{{ t('comms.activities.frequency') }}</dt>
          <dd dir="auto">{{ activity.frequency }}</dd>
        </div>
        <div v-if="activity.guidance" class="is-wide">
          <dt>{{ t('comms.activities.guidance') }}</dt>
          <dd dir="auto">{{ activity.guidance }}</dd>
        </div>
      </dl>

      <AttachmentList v-if="activity.attachments.length" compact :program-id="data.programId" :attachments="activity.attachments" />

      <div v-if="uploadFor === activity.id" class="activity-upload">
        <FileUpload v-model="files" :label="t('comms.activities.supportingFile')" :accept="ACCEPT" :max-size-mb="10" :disabled="uploading" />
        <UploadProgress :progress="progress" />
        <div class="activity-actions">
          <AppButton size="sm" variant="ghost" :disabled="uploading" @click="openUpload(activity)">{{ t('common.cancel') }}</AppButton>
          <AppButton size="sm" icon="upload" :disabled="files.length === 0" :loading="uploading" @click="uploadFile(activity)">{{ t('comms.activities.upload') }}</AppButton>
        </div>
      </div>

      <footer v-if="data.canWrite" class="activity-actions is-footer">
        <AppButton v-if="data.canUpload && uploadFor !== activity.id" size="sm" variant="ghost" icon="upload" @click="openUpload(activity)">{{ t('comms.activities.addFile') }}</AppButton>
        <AppButton size="sm" variant="ghost" icon="edit" @click="openForm(activity)">{{ t('comms.activities.edit') }}</AppButton>
        <AppButton size="sm" variant="secondary" :icon="activity.status === 'active' ? 'check' : undefined" :disabled="saving" @click="toggleStatus(activity)">
          {{ activity.status === 'active' ? t('comms.activities.markCompleted') : t('comms.activities.markActive') }}
        </AppButton>
      </footer>
    </article>

    <AppDialog :open="formOpen" :title="editing ? t('comms.activities.editTitle') : t('comms.activities.newTitle')" size="lg" @close="formOpen = false">
      <div class="activity-form">
        <AppInput v-model="form.title" :label="t('comms.activities.title')" :error="errors.title" required />
        <AppTextarea
          v-model="form.instructions"
          :label="t('comms.activities.instructions')"
          :rows="4"
          :error="errors.instructions"
          :placeholder="t('comms.activities.instructionsPlaceholder')"
          required
        />
        <AppTextarea v-model="form.purpose" :label="t('comms.activities.purposeLabel')" :rows="2" />
        <div class="activity-form-row">
          <AppInput v-model="form.frequency" :label="t('comms.activities.frequencyLabel')" :placeholder="t('comms.activities.frequencyPlaceholder')" />
          <AppSelect v-model="form.status" :label="t('comms.activities.status')" :options="statusOptions" />
        </div>
        <AppTextarea v-model="form.guidance" :label="t('comms.activities.guidanceLabel')" :rows="3" :placeholder="t('comms.activities.guidancePlaceholder')" />
        <p v-if="!editing && data.canUpload" class="panel-hint"><AppIcon name="info" :size="14" />{{ t('comms.activities.filesAfterSave') }}</p>
      </div>
      <template #footer>
        <AppButton variant="secondary" @click="formOpen = false">{{ t('common.cancel') }}</AppButton>
        <AppButton :loading="saving" @click="save">{{ editing ? t('comms.activities.saveChanges') : t('comms.activities.save') }}</AppButton>
      </template>
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

/* Segmented filter */
.activity-filters {
  display: inline-flex;
  padding: 3px;
  border-radius: var(--radius-md);
  background: var(--color-surface-sunken);
}

.activity-filter {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 var(--space-3);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
}

.activity-filter.is-active {
  background: var(--color-surface);
  color: var(--color-ink);
  font-weight: 600;
  box-shadow: var(--shadow-xs);
}

.activity-count {
  min-width: 20px;
  padding: 0 6px;
  border-radius: var(--radius-full);
  background: var(--color-surface-sunken);
  font-size: var(--text-xs);
  line-height: 18px;
  text-align: center;
}

.activity-card {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-inline-start: 3px solid var(--color-success);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.activity-card.is-completed {
  border-inline-start-color: var(--color-border-strong);
  background: var(--color-surface-muted);
}

.activity-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2);
}

.activity-heading {
  min-width: 0;
}

.activity-title {
  color: var(--color-ink);
  font-size: var(--text-md);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.activity-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 2px var(--space-3);
  margin-top: 2px;
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}

.activity-instructions {
  display: grid;
  gap: 4px;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-primary-soft);
}

.is-completed .activity-instructions {
  background: var(--color-surface);
}

.activity-instructions p {
  color: var(--color-ink);
  white-space: pre-line;
}

.activity-label,
.activity-details dt {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-weight: 600;
}

.activity-details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-3) var(--space-4);
  margin: 0;
}

.activity-details .is-wide {
  grid-column: 1 / -1;
}

.activity-details dd {
  margin: 2px 0 0;
  color: var(--color-ink);
  white-space: pre-line;
}

.activity-upload {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.activity-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.activity-actions.is-footer {
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-border);
}

.activity-form {
  display: grid;
  gap: var(--space-4);
}

.activity-form-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 200px;
  gap: var(--space-3);
}

@media (max-width: 600px) {
  .activity-form-row {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
