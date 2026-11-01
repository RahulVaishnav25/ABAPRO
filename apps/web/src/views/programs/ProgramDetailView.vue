<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { careStatusLabel, type MeasurementMethod, type ProgramDetail } from '@abapro/shared';
import type { BadgeTone } from '@/components/ui/types';
import { programRequest } from '@/api/programs';
import { createTaskRequest, programTasks, updateTaskRequest, type CreateTaskInput, type TaskItem } from '@/api/tasks';
import CreateTaskModal from '@/components/programs/CreateTaskModal.vue';
import AppButton from '@/components/ui/AppButton.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import ProgramCommunicationSection from '@/components/programs/communication/ProgramCommunicationSection.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { careStatusTone } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { errorMessage, useLoader } from '@/lib/loader';

function measurementLabel(method: MeasurementMethod): string {
  return { trial: 'Trial by trial', probe: 'Probe', frequency: 'Frequency', duration: 'Duration', abc: 'ABC' }[method];
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

const auth = useAuthStore();
const toast = useToastStore();
const route = useRoute();
const router = useRouter();
const programId = computed(() => String(route.params.programId ?? ''));
const program = ref<ProgramDetail | null>(null);
const tasks = computed(() => (program.value ? programTasks(program.value) : []));
const isCreateTaskOpen = ref(false);
const taskModalMode = ref<'create' | 'edit' | 'preview'>('create');
const selectedTask = ref<TaskItem | null>(null);
const submittingTask = ref(false);


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
          <StatusBadge :tone="careStatusTone(program.status)" :label="careStatusLabel(program.status)" />
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
            <span class="metric-label">Tasks</span>
            <span class="metric-value">{{ program.targets.length }} task{{ program.targets.length === 1 ? '' : 's' }}</span>
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
            <span class="criteria-hint">Recorded for clinical reference. The clinician decides task mastery and phase transitions.</span>
          </div>
        </div>
      </section>

      <!-- Section: Tasks -->
      <section class="detail-section">
        <div class="section-header tasks-header">
          <div>
            <h2 class="section-title">
              Tasks
              <span class="count-badge">{{ tasks.length }}</span>
            </h2>
            <p class="section-desc">Clinical tasks and their criteria configured for this program</p>
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
                  <StatusBadge :tone="careStatusTone(task.status)" :label="careStatusLabel(task.status)" />
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

      <!-- Section: Notes, attachments and home activities -->
      <section class="detail-section">
        <div class="section-header">
          <div>
            <h2 class="section-title">Notes & Attachments</h2>
            <p class="section-desc">Session notes, files, audio and home activities, shared with the child’s parents</p>
          </div>
        </div>
        <ProgramCommunicationSection :program-id="program.id" :legacy-notes="program.notes" />
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
  border-inline-start: 3px solid var(--color-primary);
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
  border-inline-start-color: var(--color-border-strong);
}

.criteria-hint {
  display: block;
  font-size: 0.82rem;
  color: var(--color-text-muted);
  margin-top: 6px;
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
  text-align: start;
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
  text-align: start;
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
}
</style>
