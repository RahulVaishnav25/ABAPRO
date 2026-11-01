<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  CARE_STATUSES,
  type CareStatus,
  type ClientDirectoryItem,
  type ProgramSummary,
  type PromptLevel,
  type RecordResponse,
  type TaskRecordingStatus,
} from '@abapro/shared';
import { clientDirectoryRequest } from '@/api/clients';
import {
  programsRequest,
  recordingStatusesRequest,
  recordTaskRequest,
  setProgramStatusRequest,
  setTaskStatusRequest,
  targetsRequest,
} from '@/api/programs';
import { createTaskRequest, toTask, updateTaskRequest, type CreateTaskInput, type TaskItem } from '@/api/tasks';
import AppIcon from '@/components/navigation/AppIcon.vue';
import CreateTaskModal from '@/components/programs/CreateTaskModal.vue';
import type { ActionMenuItem } from '@/components/ui/ActionMenu.vue';
import ProgramCard from '@/components/therapist/ProgramCard.vue';
import RecordDialog from '@/components/therapist/RecordDialog.vue';
import StatusChangeDialog from '@/components/therapist/StatusChangeDialog.vue';
import TaskGraphDialog from '@/components/therapist/TaskGraphDialog.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import { errorMessage, useLoader } from '@/lib/loader';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';

type StatusFilter = 'all' | CareStatus;
type ViewMode = 'horizontal' | 'vertical';

const MASTERED_STATUS: CareStatus = 'mastered';
const COLUMN_ORDER: CareStatus[] = ['in_treatment', 'maintenance', 'on_hold', 'mastered'];
const FILTER_OPTIONS: StatusFilter[] = ['all', ...COLUMN_ORDER];
const VIEW_OPTIONS: Array<{ value: ViewMode; icon: string }> = [
  { value: 'horizontal', icon: 'layout-horizontal' },
  { value: 'vertical', icon: 'layout-vertical' },
];

const route = useRoute();
const router = useRouter();
const toast = useToastStore();
const auth = useAuthStore();
const { t } = useI18n();
const statusName = (status: CareStatus) => t(`status.${status}`);
const filterLabel = (filter: StatusFilter) => (filter === 'all' ? t('workspace.all') : statusName(filter));

const clients = ref<ClientDirectoryItem[]>([]);
const clientSearch = ref('');
/** Matches the full name as well as the initials and code shown on each tile. */
const filteredClients = computed(() => {
  const query = clientSearch.value.trim().toLowerCase();
  if (!query) return clients.value;
  return clients.value.filter((client) =>
    [client.displayName, client.preferredName ?? '', client.initials, client.clientCode].some((value) => value.toLowerCase().includes(query)),
  );
});
const programs = ref<ProgramSummary[]>([]);
const tasks = ref<TaskItem[]>([]);
/** Today's shared recording capacity, by task. */
const recording = ref(new Map<string, TaskRecordingStatus>());
const expanded = ref(new Set<string>());

// Client, status filter and view live in the URL so the workspace survives a reload.
const selectedId = computed(() => (typeof route.query.client === 'string' ? route.query.client : ''));
const selected = computed(() => clients.value.find((client) => client.id === selectedId.value) ?? null);
const statusFilter = computed<StatusFilter>(() => {
  const value = route.query.status;
  return typeof value === 'string' && (CARE_STATUSES as readonly string[]).includes(value) ? (value as CareStatus) : 'all';
});
const viewMode = computed<ViewMode>(() => {
  const value = route.query.view;
  return value === 'vertical' ? 'vertical' : 'horizontal';
});

function setQuery(patch: Record<string, string | undefined>): void {
  void router.replace({ query: { ...route.query, ...patch } });
}

function matches(status: CareStatus): boolean {
  return statusFilter.value === 'all' || status === statusFilter.value;
}

/** Tasks of a program that match the status filter. */
function tasksFor(programId: string): TaskItem[] {
  return tasks.value.filter((task) => task.programId === programId && matches(task.status));
}

/** Programs that match the filter, plus programs holding a matching task so that task keeps its context. */
const visiblePrograms = computed(() =>
  programs.value
    .filter((program) => matches(program.status) || tasksFor(program.id).length > 0)
    .sort((a, b) => COLUMN_ORDER.indexOf(a.status) - COLUMN_ORDER.indexOf(b.status)),
);

/** Programs and tasks with the given status, or every program and task for All. */
function filterCount(filter: StatusFilter): number {
  const counted = (status: CareStatus) => filter === 'all' || status === filter;
  return programs.value.filter((program) => counted(program.status)).length + tasks.value.filter((task) => counted(task.status)).length;
}

function expand(programId: string): void {
  expanded.value = new Set(expanded.value).add(programId);
}

const clientLoader = useLoader(async () => {
  clients.value = (await clientDirectoryRequest({ pageSize: 50, sort: 'code' })).items;
  if (!selectedId.value && clients.value[0]) {
    await router.replace({ query: { ...route.query, client: clients.value[0].id } });
  }
}, t('workspace.clientsError'));

// After the first load, switching clients keeps the current content in place until the next client loads.
const workspaceLoaded = ref(false);

const workspaceLoader = useLoader(async () => {
  if (!selectedId.value) {
    programs.value = [];
    tasks.value = [];
    recording.value = new Map();
    return;
  }
  const [clientPrograms, allTasks, statuses] = await Promise.all([
    programsRequest(selectedId.value),
    targetsRequest(),
    recordingStatusesRequest(selectedId.value),
  ]);
  programs.value = clientPrograms;
  tasks.value = allTasks.filter((task) => task.clientId === selectedId.value).map(toTask);
  recording.value = statusMap(statuses);
  workspaceLoaded.value = true;
}, t('workspace.programsError'), false);

function selectClient(id: string): void {
  expanded.value = new Set();
  setQuery({ client: id });
}

watch(selectedId, () => void workspaceLoader.load());

// Status changes.
interface PendingChange {
  kind: 'program' | 'task';
  programId: string;
  taskId?: string;
  name: string;
  status: CareStatus;
  title: string;
}
const pending = ref<PendingChange | null>(null);
const saving = ref(false);

function programActions(program: ProgramSummary): ActionMenuItem[] {
  const items: ActionMenuItem[] = [];
  items.push({ key: 'add-task', label: t('workspace.actions.addTask') }, { key: 'tasks', label: t('workspace.actions.viewTasks') });
  if (program.status !== 'on_hold') items.push({ key: 'hold', label: t('workspace.actions.moveOnHold') });
  if (program.status !== MASTERED_STATUS) items.push({ key: 'mastered', label: t('workspace.actions.markMastered') });
  return items;
}

function taskActions(task: TaskItem): ActionMenuItem[] {
  const items: ActionMenuItem[] = [];
  items.push({ key: 'graph', label: t('workspace.actions.viewGraph') });
  if (task.status !== 'on_hold') items.push({ key: 'hold', label: t('workspace.actions.moveOnHold') });
  if (task.status !== MASTERED_STATUS) items.push({ key: 'mastered', label: t('workspace.actions.markMastered') });
  return items;
}

function onProgramAction(program: ProgramSummary, key: string): void {
  if (key === 'hold' || key === 'mastered') {
    pending.value = {
      kind: 'program',
      programId: program.id,
      name: program.title,
      status: key === 'hold' ? 'on_hold' : MASTERED_STATUS,
      title: key === 'hold' ? t('workspace.statusDialog.programOnHold') : t('workspace.statusDialog.programMastered'),
    };
  } else if (key === 'tasks') {
    expand(program.id);
    document.getElementById(`program-${program.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else if (key === 'add-task') {
    taskProgram.value = program;
  }
}

function onTaskAction(task: TaskItem, key: string): void {
  if (key === 'hold' || key === 'mastered') {
    pending.value = {
      kind: 'task',
      programId: task.programId,
      taskId: task.id,
      name: task.name,
      status: key === 'hold' ? 'on_hold' : MASTERED_STATUS,
      title: key === 'hold' ? t('workspace.statusDialog.taskOnHold') : t('workspace.statusDialog.taskMastered'),
    };
  } else if (key === 'graph') {
    graphTask.value = task;
  }
}

const pendingDescription = computed(() =>
  pending.value ? t('workspace.statusDialog.description', { name: pending.value.name, status: statusName(pending.value.status) }) : '',
);

async function confirmChange(reason: string): Promise<void> {
  const change = pending.value;
  if (!change) return;
  saving.value = true;
  try {
    const body = { status: change.status, changeReason: reason };
    if (change.kind === 'program') await setProgramStatusRequest(change.programId, body);
    else await setTaskStatusRequest(change.programId, change.taskId ?? '', body);
    toast.push({ tone: 'success', title: t('workspace.statusUpdated'), message: t('workspace.statusUpdatedMessage', { name: change.name, status: statusName(change.status) }) });
    pending.value = null;
    await workspaceLoader.load();
  } catch (changeError) {
    toast.push({ tone: 'danger', title: t('workspace.statusNotChanged'), message: errorMessage(changeError, t('errors.generic')) });
  } finally {
    saving.value = false;
  }
}

// Add Task.
const taskProgram = ref<ProgramSummary | null>(null);
const addingTask = ref(false);

async function addTask(input: CreateTaskInput): Promise<void> {
  const program = taskProgram.value;
  if (!program) return;
  addingTask.value = true;
  try {
    const created = await createTaskRequest(program, input);
    toast.push({ tone: 'success', title: t('workspace.taskAdded'), message: t('workspace.taskAddedMessage', { task: created.name, program: program.title }) });
    taskProgram.value = null;
    expand(program.id);
    await workspaceLoader.load();
  } catch (addError) {
    toast.push({ tone: 'danger', title: t('workspace.taskNotAdded'), message: errorMessage(addError, t('errors.generic')) });
  } finally {
    addingTask.value = false;
  }
}

// Recording. Other therapists may record at the same time, so capacity is refreshed when the popup opens.
const recordTask = ref<TaskItem | null>(null);
const recordingSaving = ref(false);
/** Sent with the submit so that a repeated submit is saved once; renewed for each recording. */
let recordRequestId = '';

function statusMap(statuses: TaskRecordingStatus[]): Map<string, TaskRecordingStatus> {
  return new Map(statuses.map((status) => [status.targetId, status]));
}

async function refreshRecording(): Promise<void> {
  if (!selectedId.value) return;
  const clientId = selectedId.value;
  const statuses = await recordingStatusesRequest(clientId);
  if (clientId === selectedId.value) recording.value = statusMap(statuses);
}

function openRecord(task: TaskItem): void {
  recordRequestId = crypto.randomUUID();
  recordTask.value = task;
  void refreshRecording().catch(() => undefined);
}

type RecordedValue = { response: RecordResponse } | { promptLevels: PromptLevel[] };

/** Saves one record and reports it; returns whether it was saved. */
async function submitRecord(task: TaskItem, value: RecordedValue, requestId: string): Promise<boolean> {
  try {
    const status = await recordTaskRequest(task.id, { requestId, ...value });
    recording.value = new Map(recording.value).set(task.id, status);
    const recorded = 'promptLevels' in value
      ? value.promptLevels.map((level) => t(`promptLevels.${level}`)).join(', ')
      : value.response === 'yes' ? t('workspace.yes') : t('workspace.no');
    toast.push({
      tone: 'success',
      title: t('workspace.recorded'),
      message: t('workspace.recordedMessage', { value: recorded, task: task.name, left: status.remainingToday }),
    });
    return true;
  } catch (recordError) {
    toast.push({ tone: 'danger', title: t('workspace.notRecorded'), message: errorMessage(recordError, t('errors.generic')) });
    await refreshRecording().catch(() => undefined);
    return false;
  }
}

async function saveRecord(value: RecordedValue): Promise<void> {
  const task = recordTask.value;
  if (!task) return;
  recordingSaving.value = true;
  if (await submitRecord(task, value, recordRequestId)) recordTask.value = null;
  recordingSaving.value = false;
}

// A task opened from its card shows over the workspace, so closing it stays here.
const openedTask = ref<TaskItem | null>(null);
const openedMode = ref<'preview' | 'edit'>('preview');
const savingTask = ref(false);

function openTask(task: TaskItem): void {
  openedMode.value = 'preview';
  openedTask.value = task;
}

function editOpenedTask(task: TaskItem): void {
  openedMode.value = 'edit';
  openedTask.value = task;
}

async function saveOpenedTask(input: CreateTaskInput): Promise<void> {
  const task = openedTask.value;
  if (!task) return;
  savingTask.value = true;
  try {
    const updated = await updateTaskRequest(task.id, input);
    toast.push({ tone: 'success', title: t('tasks.updated'), message: t('tasks.updatedMessage', { name: updated.name }) });
    openedTask.value = null;
    await workspaceLoader.load();
  } catch (saveError) {
    toast.push({ tone: 'danger', title: t('tasks.updateFailed'), message: errorMessage(saveError, t('tasks.checkInputs')) });
  } finally {
    savingTask.value = false;
  }
}

const graphTask = ref<TaskItem | null>(null);

onMounted(async () => {
  await clientLoader.load();
  await workspaceLoader.load();
});
</script>

<template>
  <div class="therapy">
    <aside class="clients" :aria-label="t('workspace.myClients')">
      <div class="clients-head">
        <h2 class="clients-title">{{ t('workspace.myClients') }}</h2>
        <span v-if="clients.length" class="clients-count">{{ clients.length }}</span>
      </div>
      <SkeletonBlock v-if="clientLoader.loading.value" height="240px" />
      <ErrorState v-else-if="clientLoader.error.value" :title="t('workspace.clientsUnavailable')" :description="clientLoader.error.value" @retry="clientLoader.load" />
      <p v-else-if="clients.length === 0" class="clients-empty">{{ t('workspace.noClients') }}</p>
      <template v-else>
        <div class="client-search-wrap">
          <AppIcon name="search" :size="16" class="client-search-icon" />
          <label class="visually-hidden" for="client-search">{{ t('workspace.searchLabel') }}</label>
          <input
            id="client-search"
            v-model="clientSearch"
            type="search"
            class="control client-search"
            :placeholder="t('workspace.searchPlaceholder')"
            autocomplete="off"
          />
        </div>
        <p v-if="filteredClients.length === 0" class="clients-empty">{{ t('workspace.noMatches') }}</p>
      </template>
      <ul v-if="filteredClients.length" class="client-list">
        <li v-for="client in filteredClients" :key="client.id">
          <button
            type="button"
            class="client-tile"
            :class="{ 'is-selected': client.id === selectedId }"
            :aria-pressed="client.id === selectedId"
            :aria-label="`${client.initials}, ${client.clientCode}`"
            @click="selectClient(client.id)"
          >
            <span class="client-initials" aria-hidden="true">{{ client.initials }}</span>
            <span class="client-code">{{ client.clientCode }}</span>
          </button>
        </li>
      </ul>
    </aside>

    <section class="workspace" :aria-label="t('workspace.title')">
      <header class="workspace-header">
        <div class="workspace-top">
          <div class="workspace-heading">
            <span v-if="selected" class="workspace-initials" aria-hidden="true">{{ selected.initials }}</span>
            <div>
              <h1 class="workspace-title">{{ t('workspace.title') }}</h1>
              <p v-if="selected" class="workspace-client">
                <RouterLink class="workspace-client-name" :to="`/clients/${selected.id}`" :title="t('workspace.openClient')">
                  {{ selected.displayName }}
                </RouterLink>
                <span class="workspace-client-code">{{ selected.clientCode }}</span>
              </p>
              <p v-else class="workspace-subtitle">{{ t('workspace.chooseClient') }}</p>
            </div>
          </div>
          <div class="views" role="group" :aria-label="t('workspace.view')">
            <button
              v-for="option in VIEW_OPTIONS"
              :key="option.value"
              type="button"
              class="view-button"
              :class="{ 'is-active': viewMode === option.value }"
              :aria-pressed="viewMode === option.value"
              :title="t(`workspace.views.${option.value}`)"
              @click="setQuery({ view: option.value })"
            >
              <AppIcon :name="option.icon" :size="16" />
              <span>{{ t(`workspace.views.${option.value}`) }}</span>
            </button>
          </div>
        </div>
        <div class="filters" role="group" :aria-label="t('workspace.filterByStatus')">
          <button
            v-for="option in FILTER_OPTIONS"
            :key="option"
            type="button"
            class="filter-chip"
            :class="[option === 'all' ? 'tone-all' : `care-tone-${option}`, { 'is-active': statusFilter === option }]"
            :aria-pressed="statusFilter === option"
            @click="setQuery({ status: option === 'all' ? undefined : option })"
          >
            <AppIcon :name="`status-${option}`" :size="16" />
            {{ filterLabel(option) }}
            <span class="filter-count">{{ filterCount(option) }}</span>
          </button>
        </div>
      </header>

      <SkeletonBlock v-if="workspaceLoader.loading.value && !workspaceLoaded" height="320px" />
      <ErrorState v-else-if="workspaceLoader.error.value" :title="t('workspace.unavailable')" :description="workspaceLoader.error.value" @retry="workspaceLoader.load" />
      <EmptyState v-else-if="!selected" icon="workspace" :title="t('workspace.noClientSelected')" :description="t('workspace.noClientSelectedHint')" />
      <EmptyState v-else-if="programs.length === 0" icon="programs" :title="t('workspace.noPrograms')" :description="t('workspace.noProgramsHint')" />
      <EmptyState
        v-else-if="visiblePrograms.length === 0"
        :icon="`status-${statusFilter}`"
        :title="t('workspace.nothingWithStatus', { status: filterLabel(statusFilter) })"
        :description="t('workspace.nothingWithStatusHint')"
      />

      <div
        v-else
        class="groups"
        :class="[`is-${viewMode}`, { 'is-refreshing': workspaceLoader.loading.value }]"
        :aria-busy="workspaceLoader.loading.value"
      >
        <ProgramCard
          v-for="program in visiblePrograms"
          :key="program.id"
          :program="program"
          :tasks="tasksFor(program.id)"
          :layout="viewMode"
          :expanded="expanded.has(program.id)"
          :program-actions="programActions(program)"
          :task-actions="taskActions"
          :recording="(task) => recording.get(task.id)"
          @program-action="onProgramAction(program, $event)"
          @task-action="onTaskAction"
          @record="openRecord"
          @open-task="openTask"
          @expand="expand(program.id)"
        />
      </div>
    </section>

    <StatusChangeDialog
      :open="pending !== null"
      :title="pending?.title ?? ''"
      :description="pendingDescription"
      :confirm-label="pending?.status === MASTERED_STATUS ? t('workspace.actions.markMastered') : t('workspace.actions.moveOnHold')"
      :saving="saving"
      @confirm="confirmChange"
      @close="pending = null"
    />

    <CreateTaskModal
      :open="taskProgram !== null"
      mode="create"
      :submitting="addingTask"
      @close="taskProgram = null"
      @submit="addTask"
    />

    <RecordDialog
      :open="recordTask !== null"
      :task="recordTask"
      :status="recordTask ? recording.get(recordTask.id) : undefined"
      :saving="recordingSaving"
      @submit="saveRecord"
      @close="recordTask = null"
    />

    <CreateTaskModal
      :open="openedTask !== null"
      :mode="openedMode"
      :task="openedTask"
      :submitting="savingTask"
      :can-edit="auth.can('programs.edit')"
      @close="openedTask = null"
      @edit="editOpenedTask"
      @submit="saveOpenedTask"
    />

    <TaskGraphDialog :open="graphTask !== null" :task="graphTask" @close="graphTask = null" />
  </div>
</template>

<style scoped>
.therapy {
  /* Height of the client panel: the viewport below the top bar, breadcrumbs and page padding. */
  --panel-height: max(360px, calc(100dvh - var(--topbar-height) - 110px));
  display: grid;
  grid-template-columns: 188px minmax(0, 1fr);
  align-items: start;
  gap: var(--space-5);
  width: min(1440px, 100%);
  margin: 0 auto;
}

/* Client rail: a calm list; only the list scrolls, so the panel keeps its size however many clients there are. */
.clients {
  position: sticky;
  top: calc(var(--topbar-height) + var(--space-4) + env(safe-area-inset-top, 0px));
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  height: var(--panel-height);
  padding: var(--space-4) var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
}

.clients-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-1);
}

.clients-title {
  font-size: var(--text-sm);
  font-weight: 600;
}

.clients-count {
  min-width: 22px;
  padding: 0 7px;
  border-radius: var(--radius-full);
  background: var(--color-surface-sunken);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 20px;
  text-align: center;
}

.clients-empty {
  padding: 0 var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.client-search-wrap {
  position: relative;
}

.client-search-icon {
  position: absolute;
  top: 50%;
  inset-inline-start: 10px;
  translate: 0 -50%;
  color: var(--color-text-subtle);
  pointer-events: none;
}

.client-search {
  min-height: 36px;
  padding-inline-start: 32px;
  font-size: var(--text-sm);
}

.client-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
  overscroll-behavior: contain;
  scroll-behavior: smooth;
  scrollbar-gutter: stable;
}

.client-tile {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 6px var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  text-align: start;
  cursor: pointer;
  transition: background-color var(--transition), color var(--transition);
}

.client-tile:hover {
  background: var(--color-surface-sunken);
}

.client-tile.is-selected {
  background: var(--color-primary-soft);
  color: var(--color-primary-ink);
}

.client-tile:focus-visible {
  outline: none;
  box-shadow: var(--focus);
}

.client-initials {
  display: grid;
  place-items: center;
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--color-surface-sunken);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-weight: 700;
}

.client-tile.is-selected .client-initials {
  background: var(--color-primary);
  color: #ffffff;
}

.client-code {
  min-width: 0;
  font-size: var(--text-sm);
  font-weight: 600;
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}

/* Workspace */
.workspace {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
  /* Never shorter than the client panel, so the page keeps its height while clients change. */
  min-height: var(--panel-height);
}

.groups.is-refreshing {
  opacity: 0.55;
  pointer-events: none;
  transition: opacity 0.15s;
}

.workspace-header {
  position: sticky;
  top: calc(var(--topbar-height) + env(safe-area-inset-top, 0px));
  z-index: 5;
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  background: color-mix(in srgb, var(--color-surface) 94%, transparent);
  backdrop-filter: blur(8px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
}

.workspace-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3) var(--space-5);
}

.workspace-heading {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.workspace-initials {
  display: grid;
  place-items: center;
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--color-primary);
  color: #ffffff;
  font-weight: 700;
}

.workspace-title {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: 500;
}

.workspace-subtitle {
  color: var(--color-ink);
  font-size: var(--text-md);
  font-weight: 600;
}

.workspace-client {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
}

.workspace-client-name {
  color: var(--color-ink);
  font-size: var(--text-lg);
  font-weight: 650;
  text-decoration: none;
}

.workspace-client-name:hover,
.workspace-client-name:focus-visible {
  color: var(--color-primary-ink);
  text-decoration: underline;
}

.workspace-client-code {
  padding: 1px 8px;
  border-radius: var(--radius-full);
  background: var(--color-surface-sunken);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.views {
  display: inline-flex;
  padding: 3px;
  background: var(--color-surface-sunken);
  border-radius: var(--radius-md);
}

.view-button {
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

.view-button.is-active {
  background: var(--color-surface);
  color: var(--color-ink);
  font-weight: 600;
  box-shadow: var(--shadow-xs);
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: background-color var(--transition), border-color var(--transition), color var(--transition);
}

.filter-chip:hover {
  border-color: var(--color-border-strong);
  color: var(--color-ink);
}

.filter-chip :deep(.icon) {
  color: var(--status-accent);
}

.filter-chip.is-active {
  color: var(--color-ink);
  font-weight: 600;
  border-color: var(--status-accent);
  background: var(--status-soft);
}

.tone-all {
  --status-accent: var(--color-primary);
  --status-soft: var(--color-primary-soft);
}

.filter-count {
  min-width: 20px;
  padding: 0 6px;
  border-radius: var(--radius-full);
  background: var(--color-surface-sunken);
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 18px;
  text-align: center;
}

/* Programs, each grouped with its tasks */
.groups {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

@media (max-width: 720px) {
  .therapy {
    grid-template-columns: minmax(0, 1fr);
  }

  .clients {
    position: static;
    height: auto;
  }

  .workspace {
    min-height: 0;
  }

  .workspace-header {
    position: static;
    padding: var(--space-4);
  }

  .client-list {
    flex-direction: row;
    overflow-x: auto;
  }

  .client-tile {
    flex: none;
    width: auto;
  }

  .client-code {
    white-space: nowrap;
  }

  .view-button span {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
}
</style>
