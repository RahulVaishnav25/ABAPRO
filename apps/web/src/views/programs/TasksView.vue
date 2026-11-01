<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { CARE_STATUSES, type ProgramSummary } from '@abapro/shared';
import { createTaskRequest, tasksRequest, updateTaskRequest, type CreateTaskInput, type TaskItem } from '@/api/tasks';
import CreateTaskModal from '@/components/programs/CreateTaskModal.vue';
import ProgramModuleTabs from '@/components/programs/ProgramModuleTabs.vue';
import ActionMenu from '@/components/ui/ActionMenu.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTable from '@/components/ui/AppTable.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { careStatusTone, phaseTone } from '@/lib/format';
import { useToastStore } from '@/stores/toast';
import { errorMessage, useLoader } from '@/lib/loader';

const toast = useToastStore();
const { t } = useI18n();

const tasks = ref<TaskItem[]>([]);
const programs = ref<ProgramSummary[]>([]);

const isModalOpen = ref(false);
const modalMode = ref<'create' | 'edit' | 'preview'>('create');
const selectedTask = ref<TaskItem | null>(null);
const submitting = ref(false);

const search = ref('');
const phaseFilter = ref('');
const statusFilter = ref('');

const { loading, error, load } = useLoader(async () => {
  const data = await tasksRequest();
  tasks.value = data.tasks;
  programs.value = data.programs;
}, t('tasks.error'));

function openCreateModal(): void {
  modalMode.value = 'create';
  selectedTask.value = null;
  isModalOpen.value = true;
}

function openEditModal(task: TaskItem): void {
  modalMode.value = 'edit';
  selectedTask.value = task;
  isModalOpen.value = true;
}

function openPreviewModal(task: TaskItem): void {
  modalMode.value = 'preview';
  selectedTask.value = task;
  isModalOpen.value = true;
}

async function handleTaskSubmit(input: CreateTaskInput): Promise<void> {
  submitting.value = true;
  try {
    if (modalMode.value === 'edit' && selectedTask.value) {
      const updated = await updateTaskRequest(selectedTask.value.id, input);
      const idx = tasks.value.findIndex((t) => t.id === updated.id);
      if (idx !== -1) {
        tasks.value[idx] = updated;
      }
      isModalOpen.value = false;
      toast.push({
        tone: 'success',
        title: t('tasks.updated'),
        message: t('tasks.updatedMessage', { name: updated.name }),
      });
    } else {
      const program = programs.value.find((item) => item.id === input.programId);
      if (!program) throw new Error(t('tasks.chooseProgramError'));
      const created = await createTaskRequest(program, input);
      tasks.value.unshift(created);
      isModalOpen.value = false;
      toast.push({
        tone: 'success',
        title: t('tasks.created'),
        message: t('tasks.createdMessage', { name: created.name }),
      });
    }
  } catch (err) {
    toast.push({
      tone: 'danger',
      title: modalMode.value === 'edit' ? t('tasks.updateFailed') : t('tasks.createFailed'),
      message: errorMessage(err, t('tasks.checkInputs')),
    });
  } finally {
    submitting.value = false;
  }
}

const phaseOptions = computed(() => [
  { value: '', label: t('tasks.anyPhase') },
  { value: 'Treatment', label: t('phases.Treatment') },
  { value: 'Baseline', label: t('phases.Baseline') },
]);
const statusOptions = computed(() => [
  { value: '', label: t('tasks.anyStatus') },
  ...CARE_STATUSES.map((value) => ({ value, label: t(`status.${value}`) })),
]);
const columns = computed(() => [
  { key: 'name', label: t('tasks.columns.name'), sortable: true },
  { key: 'program', label: t('tasks.columns.program'), sortable: true },
  { key: 'sd', label: t('tasks.columns.sd') },
  { key: 'phase', label: t('tasks.columns.phase'), sortable: true },
  { key: 'trials', label: t('tasks.columns.trials'), sortable: true, align: 'end' as const },
  { key: 'criteria', label: t('tasks.columns.criteria') },
  { key: 'status', label: t('tasks.columns.status'), sortable: true },
  { key: 'actions', label: t('tasks.columns.actions') },
]);

const rows = computed(() => {
  const q = search.value.trim().toLowerCase();
  return tasks.value
    .filter((task) => {
      if (phaseFilter.value && task.phase !== phaseFilter.value) return false;
      if (statusFilter.value && task.status !== statusFilter.value) return false;
      if (!q) return true;
      return [task.name, task.sd, task.programTitle, task.clientName].some((value) => (value || '').toLowerCase().includes(q));
    })
    .map((task) => ({
      id: task.id,
      name: task.name,
      program: task.programTitle || '',
      sd: task.sd || '',
      phase: t(`phases.${task.phase}`),
      trials: task.desiredTrials,
      criteria: t('tasks.criteria', { sessions: task.masterySessions, probe: task.masteryProbe }),
      status: t(`status.${task.status}`),
      task,
    }));
});

const taskOf = (row: Record<string, unknown>) => row.task as TaskItem;

function onAction(task: TaskItem, key: string): void {
  if (key === 'preview') openPreviewModal(task);
  else openEditModal(task);
}

onMounted(() => void load());
</script>

<template>
  <PageContainer>
    <ProgramModuleTabs />

    <PageHeader :title="t('tasks.title')" :description="t('tasks.description')">
      <template #actions>
        <AppButton icon="plus" @click="openCreateModal">{{ t('tasks.create') }}</AppButton>
      </template>
    </PageHeader>

    <div class="filter-bar">
      <AppInput v-model="search" type="search" :label="t('tasks.search')" :placeholder="t('tasks.searchPlaceholder')" />
      <AppSelect v-model="phaseFilter" :label="t('tasks.phase')" :options="phaseOptions" />
      <AppSelect v-model="statusFilter" :label="t('tasks.status')" :options="statusOptions" />
    </div>

    <ErrorState v-if="error" :title="t('tasks.unavailable')" :description="error" @retry="load" />
    <AppTable
      v-else
      :caption="t('tasks.caption')"
      :columns="columns"
      :rows="rows"
      row-key="id"
      :page-size="20"
      :searchable="false"
      :loading="loading"
    >
      <template #cell-name="{ row }">
        <button type="button" class="row-link" @click="openPreviewModal(taskOf(row))">{{ row.name }}</button>
      </template>
      <template #cell-program="{ row }">
        <RouterLink v-if="taskOf(row).programId" class="muted-link" :to="`/programs/${taskOf(row).programId}`">{{ row.program }}</RouterLink>
        <span v-else>—</span>
      </template>
      <template #cell-sd="{ row }">
        <span class="sd-text" :title="String(row.sd)">{{ row.sd || '—' }}</span>
      </template>
      <template #cell-phase="{ row }">
        <StatusBadge :tone="phaseTone(taskOf(row).phase)" :label="String(row.phase)" />
      </template>
      <template #cell-status="{ row }">
        <StatusBadge :tone="careStatusTone(taskOf(row).status)" :label="String(row.status)" />
      </template>
      <template #cell-actions="{ row }">
        <ActionMenu
          :label="t('tasks.actionsFor', { name: row.name })"
          :items="[{ key: 'preview', label: t('tasks.preview') }, { key: 'edit', label: t('tasks.edit') }]"
          @select="onAction(taskOf(row), $event)"
        />
      </template>
      <template #empty>
        <EmptyState icon="tasks" :title="t('tasks.empty')" :description="t('tasks.emptyHint')" />
      </template>
    </AppTable>

    <CreateTaskModal
      :open="isModalOpen"
      :mode="modalMode"
      :task="selectedTask"
      :submitting="submitting"
      :programs="programs"
      @close="isModalOpen = false"
      @submit="handleTaskSubmit"
      @edit="openEditModal"
    />
  </PageContainer>
</template>

<style scoped>
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
.row-link:focus-visible,
.muted-link:hover,
.muted-link:focus-visible {
  color: var(--color-primary-ink);
  text-decoration: underline;
}

.muted-link {
  color: inherit;
  text-decoration: none;
}

.sd-text {
  display: -webkit-box;
  max-width: 260px;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
</style>
