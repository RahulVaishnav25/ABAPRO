<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { MeasurementMethod, ProgramDetail, TargetSummary } from '@abapro/shared';
import type { BadgeTone } from '@/components/ui/types';
import { fileToBase64 } from '@/api/clients';
import { programRequest, reorderTargetsRequest, uploadProgramDocumentRequest } from '@/api/programs';
import { createTaskRequest, programTasks, updateTaskRequest, type CreateTaskInput, type TaskItem } from '@/api/tasks';
import { ApiError } from '@/api/client';
import CreateTaskModal from '@/components/programs/CreateTaskModal.vue';
import ObservationEntry from '@/components/programs/ObservationEntry.vue';
import TargetForm from '@/components/programs/TargetForm.vue';
import AppButton from '@/components/ui/AppButton.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import FileUpload from '@/components/ui/FileUpload.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { errorMessage, useLoader } from '@/lib/loader';

function measurementLabel(method: MeasurementMethod): string {
  return { trial: 'Trial by trial', probe: 'Probe', frequency: 'Frequency', duration: 'Duration', abc: 'ABC' }[method];
}

function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'active': return 'success';
    case 'paused': return 'warning';
    case 'completed': return 'info';
    case 'discontinued': return 'neutral';
    default: return 'neutral';
  }
}

function phaseTone(phase: string): BadgeTone {
  const p = (phase || '').toLowerCase();
  switch (p) {
    case 'treatment':
    case 'intervention':
      return 'warning';
    case 'mastered':
      return 'success';
    case 'maintenance':
    case 'generalization':
      return 'info';
    case 'baseline':
    default:
      return 'neutral';
  }
}

function targetStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'active': return 'success';
    case 'mastered': return 'info';
    case 'discontinued': return 'danger';
    default: return 'neutral';
  }
}

const auth = useAuthStore();
const toast = useToastStore();
const route = useRoute();
const router = useRouter();
const programId = computed(() => String(route.params.programId ?? ''));
const program = ref<ProgramDetail | null>(null);
const showTarget = ref(false);
const editingId = ref('');
const sessionTargetId = ref('');
const files = ref<File[]>([]);
const tasks = computed(() => (program.value ? programTasks(program.value) : []));
const isCreateTaskOpen = ref(false);
const taskModalMode = ref<'create' | 'edit' | 'preview'>('create');
const selectedTask = ref<TaskItem | null>(null);
const submittingTask = ref(false);

const editingTarget = computed(() => program.value?.targets.find((item) => item.id === editingId.value) ?? null);
const sessionTarget = computed(() => program.value?.targets.find((item) => item.id === sessionTargetId.value));

function openCreateTaskModal(): void {
  taskModalMode.value = 'create';
  selectedTask.value = null;
  isCreateTaskOpen.value = true;
}

function openEditTaskModal(t: TaskItem): void {
  taskModalMode.value = 'edit';
  selectedTask.value = t;
  isCreateTaskOpen.value = true;
}

function openPreviewTaskModal(t: TaskItem): void {
  taskModalMode.value = 'preview';
  selectedTask.value = t;
  isCreateTaskOpen.value = true;
}

const { loading, error, load } = useLoader(async () => {
  program.value = await programRequest(programId.value);
}, 'The program could not be loaded.');

async function handleTaskSubmit(input: CreateTaskInput): Promise<void> {
  if (!program.value) return;
  submittingTask.value = true;
  try {
    if (taskModalMode.value === 'edit' && selectedTask.value) {
      const updated = await updateTaskRequest(selectedTask.value.id, input);
      toast.push({
        tone: 'success',
        title: 'Task updated',
        message: `Task "${updated.name}" has been updated successfully.`,
      });
    } else {
      const created = await createTaskRequest(program.value, input);
      toast.push({
        tone: 'success',
        title: 'Task created',
        message: `Task "${created.name}" has been created for this program.`,
      });
    }
    isCreateTaskOpen.value = false;
    program.value = await programRequest(program.value.id);
  } catch (err) {
    toast.push({
      tone: 'danger',
      title: taskModalMode.value === 'edit' ? 'Failed to update task' : 'Failed to create task',
      message: errorMessage(err, 'Please check your inputs and try again.'),
    });
  } finally {
    submittingTask.value = false;
  }
}

function openTarget(existing?: TargetSummary): void {
  editingId.value = existing?.id ?? '';
  showTarget.value = true;
}

function onTargetSaved(updated: ProgramDetail): void {
  program.value = updated;
  showTarget.value = false;
}

async function move(index: number, direction: -1 | 1): Promise<void> {
  if (!program.value) return;
  const ids = program.value.targets.map((item) => item.id);
  const next = index + direction;
  const current = ids[index];
  const swap = ids[next];
  if (!current || !swap) return;
  ids[index] = swap;
  ids[next] = current;
  program.value = await reorderTargetsRequest(program.value.id, ids);
}

function startSession(item: TargetSummary): void {
  sessionTargetId.value = item.id;
}

async function upload(): Promise<void> {
  if (!program.value || !files.value[0]) return;
  const file = files.value[0];
  try {
    program.value = await uploadProgramDocumentRequest(program.value.id, {
      fileName: file.name,
      contentType: file.type,
      contentBase64: await fileToBase64(file),
    });
    files.value = [];
    toast.push({ tone: 'success', title: 'Attachment saved', message: 'Scanning is not connected, so the file is marked not scanned.' });
  } catch (uploadError) {
    toast.push({ tone: 'danger', title: 'Attachment was not saved', message: uploadError instanceof ApiError ? uploadError.message : 'Try again.' });
  }
}

onMounted(() => void load());
</script>

<template>
  <PageContainer>
    <SkeletonBlock v-if="loading" height="260px" />
    <ErrorState v-else-if="error || !program" title="Program unavailable" :description="error" @retry="load" />
    <div v-else class="program-detail-view">
      <!-- Page Header -->
      <PageHeader :title="program.title" :description="program.clientName">
        <template #actions>
          <AppButton variant="secondary" @click="router.push(`/clients/${program.clientId}`)">Client profile</AppButton>
          <AppButton v-if="auth.can('programs.edit')" @click="router.push(`/programs/${program.id}/edit`)">Edit program</AppButton>
        </template>
      </PageHeader>

      <!-- Key Highlights Banner Card -->
      <section class="overview-banner">
        <div class="banner-badge-group">
          <StatusBadge :tone="statusTone(program.status)" :label="program.status" />
          <span class="version-tag">Version {{ program.configurationVersion }}</span>
        </div>
        <div class="banner-metrics">
          <div class="metric-item">
            <span class="metric-label">Domain</span>
            <span class="metric-value">{{ program.domain || 'General' }}</span>
          </div>
          <div class="metric-divider" aria-hidden="true"></div>
          <div class="metric-item">
            <span class="metric-label">Measurement Procedure</span>
            <span class="metric-value">{{ program.measurementProcedure || measurementLabel(program.measurementType) }}</span>
          </div>
          <div class="metric-divider" aria-hidden="true"></div>
          <div class="metric-item">
            <span class="metric-label">Targets</span>
            <span class="metric-value">{{ program.targets.length }} target{{ program.targets.length === 1 ? '' : 's' }}</span>
          </div>
          <div class="metric-divider" aria-hidden="true"></div>
          <div class="metric-item">
            <span class="metric-label">Date Implemented</span>
            <span class="metric-value">{{ program.dateImplemented || 'Not set' }}</span>
          </div>
        </div>
      </section>

      <!-- Section: Program Overview -->
      <section class="detail-section">
        <div class="section-header">
          <div>
            <h2 class="section-title">Program Overview</h2>
            <p class="section-desc">Timeline, assessment alignment, and client objectives</p>
          </div>
        </div>
        <dl class="details-grid">
          <div>
            <dt>Client</dt>
            <dd>
              <RouterLink :to="`/clients/${program.clientId}`">{{ program.clientName }}</RouterLink>
            </dd>
          </div>
          <div>
            <dt>Domain</dt>
            <dd>{{ program.domain || 'Not specified' }}</dd>
          </div>
          <div>
            <dt>Date Implemented</dt>
            <dd>{{ program.dateImplemented || 'Not set' }}</dd>
          </div>
          <div>
            <dt>Date Mastered</dt>
            <dd>{{ program.dateMastered || 'Not set' }}</dd>
          </div>
          <div>
            <dt>Assessment Type</dt>
            <dd>{{ program.assessmentType || 'None' }}</dd>
          </div>
          <div>
            <dt>Review Date</dt>
            <dd>{{ program.reviewOn || 'Not scheduled' }}</dd>
          </div>
          <div v-if="program.assessmentId">
            <dt>Linked Assessment</dt>
            <dd>
              <RouterLink :to="`/assessments/${program.assessmentId}`">{{ program.assessmentName || 'View Assessment' }}</RouterLink>
            </dd>
          </div>
        </dl>

        <div v-if="program.description || program.objective || program.goals.length" class="text-callouts">
          <div v-if="program.description" class="callout-block">
            <span class="callout-label">Description</span>
            <p class="callout-body">{{ program.description }}</p>
          </div>
          <div v-if="program.objective" class="callout-block">
            <span class="callout-label">Clinical Objective</span>
            <p class="callout-body">{{ program.objective }}</p>
          </div>
          <div v-if="program.goals.length" class="callout-block">
            <span class="callout-label">Goals</span>
            <ul class="goals-list">
              <li v-for="goal in program.goals" :key="goal.id">
                <span class="goal-statement">{{ goal.statement }}</span>
                <span v-if="goal.reviewOn" class="goal-meta">Review: {{ goal.reviewOn }}</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <!-- Section: Clinical & Teaching Protocol -->
      <section class="detail-section">
        <div class="section-header">
          <div>
            <h2 class="section-title">Clinical & Teaching Protocol</h2>
            <p class="section-desc">Stimulus instructions, instructional steps, measurement method, and criteria</p>
          </div>
        </div>
        <dl class="details-grid">
          <div>
            <dt>SD (Discriminative Stimulus)</dt>
            <dd class="sd-value">{{ program.sd || 'Not specified' }}</dd>
          </div>
          <div>
            <dt>Teaching Method</dt>
            <dd>{{ program.teachingMethod || 'Not specified' }}</dd>
          </div>
          <div>
            <dt>Measurement Procedure</dt>
            <dd>{{ program.measurementProcedure || measurementLabel(program.measurementType) }}</dd>
          </div>
        </dl>

        <div class="protocol-blocks">
          <div v-if="program.teachingProcedure" class="protocol-card">
            <span class="protocol-tag">Teaching Steps</span>
            <p class="protocol-text">{{ program.teachingProcedure }}</p>
          </div>
          <div v-if="program.masterySteps" class="protocol-card">
            <span class="protocol-tag">Mastery Steps</span>
            <p class="protocol-text">{{ program.masterySteps }}</p>
          </div>
          <div v-if="program.errorCorrectionProcedure" class="protocol-card">
            <span class="protocol-tag">Error Correction Procedure</span>
            <p class="protocol-text">{{ program.errorCorrectionProcedure }}</p>
          </div>
          <div v-if="program.netTeachingIdea" class="protocol-card">
            <span class="protocol-tag">NET Teaching Idea</span>
            <p class="protocol-text">{{ program.netTeachingIdea }}</p>
          </div>
          <div class="protocol-card criteria-card">
            <span class="protocol-tag">Mastery Criteria</span>
            <p class="protocol-text">{{ program.masteryCriteria || 'Not recorded.' }}</p>
            <span class="criteria-hint">Recorded for clinical reference. The clinician decides target mastery and phase transitions.</span>
          </div>
        </div>
      </section>

      <!-- Section: Targets -->
      <section class="detail-section">
        <div class="section-header targets-header">
          <div>
            <h2 class="section-title">
              Targets
              <span class="count-badge">{{ program.targets.length }}</span>
            </h2>
            <p class="section-desc">Skill breakdown and individual target observation protocols</p>
          </div>
          <AppButton v-if="auth.can('targets.edit')" type="button" @click="openTarget()">Add target</AppButton>
        </div>

        <div v-if="program.targets.length === 0" class="empty-targets">
          <p>No targets added to this program yet.</p>
          <AppButton v-if="auth.can('targets.edit')" type="button" variant="secondary" @click="openTarget()">Add first target</AppButton>
        </div>

        <div v-else class="targets-container">
          <article v-for="(item, index) in program.targets" :key="item.id" class="target-card">
            <div class="target-header">
              <div class="target-title-wrap">
                <span class="target-order">#{{ index + 1 }}</span>
                <h3 class="target-title">{{ item.title }}</h3>
              </div>
              <div class="target-badges">
                <StatusBadge :tone="phaseTone(item.phase)" :label="item.phase" />
                <StatusBadge :tone="targetStatusTone(item.status)" :label="item.status" />
                <span class="method-tag">
                  {{ measurementLabel(item.measurementMethod) }}
                  <template v-if="item.expectedTrialCount"> ({{ item.expectedTrialCount }} trials)</template>
                </span>
              </div>
            </div>

            <p class="target-definition">{{ item.operationalDefinition || item.description || 'No operational definition recorded.' }}</p>

            <dl v-if="item.promptHierarchy || item.teachingInstructions || item.baselineNote || item.masteryCriteria || item.clinicalNotes" class="target-meta-grid">
              <div v-if="item.promptHierarchy">
                <dt>Prompt Hierarchy</dt>
                <dd>{{ item.promptHierarchy }}</dd>
              </div>
              <div v-if="item.teachingInstructions">
                <dt>Teaching Instructions</dt>
                <dd>{{ item.teachingInstructions }}</dd>
              </div>
              <div v-if="item.baselineNote">
                <dt>Baseline Note</dt>
                <dd>{{ item.baselineNote }}</dd>
              </div>
              <div v-if="item.masteryCriteria">
                <dt>Mastery Criteria</dt>
                <dd>{{ item.masteryCriteria }}</dd>
              </div>
              <div v-if="item.clinicalNotes">
                <dt>Clinical Notes</dt>
                <dd>{{ item.clinicalNotes }}</dd>
              </div>
            </dl>

            <div class="target-actions">
              <div class="order-actions">
                <AppButton v-if="auth.can('targets.edit')" type="button" variant="ghost" size="sm" :disabled="index === 0" @click="move(index, -1)">↑ Move up</AppButton>
                <AppButton v-if="auth.can('targets.edit')" type="button" variant="ghost" size="sm" :disabled="index === program.targets.length - 1" @click="move(index, 1)">↓ Move down</AppButton>
              </div>
              <div class="record-actions">
                <AppButton v-if="auth.can('targets.edit')" type="button" variant="secondary" size="sm" @click="openTarget(item)">Edit</AppButton>
                <AppButton v-if="auth.can('observations.record') && item.status === 'active'" type="button" size="sm" @click="startSession(item)">Record Observation</AppButton>
              </div>
            </div>
          </article>
        </div>
      </section>

      <!-- Target Form Card -->
      <section v-if="showTarget" class="detail-section form-card">
        <div class="section-header">
          <div>
            <h2 class="section-title">{{ editingId ? 'Edit Target' : 'New Target' }}</h2>
            <p class="section-desc">Define the target title, phase, and observation criteria</p>
          </div>
        </div>
        <TargetForm
          :key="editingId || 'new'"
          :program-id="program.id"
          :existing="editingTarget"
          @saved="onTargetSaved"
          @cancel="showTarget = false"
        />
      </section>

      <!-- Session Entry Card -->
      <section v-if="sessionTarget" class="detail-section observation-card">
        <div class="section-header">
          <div>
            <h2 class="section-title">Session Entry · {{ sessionTarget.title }}</h2>
            <p class="section-desc">Records one observation against configuration version {{ sessionTarget.configurationVersion }}. Does not change phase or status.</p>
          </div>
        </div>
        <ObservationEntry
          :key="sessionTarget.id"
          :program-id="program.id"
          :target="sessionTarget"
          @recorded="sessionTargetId = ''"
          @cancel="sessionTargetId = ''"
        />
      </section>

      <!-- Section: Tasks -->
      <section class="detail-section">
        <div class="section-header tasks-header">
          <div>
            <h2 class="section-title">
              Tasks
              <span class="count-badge">{{ tasks.length }}</span>
            </h2>
            <p class="section-desc">Clinical tasks and target criteria configured for this program</p>
          </div>
          <AppButton type="button" @click="openCreateTaskModal">Add Task</AppButton>
        </div>

        <div v-if="tasks.length === 0" class="empty-tasks">
          <p>No tasks created for this program yet.</p>
          <AppButton type="button" variant="secondary" @click="openCreateTaskModal">Add first task</AppButton>
        </div>

        <div v-else class="tasks-table-wrap">
          <table class="tasks-table">
            <thead>
              <tr>
                <th>Task Name</th>
                <th>Phase</th>
                <th>Desired Trials</th>
                <th>Mastery Criteria</th>
                <th>SD</th>
                <th>Status</th>
                <th class="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="task in tasks" :key="task.id">
                <td>
                  <button
                    type="button"
                    class="task-title-link"
                    @click="openPreviewTaskModal(task)"
                  >
                    <strong class="task-title">{{ task.name }}</strong>
                  </button>
                </td>
                <td>
                  <StatusBadge :tone="phaseTone(task.phase)" :label="task.phase" />
                </td>
                <td>
                  <span class="trials-badge">{{ task.desiredTrials }}</span>
                </td>
                <td>
                  <span class="criteria-label">
                    {{ task.masterySessions }} ses · {{ task.masteryProbe }}%
                  </span>
                  <span v-if="task.phase === 'Baseline' && task.baselineSessions" class="criteria-sub">
                    (Base: {{ task.baselineSessions }} ses · {{ task.baselineProbe ?? 100 }}%)
                  </span>
                </td>
                <td class="sd-cell">
                  <span v-if="task.sd" class="sd-text" :title="task.sd">{{ task.sd }}</span>
                  <span v-else class="text-muted">—</span>
                </td>
                <td>
                  <StatusBadge :tone="statusTone(task.status)" :label="task.status" />
                </td>
                <td>
                  <div class="row-actions">
                    <AppButton size="sm" variant="secondary" @click="openPreviewTaskModal(task)">Preview</AppButton>
                    <AppButton size="sm" variant="secondary" @click="openEditTaskModal(task)">Edit</AppButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Section: Notes & Attachments -->
      <section class="detail-section">
        <div class="section-header">
          <div>
            <h2 class="section-title">Notes & Attachments</h2>
            <p class="section-desc">Clinical notes, uploaded reports, and associated documentation</p>
          </div>
        </div>
        <div class="notes-content">
          <div class="callout-block">
            <span class="callout-label">Program Notes</span>
            <p class="callout-body">{{ program.notes || 'No general program notes recorded.' }}</p>
          </div>
        </div>
        <div class="attachments-area">
          <span class="callout-label">Attached Documents</span>
          <div v-if="program.documents.length === 0" class="empty-docs">
            <p>No documents attached to this program.</p>
          </div>
          <ul v-else class="documents-list">
            <li v-for="document in program.documents" :key="document.id" class="document-item">
              <span class="document-name">📄 {{ document.fileName }}</span>
              <span class="document-status" :class="document.scanStatus === 'not_configured' ? 'status-unscanned' : 'status-rejected'">
                {{ document.scanStatus === 'not_configured' ? 'Not scanned' : 'Rejected' }}
              </span>
            </li>
          </ul>
          <div v-if="auth.can('documents.upload')" class="upload-wrapper">
            <FileUpload v-model="files" label="Upload Document" accept="application/pdf,image/png,image/jpeg,image/webp" :max-size-mb="0.5" />
            <div class="upload-actions">
              <AppButton type="button" :disabled="files.length === 0" @click="upload">Save attachment</AppButton>
            </div>
          </div>
        </div>
      </section>
      <!-- Create / Edit / Preview Task Modal -->
      <CreateTaskModal
        :open="isCreateTaskOpen"
        :mode="taskModalMode"
        :task="selectedTask"
        :submitting="submittingTask"
        :default-sd="program.sd"
        @close="isCreateTaskOpen = false"
        @submit="handleTaskSubmit"
        @edit="openEditTaskModal"
      />
    </div>
  </PageContainer>
</template>

<style scoped>
.program-detail-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.overview-banner {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg, 12px);
  padding: 20px 24px;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.banner-badge-group {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.version-tag {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--color-text-muted);
  background: var(--color-surface-muted, #f7f9fa);
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
}

.banner-metrics {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px 24px;
}

.metric-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.metric-label {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 700;
  color: var(--color-text-muted);
}

.metric-value {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--color-ink);
}

.metric-divider {
  width: 1px;
  height: 28px;
  background: var(--color-border);
}

.detail-section {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg, 12px);
  padding: 24px 28px;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 14px;
}

.targets-header {
  align-items: center;
}

.section-title {
  margin: 0;
  font-size: 1.12rem;
  font-weight: 700;
  color: var(--color-ink);
  letter-spacing: -0.01em;
  display: flex;
  align-items: center;
  gap: 10px;
}

.section-desc {
  margin: 4px 0 0;
  font-size: 0.88rem;
  color: var(--color-text-muted);
}

.count-badge {
  font-size: 0.8rem;
  font-weight: 600;
  background: var(--color-primary-soft, #e7f4f2);
  color: var(--color-primary-ink, #084840);
  padding: 2px 8px;
  border-radius: 9999px;
}

.details-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 18px 24px;
  margin: 0;
}

dt {
  margin: 0;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 700;
  color: var(--color-text-muted);
}

dd {
  margin: 4px 0 0;
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--color-ink);
}

.sd-value {
  font-family: inherit;
  font-weight: 600;
  color: var(--color-primary-ink, #084840);
}

.text-callouts {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 4px;
}

.callout-block {
  background: var(--color-surface-muted, #f7f9fa);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 14px 18px;
}

.callout-label {
  display: block;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 700;
  color: var(--color-text-muted);
  margin-bottom: 6px;
}

.callout-body {
  margin: 0;
  font-size: 0.94rem;
  line-height: 1.5;
  color: var(--color-ink);
}

.goals-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.goals-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.goal-statement {
  font-weight: 500;
  color: var(--color-ink);
}

.goal-meta {
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.protocol-blocks {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.protocol-card {
  background: var(--color-surface-muted, #f7f9fa);
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-primary);
  border-radius: var(--radius-sm);
  padding: 14px 18px;
}

.protocol-tag {
  display: block;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 700;
  color: var(--color-primary-ink, #084840);
  margin-bottom: 6px;
}

.protocol-text {
  margin: 0;
  font-size: 0.94rem;
  line-height: 1.5;
  color: var(--color-ink);
}

.criteria-card {
  border-left-color: var(--color-border-strong);
}

.criteria-hint {
  display: block;
  font-size: 0.82rem;
  color: var(--color-text-muted);
  margin-top: 6px;
}

.targets-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.target-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.target-card:hover {
  border-color: var(--color-border-strong);
  box-shadow: var(--shadow-sm);
}

.target-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.target-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.target-order {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--color-text-muted);
}

.target-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--color-ink);
}

.target-badges {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.method-tag {
  font-size: 0.82rem;
  color: var(--color-text-muted);
  background: var(--color-surface-muted, #f7f9fa);
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
}

.target-definition {
  margin: 0;
  font-size: 0.92rem;
  color: var(--color-text-muted);
  line-height: 1.45;
}

.target-meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px 18px;
  background: var(--color-surface-muted, #f7f9fa);
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  margin: 0;
}

.target-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 8px;
  border-top: 1px solid var(--color-border);
}

.order-actions,
.record-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.empty-targets,
.empty-docs {
  text-align: center;
  padding: 32px 20px;
  color: var(--color-text-muted);
  background: var(--color-surface-muted, #f7f9fa);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.form-card {
  border: 2px solid var(--color-primary-soft, #e7f4f2);
}

.observation-card {
  border: 2px solid var(--color-primary-soft, #e7f4f2);
  background: #fafcfb;
}

.notes-content {
  margin-bottom: 8px;
}

.attachments-area {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.documents-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.document-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: var(--color-surface-muted, #f7f9fa);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: 0.92rem;
}

.status-unscanned {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.status-rejected {
  font-size: 0.8rem;
  color: var(--color-danger);
  font-weight: 600;
}

.upload-wrapper {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.upload-actions {
  display: flex;
  justify-content: flex-start;
}

.tasks-header {
  align-items: center;
}

.empty-tasks {
  text-align: center;
  padding: 32px 16px;
  background: var(--color-surface-muted, #f7f9fa);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md, 8px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.empty-tasks p {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.95rem;
}

.tasks-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 8px);
  background: var(--color-surface);
}

.tasks-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.92rem;
  text-align: left;
}

.tasks-table th,
.tasks-table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  vertical-align: middle;
}

.tasks-table th {
  background: var(--color-surface-muted, #f8fafc);
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
}

.tasks-table tr:last-child td {
  border-bottom: none;
}

.tasks-table tr:hover td {
  background: var(--color-surface-muted, #fbfcfd);
}

.task-title {
  font-weight: 600;
  color: var(--color-ink);
}

.task-title-link {
  text-decoration: none;
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  cursor: pointer;
  text-align: left;
}

.task-title-link:hover .task-title {
  color: var(--color-primary);
  text-decoration: underline;
}

.actions-col {
  width: 160px;
}

.row-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.trials-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  padding: 2px 8px;
  font-size: 0.85rem;
  font-weight: 700;
  border-radius: 9999px;
  background: var(--color-surface-muted, #eef2f6);
  color: var(--color-text);
}

.criteria-label {
  font-weight: 500;
  color: var(--color-ink);
}

.criteria-sub {
  display: block;
  font-size: 0.78rem;
  color: var(--color-text-muted);
  margin-top: 2px;
}

.sd-cell {
  max-width: 240px;
}

.sd-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.35;
  color: var(--color-text);
}

.text-muted {
  color: var(--color-text-muted);
}

@media (max-width: 640px) {
  .detail-section,
  .overview-banner {
    padding: 16px;
    gap: 16px;
  }

  .banner-metrics {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .metric-divider {
    display: none;
  }

  .details-grid {
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .target-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .target-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .order-actions,
  .record-actions {
    justify-content: space-between;
  }
}
</style>
