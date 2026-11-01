<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { ATTACHMENT_TYPES, ROLE_LABELS, type HomeActivity, type HomeActivityStatus, type ProgramCommunication } from '@abapro/shared';
import { saveActivityRequest } from '@/api/communication';
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
import { formatDayOf } from '@/lib/format';

const ACCEPT = Object.keys(ATTACHMENT_TYPES).join(',');
const FILTERS: Array<{ value: 'all' | HomeActivityStatus; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'all', label: 'All' },
];

const props = defineProps<{ data: ProgramCommunication }>();
const emit = defineEmits<{ updated: [data: ProgramCommunication] }>();
const toast = useToastStore();

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
    toast.push({ tone: 'danger', title: 'Activity was not saved', message: errorMessage(saveError, 'Try again.') });
    return false;
  } finally {
    saving.value = false;
  }
}

async function save(): Promise<void> {
  errors.title = form.title.trim() ? '' : 'Give the activity a title.';
  errors.instructions = form.instructions.trim() ? '' : 'Add instructions for the parent.';
  if (errors.title || errors.instructions) return;
  if (await persist(form, editing.value, editing.value ? 'Activity updated' : 'Activity added')) formOpen.value = false;
}

function toggleStatus(activity: HomeActivity): void {
  const status: HomeActivityStatus = activity.status === 'active' ? 'completed' : 'active';
  const { title, instructions, purpose, frequency, guidance } = activity;
  void persist({ title, instructions, purpose, frequency, guidance, status }, activity, status === 'completed' ? 'Marked completed' : 'Marked active');
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
      <div class="activity-filters" role="group" aria-label="Show activities">
        <button
          v-for="option in FILTERS"
          :key="option.value"
          type="button"
          class="activity-filter"
          :class="{ 'is-active': filter === option.value }"
          :aria-pressed="filter === option.value"
          @click="filter = option.value"
        >
          {{ option.label }} <span class="activity-count">{{ count(option.value) }}</span>
        </button>
      </div>
      <AppButton v-if="data.canWrite" @click="openForm(null)">New activity</AppButton>
    </div>
    <p class="panel-hint">Activities for parents to practise with their child at home. Parents see every activity here.</p>

    <EmptyState
      v-if="shown.length === 0"
      :title="data.activities.length === 0 ? 'No home activities yet' : `No ${filter === 'completed' ? 'completed' : 'active'} activities`"
      :description="data.activities.length === 0 && data.canWrite ? 'Add an activity with instructions parents can follow.' : 'Activities appear here when the care team adds them.'"
    />

    <article v-for="activity in shown" :key="activity.id" class="activity-card" :class="`is-${activity.status}`">
      <header class="activity-head">
        <div>
          <h3 class="activity-title">{{ activity.title }}</h3>
          <p class="activity-meta">
            {{ activity.createdByName }}, {{ ROLE_LABELS[activity.creatorRole] ?? activity.creatorRole }} · Added {{ date(activity.createdAt) }}
            <template v-if="activity.completedAt"> · Completed {{ date(activity.completedAt) }}</template>
          </p>
        </div>
        <StatusBadge :tone="activity.status === 'active' ? 'success' : 'neutral'" :label="activity.status === 'active' ? 'Active' : 'Completed'" />
      </header>

      <dl class="activity-details">
        <div class="activity-detail is-wide">
          <dt>Instructions</dt>
          <dd>{{ activity.instructions }}</dd>
        </div>
        <div v-if="activity.purpose" class="activity-detail">
          <dt>Purpose</dt>
          <dd>{{ activity.purpose }}</dd>
        </div>
        <div v-if="activity.frequency" class="activity-detail">
          <dt>How often</dt>
          <dd>{{ activity.frequency }}</dd>
        </div>
        <div v-if="activity.guidance" class="activity-detail is-wide">
          <dt>Guidance</dt>
          <dd>{{ activity.guidance }}</dd>
        </div>
      </dl>

      <AttachmentList v-if="activity.attachments.length" compact :program-id="data.programId" :attachments="activity.attachments" />

      <div v-if="uploadFor === activity.id" class="activity-upload">
        <FileUpload v-model="files" label="Supporting file" :accept="ACCEPT" :max-size-mb="10" :disabled="uploading" />
        <UploadProgress :progress="progress" />
        <div class="activity-actions">
          <AppButton size="sm" variant="secondary" :disabled="uploading" @click="openUpload(activity)">Cancel</AppButton>
          <AppButton size="sm" :disabled="files.length === 0" :loading="uploading" @click="uploadFile(activity)">Upload</AppButton>
        </div>
      </div>

      <div v-if="data.canWrite" class="activity-actions">
        <AppButton v-if="data.canUpload && uploadFor !== activity.id" size="sm" variant="ghost" @click="openUpload(activity)">Add file</AppButton>
        <AppButton size="sm" variant="secondary" @click="openForm(activity)">Edit</AppButton>
        <AppButton size="sm" variant="secondary" :disabled="saving" @click="toggleStatus(activity)">
          {{ activity.status === 'active' ? 'Mark completed' : 'Mark active' }}
        </AppButton>
      </div>
    </article>

    <AppDialog :open="formOpen" :title="editing ? 'Edit home activity' : 'New home activity'" size="lg" @close="formOpen = false">
      <div class="activity-form">
        <AppInput v-model="form.title" label="Activity title" :error="errors.title" required />
        <AppTextarea v-model="form.instructions" label="Instructions" :rows="4" :error="errors.instructions" placeholder="Step by step, what the parent does with the child." required />
        <AppTextarea v-model="form.purpose" label="Purpose or expected outcome" :rows="2" />
        <div class="activity-form-row">
          <AppInput v-model="form.frequency" label="How often or how long" placeholder="e.g. Daily, 10 minutes" />
          <AppSelect
            v-model="form.status"
            label="Status"
            :options="[{ value: 'active', label: 'Active' }, { value: 'completed', label: 'Completed' }]"
          />
        </div>
        <AppTextarea v-model="form.guidance" label="Additional guidance" :rows="3" placeholder="Tips, what to praise, what to avoid." />
        <p v-if="!editing && data.canUpload" class="panel-hint">Add supporting files after saving, with Add file on the activity.</p>
      </div>
      <template #footer>
        <AppButton variant="secondary" @click="formOpen = false">Cancel</AppButton>
        <AppButton :loading="saving" @click="save">{{ editing ? 'Save changes' : 'Save activity' }}</AppButton>
      </template>
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

.activity-filters {
  display: inline-flex;
  gap: 6px;
}

.activity-filter {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-ink);
  font-weight: 600;
  cursor: pointer;
}

.activity-filter.is-active {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface));
  color: var(--color-primary);
}

.activity-count {
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.activity-card {
  display: grid;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--color-border);
  border-inline-start: 4px solid var(--color-primary);
  border-radius: var(--radius-md, 10px);
  background: var(--color-surface);
}

.activity-card.is-completed {
  border-inline-start-color: var(--color-border-strong, var(--color-border));
}

.activity-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.activity-title {
  margin: 0;
  font-size: 1rem;
  color: var(--color-ink);
}

.activity-meta {
  margin: 2px 0 0;
  font-size: 0.82rem;
  color: var(--color-text-muted);
}

.activity-details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px 16px;
  margin: 0;
}

.activity-detail.is-wide {
  grid-column: 1 / -1;
}

.activity-detail dt {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.activity-detail dd {
  margin: 2px 0 0;
  white-space: pre-line;
  color: var(--color-ink);
}

.activity-upload {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md, 10px);
}

.activity-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.activity-form {
  display: grid;
  gap: 12px;
}

.activity-form-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 200px;
  gap: 12px;
}

@media (max-width: 600px) {
  .activity-form-row {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
