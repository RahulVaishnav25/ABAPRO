<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  careStatusLabel,
  promptLevelLabel,
  RECORD_PHASE_OPTIONS,
  type RecordPhaseGroup,
  type SessionHistory,
  type SessionHistoryEntry,
} from '@abapro/shared';
import { sessionHistoryRequest } from '@/api/programs';
import AppDialog from '@/components/ui/AppDialog.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTable from '@/components/ui/AppTable.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useLoader } from '@/lib/loader';

const ENTRY_COLUMNS = [
  { key: 'when', label: 'Date and time' },
  { key: 'therapist', label: 'Therapist' },
  { key: 'client', label: 'Client' },
  { key: 'task', label: 'Task' },
  { key: 'phase', label: 'Phase' },
  { key: 'trial', label: 'Trial', align: 'end' as const },
  { key: 'recorded', label: 'Response' },
  { key: 'saved', label: 'Saved data' },
];
const TOTAL_COLUMNS = [
  { key: 'task', label: 'Task', sortable: true },
  { key: 'therapist', label: 'Therapist', sortable: true },
  { key: 'trials', label: 'Trials recorded', sortable: true, align: 'end' as const },
];

const props = defineProps<{ open: boolean; programId: string | null; programTitle: string }>();
const emit = defineEmits<{ close: [] }>();

const filters = reactive({ taskId: '', therapistId: '', phase: '', from: '', to: '' });
const history = ref<SessionHistory | null>(null);
const dateError = ref('');

const loader = useLoader(async () => {
  if (!props.programId) return;
  history.value = await sessionHistoryRequest(props.programId, {
    taskId: filters.taskId || undefined,
    therapistId: filters.therapistId || undefined,
    phase: (filters.phase || undefined) as RecordPhaseGroup | undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
  });
}, 'Session history could not be loaded.', false);

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    history.value = null;
    // Clearing filters set last time reloads through the filter watcher; otherwise load here.
    if (Object.values(filters).some(Boolean)) Object.assign(filters, { taskId: '', therapistId: '', phase: '', from: '', to: '' });
    else void loader.load();
  },
);

watch(
  () => ({ ...filters }),
  () => {
    if (!props.open) return;
    dateError.value = filters.from && filters.to && filters.from > filters.to ? 'The start date is after the end date.' : '';
    if (!dateError.value) void loader.load();
  },
);

const taskOptions = computed(() => [{ value: '', label: 'All tasks' }, ...(history.value?.tasks ?? []).map((task) => ({ value: task.id, label: task.title }))]);
const therapistOptions = computed(() => [
  { value: '', label: 'All therapists' },
  ...(history.value?.therapists ?? []).map((therapist) => ({ value: therapist.id, label: therapist.name })),
]);
const phaseOptions = [{ value: '', label: 'All phases' }, ...RECORD_PHASE_OPTIONS];
const phaseLabel = (phase: RecordPhaseGroup) => RECORD_PHASE_OPTIONS.find((option) => option.value === phase)?.label ?? phase;

function recorded(entry: SessionHistoryEntry): string {
  if (entry.promptLevels.length) return entry.promptLevels.map(promptLevelLabel).join(', ');
  return entry.response === 'yes' ? '+ Yes' : '− No';
}

const entryRows = computed(() =>
  (history.value?.entries ?? []).map((entry) => ({
    id: entry.id,
    when: new Date(entry.recordedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
    therapist: entry.therapistName,
    client: entry.clientName,
    task: entry.taskTitle,
    phase: phaseLabel(entry.phase),
    trial: `${entry.trialNumber} of ${entry.trialsPerSession}`,
    recorded: recorded(entry),
    // Only records saved under the earlier session-based limit have more than one session a day.
    saved: `${entry.sessionsPerDay > 1 ? `Session ${entry.sessionNumber} of ${entry.sessionsPerDay} on ` : ''}${entry.recordDate} · Task ${careStatusLabel(entry.taskStatus)} · Program ${careStatusLabel(entry.programStatus)}`,
    onHold: entry.taskStatus === 'on_hold' || entry.programStatus === 'on_hold',
  })),
);
const totalRows = computed(() =>
  (history.value?.totals ?? []).map((total) => ({
    id: `${total.taskId}-${total.therapistId}`,
    task: total.taskTitle,
    therapist: total.therapistName,
    trials: total.trials,
  })),
);
const filtered = computed(() => Object.values(filters).some(Boolean));
</script>

<template>
  <AppDialog :open="open" :title="`Session History · ${programTitle}`" wide @close="emit('close')">
    <p class="history-intro">
      Every response saved on this program’s tasks, newest first. Records are kept as saved and cannot be changed or removed.
    </p>

    <div class="history-filters" role="group" aria-label="Filter session history">
      <AppSelect v-model="filters.taskId" label="Task" :options="taskOptions" />
      <AppSelect v-model="filters.therapistId" label="Therapist" :options="therapistOptions" />
      <AppSelect v-model="filters.phase" label="Phase" :options="phaseOptions" />
      <AppInput v-model="filters.from" label="From" type="date" />
      <AppInput v-model="filters.to" label="To" type="date" :error="dateError" />
    </div>

    <ErrorState v-if="loader.error.value" title="Session history unavailable" :description="loader.error.value" @retry="loader.load" />
    <SkeletonBlock v-else-if="!history" height="240px" />
    <EmptyState
      v-else-if="history.total === 0"
      :title="filtered ? 'No matching records' : 'No records yet'"
      :description="filtered ? 'Change the filters to see more records.' : 'Records saved on this program’s tasks appear here.'"
    />
    <div v-else class="history-body" :class="{ 'is-refreshing': loader.loading.value }" :aria-busy="loader.loading.value">
      <section aria-labelledby="history-totals-title">
        <h3 id="history-totals-title" class="history-heading">Trials by therapist</h3>
        <AppTable
          caption="Trials each therapist recorded on each task"
          :columns="TOTAL_COLUMNS"
          :rows="totalRows"
          row-key="id"
          :page-size="6"
          density="compact"
          :searchable="false"
        />
      </section>

      <section aria-labelledby="history-log-title">
        <h3 id="history-log-title" class="history-heading">
          Activity log <span class="history-count">{{ history.total }} record{{ history.total === 1 ? '' : 's' }}</span>
        </h3>
        <AppTable
          caption="Recording activity, newest first"
          :columns="ENTRY_COLUMNS"
          :rows="entryRows"
          row-key="id"
          :page-size="10"
          density="compact"
          :searchable="false"
        >
          <template #cell-saved="{ row }">
            <span class="saved-data">{{ row.saved }}</span>
            <StatusBadge v-if="row.onHold" tone="warning" label="Recorded while On Hold" />
          </template>
        </AppTable>
        <p v-if="history.total > history.entries.length" class="history-note">
          Showing the latest {{ history.entries.length }} of {{ history.total }} records. Narrow the filters to see older ones.
        </p>
      </section>
    </div>
  </AppDialog>
</template>

<style scoped>
.history-intro {
  margin: 0 0 12px;
}

.history-filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.history-body {
  display: grid;
  gap: 20px;
  transition: opacity 0.15s;
}

.history-body.is-refreshing {
  opacity: 0.55;
}

.history-heading {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 0 8px;
  font-size: 1rem;
  color: var(--color-ink);
}

.history-count {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text-muted);
}

.saved-data {
  display: block;
  font-size: 0.85rem;
}

.history-note {
  margin: 8px 0 0;
  font-size: 0.85rem;
}
</style>
