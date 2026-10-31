<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { careStatusLabel, CARE_STATUSES, type CareStatus, type ClientDirectoryItem, type ProgramSummary } from '@abapro/shared';
import { clientDirectoryRequest } from '@/api/clients';
import { programsRequest, setProgramStatusRequest, setTaskStatusRequest, targetsRequest } from '@/api/programs';
import { createTaskRequest, toTask, type CreateTaskInput, type TaskItem } from '@/api/tasks';
import AppIcon from '@/components/navigation/AppIcon.vue';
import CreateTaskModal from '@/components/programs/CreateTaskModal.vue';
import type { ActionMenuItem } from '@/components/therapist/ActionMenu.vue';
import ProgramCard from '@/components/therapist/ProgramCard.vue';
import StatusChangeDialog from '@/components/therapist/StatusChangeDialog.vue';
import AppDialog from '@/components/ui/AppDialog.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import { errorMessage, useLoader } from '@/lib/loader';
import { useToastStore } from '@/stores/toast';

type StatusFilter = 'all' | CareStatus;
type ViewMode = 'horizontal' | 'vertical';

const MASTERED_STATUS: CareStatus = 'mastered';
const COLUMN_ORDER: CareStatus[] = ['in_treatment', 'maintenance', 'on_hold', 'mastered'];
const FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  ...COLUMN_ORDER.map((status) => ({ value: status, label: careStatusLabel(status) })),
];
const VIEW_OPTIONS: Array<{ value: ViewMode; label: string; icon: string }> = [
  { value: 'horizontal', label: 'Horizontal View', icon: 'layout-horizontal' },
  { value: 'vertical', label: 'Vertical View', icon: 'layout-vertical' },
];

const route = useRoute();
const router = useRouter();
const toast = useToastStore();

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
}, 'Your clients could not be loaded.');

// After the first load, switching clients keeps the current content in place until the next client loads.
const workspaceLoaded = ref(false);

const workspaceLoader = useLoader(async () => {
  if (!selectedId.value) {
    programs.value = [];
    tasks.value = [];
    return;
  }
  const [clientPrograms, allTasks] = await Promise.all([programsRequest(selectedId.value), targetsRequest()]);
  programs.value = clientPrograms;
  tasks.value = allTasks.filter((task) => task.clientId === selectedId.value).map(toTask);
  workspaceLoaded.value = true;
}, 'This client’s programs could not be loaded.', false);

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
  if (program.status !== 'on_hold') items.push({ key: 'hold', label: 'Move to On Hold' });
  if (program.status !== MASTERED_STATUS) items.push({ key: 'mastered', label: 'Mark as Mastered' });
  items.push({ key: 'tasks', label: 'View associated tasks' }, { key: 'add-task', label: 'Add Task' });
  return items;
}

function taskActions(task: TaskItem): ActionMenuItem[] {
  const items: ActionMenuItem[] = [];
  if (task.status !== 'on_hold') items.push({ key: 'hold', label: 'Move to On Hold' });
  if (task.status !== MASTERED_STATUS) items.push({ key: 'mastered', label: 'Mark as Mastered' });
  items.push({ key: 'graph', label: 'View Task Graph' });
  return items;
}

function onProgramAction(program: ProgramSummary, key: string): void {
  if (key === 'hold' || key === 'mastered') {
    pending.value = {
      kind: 'program',
      programId: program.id,
      name: program.title,
      status: key === 'hold' ? 'on_hold' : MASTERED_STATUS,
      title: key === 'hold' ? 'Move program to On Hold' : 'Mark program as mastered',
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
      title: key === 'hold' ? 'Move task to On Hold' : 'Mark task as mastered',
    };
  } else if (key === 'graph') {
    graphTask.value = task;
  }
}

const pendingDescription = computed(() =>
  pending.value ? `“${pending.value.name}” moves to ${careStatusLabel(pending.value.status)}. The reason is saved with its history.` : '',
);

async function confirmChange(reason: string): Promise<void> {
  const change = pending.value;
  if (!change) return;
  saving.value = true;
  try {
    const body = { status: change.status, changeReason: reason };
    if (change.kind === 'program') await setProgramStatusRequest(change.programId, body);
    else await setTaskStatusRequest(change.programId, change.taskId ?? '', body);
    toast.push({ tone: 'success', title: 'Status updated', message: `${change.name} is now ${careStatusLabel(change.status)}.` });
    pending.value = null;
    await workspaceLoader.load();
  } catch (changeError) {
    toast.push({ tone: 'danger', title: 'Status was not changed', message: errorMessage(changeError, 'Try again.') });
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
    toast.push({ tone: 'success', title: 'Task added', message: `${created.name} was added to ${program.title}.` });
    taskProgram.value = null;
    expand(program.id);
    await workspaceLoader.load();
  } catch (addError) {
    toast.push({ tone: 'danger', title: 'Task was not added', message: errorMessage(addError, 'Try again.') });
  } finally {
    addingTask.value = false;
  }
}

// Task graph placeholder until graphs are built.
const graphTask = ref<TaskItem | null>(null);

onMounted(async () => {
  await clientLoader.load();
  await workspaceLoader.load();
});
</script>

<template>
  <div class="therapy">
    <aside class="clients" aria-label="Your clients">
      <h2 class="clients-title">My clients</h2>
      <SkeletonBlock v-if="clientLoader.loading.value" height="240px" />
      <ErrorState v-else-if="clientLoader.error.value" title="Clients unavailable" :description="clientLoader.error.value" @retry="clientLoader.load" />
      <p v-else-if="clients.length === 0" class="clients-empty">No clients are assigned to you yet.</p>
      <template v-else>
        <label class="visually-hidden" for="client-search">Search clients by name or code</label>
        <input
          id="client-search"
          v-model="clientSearch"
          type="search"
          class="client-search"
          placeholder="Name or code"
          autocomplete="off"
        />
        <p v-if="filteredClients.length === 0" class="clients-empty">No matching clients.</p>
      </template>
      <ul v-if="filteredClients.length" class="client-list">
        <li v-for="client in filteredClients" :key="client.id">
          <button
            type="button"
            class="client-tile"
            :class="{ 'is-selected': client.id === selectedId }"
            :aria-pressed="client.id === selectedId"
            :aria-label="`Client ${client.initials}, ${client.clientCode}`"
            @click="selectClient(client.id)"
          >
            <span class="client-initials" aria-hidden="true">{{ client.initials }}</span>
            <span class="client-code">{{ client.clientCode }}</span>
          </button>
        </li>
      </ul>
    </aside>

    <section class="workspace" aria-label="Therapy workspace">
      <header class="workspace-header">
        <div class="workspace-top">
          <div class="workspace-heading">
            <span v-if="selected" class="workspace-initials" aria-hidden="true">{{ selected.initials }}</span>
            <div>
              <h1 class="workspace-title">Therapy Workspace</h1>
              <p v-if="selected" class="workspace-client">
                <RouterLink class="workspace-client-name" :to="`/clients/${selected.id}`" title="Open client details">
                  {{ selected.displayName }}
                </RouterLink>
                <span class="workspace-client-code">{{ selected.clientCode }}</span>
              </p>
              <p v-else class="workspace-subtitle">Choose a client to see their programs.</p>
            </div>
          </div>
          <div class="views" role="group" aria-label="View">
            <button
              v-for="option in VIEW_OPTIONS"
              :key="option.value"
              type="button"
              class="view-button"
              :class="{ 'is-active': viewMode === option.value }"
              :aria-pressed="viewMode === option.value"
              :title="option.label"
              @click="setQuery({ view: option.value })"
            >
              <AppIcon :name="option.icon" />
              <span>{{ option.label }}</span>
            </button>
          </div>
        </div>
        <div class="filters" role="group" aria-label="Filter by status">
          <button
            v-for="option in FILTER_OPTIONS"
            :key="option.value"
            type="button"
            class="filter-chip"
            :class="[option.value === 'all' ? 'tone-all' : `care-tone-${option.value}`, { 'is-active': statusFilter === option.value }]"
            :aria-pressed="statusFilter === option.value"
            @click="setQuery({ status: option.value === 'all' ? undefined : option.value })"
          >
            <AppIcon :name="`status-${option.value}`" />
            {{ option.label }}
            <span class="filter-count">{{ filterCount(option.value) }}</span>
          </button>
        </div>
      </header>

      <SkeletonBlock v-if="workspaceLoader.loading.value && !workspaceLoaded" height="320px" />
      <ErrorState v-else-if="workspaceLoader.error.value" title="Workspace unavailable" :description="workspaceLoader.error.value" @retry="workspaceLoader.load" />
      <EmptyState v-else-if="!selected" title="No client selected" description="Choose a client on the left to open their therapy workspace." />
      <EmptyState v-else-if="programs.length === 0" title="No programs yet" description="Programs created for this client appear here." />
      <EmptyState
        v-else-if="visiblePrograms.length === 0"
        :title="`Nothing ${careStatusLabel(statusFilter)}`"
        description="No programs or tasks for this client have that status."
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
          @program-action="onProgramAction(program, $event)"
          @task-action="onTaskAction"
          @expand="expand(program.id)"
        />
      </div>
    </section>

    <StatusChangeDialog
      :open="pending !== null"
      :title="pending?.title ?? ''"
      :description="pendingDescription"
      :confirm-label="pending?.status === MASTERED_STATUS ? 'Mark as mastered' : 'Move to On Hold'"
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

    <AppDialog :open="graphTask !== null" :title="`Task graph · ${graphTask?.name ?? ''}`" @close="graphTask = null">
      <EmptyState title="Task graph coming soon" description="A graph of this task’s progress will appear here." />
    </AppDialog>
  </div>
</template>

<style scoped>
.therapy {
  /* Height of the client panel: the viewport below the top bar, breadcrumbs and page padding. */
  --panel-height: max(360px, calc(100dvh - var(--topbar-height, 64px) - 96px));
  display: grid;
  grid-template-columns: 136px minmax(0, 1fr);
  align-items: start;
  gap: 20px;
}

/* Client selector */
.clients {
  position: sticky;
  top: calc(var(--topbar-height, 64px) + 16px + env(safe-area-inset-top, 0px));
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: var(--panel-height);
  padding: 16px 12px;
  background: linear-gradient(180deg, #0e6b62 0%, #0a4f49 100%);
  border-radius: var(--radius-lg);
  color: #ffffff;
}

.clients-title {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.85;
}

.clients-empty {
  font-size: 0.85rem;
  opacity: 0.85;
}

.client-search {
  width: 100%;
  min-height: 36px;
  padding: 6px 10px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
  font: inherit;
  font-size: 0.85rem;
}

.client-search::placeholder {
  color: rgba(255, 255, 255, 0.75);
}

.client-search:focus {
  outline: 3px solid #ffd479;
  outline-offset: 1px;
  background: rgba(255, 255, 255, 0.2);
}

/* Only the list scrolls; the panel keeps its size however many clients there are. */
.client-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  margin: 0;
  padding: 2px 2px 4px;
  list-style: none;
  overflow-y: auto;
  overscroll-behavior: contain;
  scroll-behavior: smooth;
  scrollbar-gutter: stable;
}

.client-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 12px 6px;
  border: 2px solid transparent;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.1);
  color: inherit;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}

.client-tile:hover {
  background: rgba(255, 255, 255, 0.18);
}

.client-tile.is-selected {
  background: #ffffff;
  border-color: #ffffff;
  color: #0a4f49;
}

.client-tile:focus-visible {
  outline: 3px solid #ffd479;
  outline-offset: 2px;
}

.client-initials {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  font-size: 1.15rem;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.client-tile.is-selected .client-initials {
  background: #0e6b62;
  color: #ffffff;
}

.client-code {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  word-break: break-all;
}

/* Workspace */
.workspace {
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  top: calc(var(--topbar-height, 64px) + env(safe-area-inset-top, 0px));
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 20px;
  padding: 14px 16px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.workspace-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}

.workspace-initials {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--color-primary);
  color: #ffffff;
  font-weight: 800;
}

.workspace-title {
  margin: 0;
  font-size: 1.15rem;
  color: var(--color-ink);
}

.workspace-subtitle {
  margin: 2px 0 0;
  color: var(--color-text-muted);
  font-size: 0.88rem;
}

.workspace-client {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  margin: 2px 0 0;
}

.workspace-client-name {
  color: var(--color-ink);
  font-size: 1.05rem;
  font-weight: 700;
  text-decoration: none;
}

.workspace-client-name:hover,
.workspace-client-name:focus-visible {
  color: var(--color-primary);
  text-decoration: underline;
}

.workspace-client-code {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.workspace-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 20px;
  width: 100%;
}

.views {
  display: inline-flex;
  padding: 3px;
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  border-radius: 10px;
}

.view-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 6px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.view-button.is-active {
  background: var(--color-surface);
  color: var(--color-ink);
  box-shadow: var(--shadow-sm);
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 6px 12px;
  border: 1px solid var(--color-border-strong);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-weight: 600;
  cursor: pointer;
}

.filter-chip :deep(.icon) {
  color: var(--status-accent);
}

.filter-chip.is-active {
  color: var(--color-ink);
  border-color: var(--status-accent);
  background: var(--status-soft);
}

.tone-all {
  --status-accent: var(--color-primary);
  --status-soft: var(--color-primary-soft);
}

.filter-count {
  min-width: 22px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--color-surface-muted);
  font-size: 0.78rem;
  text-align: center;
}

/* Programs, each grouped with its tasks */
.groups {
  display: flex;
  flex-direction: column;
  gap: 14px;
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

  .client-list {
    flex-direction: row;
    overflow-x: auto;
  }

  .client-tile {
    width: 96px;
    flex: none;
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
