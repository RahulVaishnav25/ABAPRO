<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { ProgramSummary } from '@abapro/shared';
import { createTaskRequest, tasksRequest, updateTaskRequest, type CreateTaskInput, type TaskItem } from '@/api/tasks';
import CreateTaskModal from '@/components/programs/CreateTaskModal.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import type { BadgeTone } from '@/components/ui/types';
import { useToastStore } from '@/stores/toast';
import { errorMessage, useLoader } from '@/lib/loader';

const router = useRouter();
const toast = useToastStore();

const tasks = ref<TaskItem[]>([]);
const programs = ref<ProgramSummary[]>([]);

const isModalOpen = ref(false);
const modalMode = ref<'create' | 'edit' | 'preview'>('create');
const selectedTask = ref<TaskItem | null>(null);
const submitting = ref(false);

const page = ref(1);
const pageSize = 20;
const search = ref('');
const phaseFilter = ref('');
const statusFilter = ref('');
const sort = ref('name');
const direction = ref<'asc' | 'desc'>('asc');
let searchTimer = 0;

const { loading, error, load } = useLoader(async () => {
  const data = await tasksRequest();
  tasks.value = data.tasks;
  programs.value = data.programs;
}, 'Tasks could not be loaded.');

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
        title: 'Task updated',
        message: `Task "${updated.name}" has been updated successfully.`,
      });
    } else {
      const program = programs.value.find((item) => item.id === input.programId);
      if (!program) throw new Error('Choose a program for this task.');
      const created = await createTaskRequest(program, input);
      tasks.value.unshift(created);
      isModalOpen.value = false;
      toast.push({
        tone: 'success',
        title: 'Task created',
        message: `Task "${created.name}" has been created successfully.`,
      });
    }
  } catch (err) {
    toast.push({
      tone: 'danger',
      title: modalMode.value === 'edit' ? 'Failed to update task' : 'Failed to create task',
      message: errorMessage(err, 'Please check your inputs and try again.'),
    });
  } finally {
    submitting.value = false;
  }
}

const filteredTasks = computed(() => {
  const q = search.value.trim().toLowerCase();
  const pf = phaseFilter.value.toLowerCase();
  const sf = statusFilter.value.toLowerCase();

  return tasks.value.filter((t) => {
    if (pf && t.phase.toLowerCase() !== pf) return false;
    if (sf && t.status.toLowerCase() !== sf) return false;
    if (q) {
      const matchName = t.name.toLowerCase().includes(q);
      const matchSd = (t.sd || '').toLowerCase().includes(q);
      const matchProg = (t.programTitle || '').toLowerCase().includes(q);
      const matchClient = (t.clientName || '').toLowerCase().includes(q);
      if (!matchName && !matchSd && !matchProg && !matchClient) return false;
    }
    return true;
  });
});

const sortedTasks = computed(() => {
  const list = [...filteredTasks.value];
  const dir = direction.value === 'asc' ? 1 : -1;
  const key = sort.value;

  list.sort((a, b) => {
    if (key === 'name') {
      return dir * (a.name || '').localeCompare(b.name || '');
    }
    if (key === 'program') {
      return dir * (a.programTitle || '').localeCompare(b.programTitle || '');
    }
    if (key === 'phase') {
      return dir * (a.phase || '').localeCompare(b.phase || '');
    }
    if (key === 'trials') {
      return dir * (a.desiredTrials - b.desiredTrials);
    }
    if (key === 'status') {
      return dir * (a.status || '').localeCompare(b.status || '');
    }
    return 0;
  });

  return list;
});

const total = computed(() => sortedTasks.value.length);
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
const rangeStart = computed(() => (total.value === 0 ? 0 : (page.value - 1) * pageSize + 1));
const rangeEnd = computed(() => Math.min(page.value * pageSize, total.value));
const pagedItems = computed(() => {
  const start = (page.value - 1) * pageSize;
  return sortedTasks.value.slice(start, start + pageSize);
});

function toggleSort(key: string): void {
  if (sort.value === key) {
    direction.value = direction.value === 'asc' ? 'desc' : 'asc';
  } else {
    sort.value = key;
    direction.value = 'asc';
  }
  page.value = 1;
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
      return 'neutral';
    default:
      return 'neutral';
  }
}

function statusTone(taskStatus: string): BadgeTone {
  switch (taskStatus) {
    case 'active':
      return 'success';
    case 'mastered':
    case 'completed':
      return 'info';
    case 'inactive':
    default:
      return 'neutral';
  }
}

watch([phaseFilter, statusFilter], () => {
  page.value = 1;
});

watch(search, () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    page.value = 1;
  }, 250);
});

onMounted(() => void load());
</script>

<template>
  <PageContainer>
    <!-- Module Tabs under Programs -->
    <nav class="program-module-tabs" aria-label="Programs navigation">
      <RouterLink to="/programs" class="module-tab-link">
        Programs
      </RouterLink>
      <RouterLink to="/programs/tasks" class="module-tab-link is-active">
        Tasks
      </RouterLink>
    </nav>

    <!-- Page Header with "Create Task" button -->
    <PageHeader
      title="Tasks"
      description="Manage skill breakdown tasks, discriminative stimuli (SD), and target mastery criteria."
    >
      <template #actions>
        <AppButton variant="secondary" @click="router.push('/programs')">View Programs</AppButton>
        <AppButton @click="openCreateModal">Create Task</AppButton>
      </template>
    </PageHeader>

    <!-- Filter Bar matching existing listing pages -->
    <div class="filter-bar">
      <AppInput v-model="search" label="Search" placeholder="Task name, SD, or program" />
      <AppSelect
        v-model="phaseFilter"
        label="Phase"
        :options="[
          { value: '', label: 'Any phase' },
          { value: 'Treatment', label: 'Treatment' },
          { value: 'Baseline', label: 'Baseline' },
        ]"
      />
      <AppSelect
        v-model="statusFilter"
        label="Status"
        :options="[
          { value: '', label: 'Any status' },
          { value: 'active', label: 'Active' },
          { value: 'mastered', label: 'Mastered' },
          { value: 'inactive', label: 'Inactive' },
        ]"
      />
    </div>

    <!-- Loading / Error / Empty / Table States -->
    <SkeletonBlock v-if="loading" height="240px" />
    <ErrorState v-else-if="error" title="Tasks directory unavailable" :description="error" @retry="load" />
    <EmptyState
      v-else-if="filteredTasks.length === 0"
      title="No tasks match"
      description="Create a task or adjust your filters."
    />
    <div v-else class="table-wrap panel">
      <table>
        <caption>Task directory</caption>
        <thead>
          <tr>
            <th><button type="button" @click="toggleSort('name')">Task name</button></th>
            <th><button type="button" @click="toggleSort('program')">Program</button></th>
            <th>SD</th>
            <th><button type="button" @click="toggleSort('phase')">Phase</button></th>
            <th><button type="button" @click="toggleSort('trials')">Desired trials</button></th>
            <th>Mastery criteria</th>
            <th><button type="button" @click="toggleSort('status')">Status</button></th>
            <th class="actions-col">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="task in pagedItems" :key="task.id">
            <td>
              <button
                type="button"
                class="task-title-link"
                @click="openPreviewModal(task)"
              >
                <strong class="task-title">{{ task.name }}</strong>
              </button>
            </td>
            <td>
              <RouterLink
                v-if="task.programId"
                class="program-link"
                :to="`/programs/${task.programId}`"
              >
                {{ task.programTitle || 'View program' }}
              </RouterLink>
              <span v-else class="text-muted">—</span>
            </td>
            <td class="sd-cell">
              <span v-if="task.sd" class="sd-text" :title="task.sd">{{ task.sd }}</span>
              <span v-else class="text-muted">—</span>
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
            </td>
            <td>
              <StatusBadge :tone="statusTone(task.status)" :label="task.status" />
            </td>
            <td>
              <div class="row-actions">
                <AppButton size="sm" variant="secondary" @click="openPreviewModal(task)">Preview</AppButton>
                <AppButton size="sm" variant="secondary" @click="openEditModal(task)">Edit</AppButton>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pager matching existing listing pages -->
    <div v-if="!loading && !error && filteredTasks.length > 0" class="pager">
      <span>Showing {{ rangeStart }}–{{ rangeEnd }} of {{ total }}</span>
      <AppButton variant="secondary" size="sm" :disabled="page <= 1" @click="page -= 1">Previous</AppButton>
      <span>Page {{ page }} of {{ pageCount }}</span>
      <AppButton variant="secondary" size="sm" :disabled="page >= pageCount" @click="page += 1">Next</AppButton>
    </div>

    <!-- Task Modal (Create, Edit, and Preview) -->
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
.program-module-tabs {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 20px;
}

.module-tab-link {
  display: inline-flex;
  align-items: center;
  padding: 8px 16px;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-decoration: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}

.module-tab-link:hover {
  color: var(--color-ink);
}

.module-tab-link.is-active {
  color: var(--color-primary-ink);
  border-bottom-color: var(--color-primary);
}

.table-wrap {
  overflow-x: auto;
  padding: 12px;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  text-align: left;
  vertical-align: middle;
  padding: 12px 10px;
  border-bottom: 1px solid var(--color-border);
}

th button {
  border: 0;
  background: transparent;
  font-weight: 700;
  padding: 0;
  cursor: pointer;
  color: inherit;
  font-family: inherit;
  font-size: inherit;
}

th button:hover {
  color: var(--color-primary);
}

caption {
  text-align: left;
  font-weight: 700;
  padding: 4px 0 12px;
  color: var(--color-text-muted);
  font-size: 0.95rem;
}

.task-title {
  color: var(--color-ink);
  font-weight: 600;
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

.program-link {
  color: var(--color-primary-ink);
  font-weight: 500;
  text-decoration: none;
}

.program-link:hover {
  text-decoration: underline;
}

.sd-cell {
  max-width: 260px;
}

.sd-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-muted);
  font-size: 0.92rem;
}

.trials-badge {
  font-weight: 600;
  color: var(--color-ink);
}

.criteria-label {
  font-size: 0.88rem;
  color: var(--color-text-muted);
}

.text-muted {
  color: var(--color-text-subtle);
}

.pager {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  font-size: 0.92rem;
  color: var(--color-text-muted);
}
</style>
