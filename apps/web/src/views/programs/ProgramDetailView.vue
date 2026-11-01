<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { ProgramDetail } from '@abapro/shared';
import { programRequest } from '@/api/programs';
import { createTaskRequest, programTasks, updateTaskRequest, type CreateTaskInput, type TaskItem } from '@/api/tasks';
import CreateTaskModal from '@/components/programs/CreateTaskModal.vue';
import ActionMenu from '@/components/ui/ActionMenu.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppTable from '@/components/ui/AppTable.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import ProgramCommunicationSection from '@/components/programs/communication/ProgramCommunicationSection.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { careStatusTone, formatDate, phaseTone } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { errorMessage, useLoader } from '@/lib/loader';

const auth = useAuthStore();
const toast = useToastStore();
const route = useRoute();
const router = useRouter();
const { t, te } = useI18n();
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
}, t('programs.detail.error'));

async function handleTaskSubmit(input: CreateTaskInput): Promise<void> {
  if (!program.value) return;
  submittingTask.value = true;
  try {
    if (taskModalMode.value === 'edit' && selectedTask.value) {
      const updated = await updateTaskRequest(selectedTask.value.id, input);
      toast.push({
        tone: 'success',
        title: t('tasks.updated'),
        message: t('tasks.updatedMessage', { name: updated.name }),
      });
    } else {
      const created = await createTaskRequest(program.value, input);
      toast.push({
        tone: 'success',
        title: t('tasks.created'),
        message: t('tasks.createdMessage', { name: created.name }),
      });
    }
    isCreateTaskOpen.value = false;
    program.value = await programRequest(program.value.id);
  } catch (err) {
    toast.push({
      tone: 'danger',
      title: taskModalMode.value === 'edit' ? t('tasks.updateFailed') : t('tasks.createFailed'),
      message: errorMessage(err, t('tasks.checkInputs')),
    });
  } finally {
    submittingTask.value = false;
  }
}

/** The saved procedure, translated when it is one of the standard ones. */
const procedureName = computed(() => {
  const value = program.value?.measurementProcedure;
  if (value) return te(`programs.form.procedures.${value}`) ? t(`programs.form.procedures.${value}`) : value;
  return program.value ? t(`programs.measurement.${program.value.measurementType}`) : '';
});

const taskColumns = computed(() => [
  { key: 'name', label: t('tasks.columns.name'), sortable: true },
  { key: 'phase', label: t('tasks.columns.phase'), sortable: true },
  { key: 'trials', label: t('tasks.columns.trials'), sortable: true, align: 'end' as const },
  { key: 'criteria', label: t('tasks.columns.criteria') },
  { key: 'sd', label: t('tasks.columns.sd') },
  { key: 'status', label: t('tasks.columns.status'), sortable: true },
  { key: 'actions', label: t('tasks.columns.actions') },
]);
const taskRows = computed(() =>
  tasks.value.map((task) => ({
    id: task.id,
    name: task.name,
    phase: t(`phases.${task.phase}`),
    trials: task.desiredTrials,
    criteria: t('tasks.criteria', { sessions: task.masterySessions, probe: task.masteryProbe }),
    sd: task.sd || '',
    status: t(`status.${task.status}`),
    task,
  })),
);
const taskOf = (row: Record<string, unknown>) => row.task as TaskItem;

/** The protocol texts that have content, in reading order. */
const protocolBlocks = computed(() => {
  const value = program.value;
  if (!value) return [];
  return [
    { key: 'teachingSteps', text: value.teachingProcedure },
    { key: 'masterySteps', text: value.masterySteps },
    { key: 'errorCorrection', text: value.errorCorrectionProcedure },
    { key: 'netIdea', text: value.netTeachingIdea },
  ].filter((block) => block.text);
});

onMounted(() => void load());
</script>

<template>
  <PageContainer>
    <SkeletonBlock v-if="loading" height="260px" />
    <ErrorState v-else-if="error || !program" :title="t('programs.detail.unavailable')" :description="error" @retry="load" />
    <div v-else class="program-detail">
      <PageHeader :title="program.title" back-to="/programs" :back-label="t('programs.title')">
        <template #meta>
          <RouterLink class="client-link" :to="`/clients/${program.clientId}`">{{ program.clientName }}</RouterLink>
        </template>
        <template #actions>
          <AppButton variant="secondary" @click="router.push(`/clients/${program.clientId}`)">{{ t('programs.detail.clientProfile') }}</AppButton>
          <AppButton v-if="auth.can('programs.edit')" icon="edit" @click="router.push(`/programs/${program.id}/edit`)">{{ t('programs.detail.editProgram') }}</AppButton>
        </template>
      </PageHeader>

      <!-- Summary -->
      <section class="summary" :aria-label="t('programs.detail.overview')">
        <div class="summary-badges">
          <StatusBadge :tone="careStatusTone(program.status)" :label="t(`status.${program.status}`)" />
          <span class="version-tag">{{ t('programs.detail.version', { n: program.configurationVersion }) }}</span>
        </div>
        <dl class="summary-metrics">
          <div>
            <dt>{{ t('programs.detail.domain') }}</dt>
            <dd>{{ program.domain || t('programs.general') }}</dd>
          </div>
          <div>
            <dt>{{ t('programs.detail.procedure') }}</dt>
            <dd>{{ procedureName }}</dd>
          </div>
          <div>
            <dt>{{ t('programs.detail.tasks') }}</dt>
            <dd>{{ t('card.tasks', program.targets.length) }}</dd>
          </div>
          <div>
            <dt>{{ t('programs.detail.implemented') }}</dt>
            <dd>{{ formatDate(program.dateImplemented, t('programs.notSet')) }}</dd>
          </div>
        </dl>
      </section>

      <div class="detail-columns">
        <section class="settings-card">
          <div class="section-heading">
            <h2>{{ t('programs.detail.overview') }}</h2>
            <p class="section-desc">{{ t('programs.detail.overviewHint') }}</p>
          </div>
          <dl class="detail-list">
            <div>
              <dt>{{ t('programs.detail.client') }}</dt>
              <dd><RouterLink :to="`/clients/${program.clientId}`">{{ program.clientName }}</RouterLink></dd>
            </div>
            <div>
              <dt>{{ t('programs.detail.domain') }}</dt>
              <dd>{{ program.domain || t('programs.notSpecified') }}</dd>
            </div>
            <div>
              <dt>{{ t('programs.detail.implemented') }}</dt>
              <dd>{{ formatDate(program.dateImplemented, t('programs.notSet')) }}</dd>
            </div>
            <div>
              <dt>{{ t('programs.detail.mastered') }}</dt>
              <dd>{{ formatDate(program.dateMastered, t('programs.notSet')) }}</dd>
            </div>
            <div>
              <dt>{{ t('programs.detail.assessmentType') }}</dt>
              <dd>{{ program.assessmentType || t('programs.none') }}</dd>
            </div>
            <div>
              <dt>{{ t('programs.detail.reviewDate') }}</dt>
              <dd>{{ formatDate(program.reviewOn, t('programs.notScheduled')) }}</dd>
            </div>
            <div v-if="program.assessmentId">
              <dt>{{ t('programs.detail.linkedAssessment') }}</dt>
              <dd>
                <RouterLink :to="`/assessments/${program.assessmentId}`">{{ program.assessmentName || t('programs.detail.viewAssessment') }}</RouterLink>
              </dd>
            </div>
          </dl>
          <div v-if="program.description || program.objective || program.goals.length" class="text-blocks">
            <div v-if="program.description" class="text-block">
              <h3>{{ t('programs.detail.descriptionLabel') }}</h3>
              <p>{{ program.description }}</p>
            </div>
            <div v-if="program.objective" class="text-block">
              <h3>{{ t('programs.detail.objective') }}</h3>
              <p>{{ program.objective }}</p>
            </div>
            <div v-if="program.goals.length" class="text-block">
              <h3>{{ t('programs.detail.goals') }}</h3>
              <ul class="goal-list">
                <li v-for="goal in program.goals" :key="goal.id">
                  <span>{{ goal.statement }}</span>
                  <span v-if="goal.reviewOn" class="goal-meta">{{ t('programs.detail.goalReview', { date: formatDate(goal.reviewOn) }) }}</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section class="settings-card">
          <div class="section-heading">
            <h2>{{ t('programs.detail.protocol') }}</h2>
            <p class="section-desc">{{ t('programs.detail.protocolHint') }}</p>
          </div>
          <dl class="detail-list">
            <div class="is-wide">
              <dt>{{ t('programs.detail.sd') }}</dt>
              <dd class="pre">{{ program.sd || t('programs.notSpecified') }}</dd>
            </div>
            <div>
              <dt>{{ t('programs.detail.teachingMethod') }}</dt>
              <dd>{{ program.teachingMethod || t('programs.notSpecified') }}</dd>
            </div>
            <div>
              <dt>{{ t('programs.detail.procedure') }}</dt>
              <dd>{{ procedureName }}</dd>
            </div>
          </dl>
          <div class="text-blocks">
            <div v-for="block in protocolBlocks" :key="block.key" class="text-block">
              <h3>{{ t(`programs.detail.${block.key}`) }}</h3>
              <p class="pre">{{ block.text }}</p>
            </div>
            <div class="text-block is-criteria">
              <h3>{{ t('programs.detail.masteryCriteria') }}</h3>
              <p class="pre">{{ program.masteryCriteria || t('programs.notRecorded') }}</p>
              <p class="criteria-hint">{{ t('programs.detail.criteriaHint') }}</p>
            </div>
          </div>
        </section>
      </div>

      <section class="settings-card">
        <header class="card-header">
          <div class="section-heading">
            <h2>{{ t('programs.detail.tasks') }} <span class="count">{{ tasks.length }}</span></h2>
            <p class="section-desc">{{ t('programs.detail.tasksHint') }}</p>
          </div>
          <AppButton type="button" icon="plus" @click="openCreateTaskModal">{{ t('programs.detail.addTask') }}</AppButton>
        </header>
        <EmptyState v-if="tasks.length === 0" icon="tasks" :title="t('programs.detail.noTasks')" :description="t('programs.detail.noTasksHint')">
          <template #actions>
            <AppButton type="button" variant="secondary" icon="plus" @click="openCreateTaskModal">{{ t('programs.detail.addFirstTask') }}</AppButton>
          </template>
        </EmptyState>
        <AppTable
          v-else
          class="task-table"
          :caption="t('programs.detail.tasks')"
          :columns="taskColumns"
          :rows="taskRows"
          row-key="id"
          :page-size="10"
          :searchable="false"
          density="compact"
        >
          <template #cell-name="{ row }">
            <button type="button" class="row-link" @click="openPreviewTaskModal(taskOf(row))">{{ row.name }}</button>
          </template>
          <template #cell-phase="{ row }">
            <StatusBadge :tone="phaseTone(taskOf(row).phase)" :label="String(row.phase)" />
          </template>
          <template #cell-criteria="{ row }">
            <span>{{ row.criteria }}</span>
            <small v-if="taskOf(row).phase === 'Baseline' && taskOf(row).baselineSessions" class="criteria-sub">
              {{ t('tasks.baselineCriteria', { sessions: taskOf(row).baselineSessions, probe: taskOf(row).baselineProbe ?? 100 }) }}
            </small>
          </template>
          <template #cell-sd="{ row }">
            <span class="sd-text" :title="String(row.sd)">{{ row.sd || '—' }}</span>
          </template>
          <template #cell-status="{ row }">
            <StatusBadge :tone="careStatusTone(taskOf(row).status)" :label="String(row.status)" />
          </template>
          <template #cell-actions="{ row }">
            <ActionMenu
              :label="t('tasks.actionsFor', { name: row.name })"
              :items="[{ key: 'preview', label: t('tasks.preview') }, { key: 'edit', label: t('tasks.edit') }]"
              @select="$event === 'preview' ? openPreviewTaskModal(taskOf(row)) : openEditTaskModal(taskOf(row))"
            />
          </template>
        </AppTable>
      </section>

      <section class="settings-card">
        <div class="section-heading">
          <h2>{{ t('programs.detail.comms') }}</h2>
          <p class="section-desc">{{ t('programs.detail.commsHint') }}</p>
        </div>
        <ProgramCommunicationSection :program-id="program.id" :legacy-notes="program.notes" />
      </section>

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
.program-detail {
  display: grid;
  gap: var(--space-5);
}

.client-link {
  color: var(--color-text-muted);
  font-weight: 500;
  text-decoration: none;
}

.client-link:hover,
.client-link:focus-visible {
  color: var(--color-primary-ink);
  text-decoration: underline;
}

.summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4) var(--space-8);
  padding: var(--space-5) var(--space-6);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
}

.summary-badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.version-tag {
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--color-surface-sunken);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-weight: 600;
}

.summary-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3) var(--space-8);
}

.summary-metrics dt {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-weight: 500;
}

.summary-metrics dd {
  margin: 2px 0 0;
  color: var(--color-ink);
  font-weight: 600;
}

.detail-columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
  gap: var(--space-5);
  align-items: start;
}

.detail-list .is-wide {
  grid-column: 1 / -1;
}

.pre {
  white-space: pre-wrap;
}

.text-blocks {
  display: grid;
  gap: var(--space-3);
}

.text-block {
  display: grid;
  gap: 4px;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
}

.text-block h3 {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: 600;
}

.text-block.is-criteria {
  border-inline-start: 3px solid var(--color-primary);
}

.criteria-hint,
.goal-meta {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}

.goal-list {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding-inline-start: var(--space-5);
}

.goal-list li {
  display: grid;
}

.count {
  margin-inline-start: 6px;
  padding: 1px 8px;
  border-radius: var(--radius-full);
  background: var(--color-surface-sunken);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-weight: 600;
  vertical-align: middle;
}

.task-table :deep(.table-card) {
  box-shadow: none;
}

.row-link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-ink);
  font: inherit;
  font-weight: 600;
  text-align: start;
  cursor: pointer;
}

.row-link:hover,
.row-link:focus-visible {
  color: var(--color-primary-ink);
  text-decoration: underline;
}

.criteria-sub {
  display: block;
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}

.sd-text {
  display: -webkit-box;
  max-width: 240px;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

@media (max-width: 520px) {
  .detail-columns {
    grid-template-columns: minmax(0, 1fr);
  }

  .summary {
    padding: var(--space-4);
  }
}
</style>
