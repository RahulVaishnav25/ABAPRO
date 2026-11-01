<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { promptLevelLabel, type TaskRecordHistory } from '@abapro/shared';
import { taskRecordsRequest } from '@/api/programs';
import type { TaskItem } from '@/api/tasks';
import { hasPrompts, hasYesNo, promptLevelsOption, promptLevelsSummary, taskRecordsOption, taskRecordsSummary } from '@/charts/task-records';
import AppDialog from '@/components/ui/AppDialog.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTable from '@/components/ui/AppTable.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import GraphContainer from '@/components/ui/GraphContainer.vue';
import { formatShortDate, formatTime } from '@/lib/format';
import { useLoader } from '@/lib/loader';

const RANGE_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'all', label: 'All history' },
];
const RECORD_COLUMNS = [
  { key: 'date', label: 'Date', sortable: true },
  { key: 'time', label: 'Time' },
  { key: 'session', label: 'Session', sortable: true, align: 'end' as const },
  { key: 'trial', label: 'Trial', sortable: true, align: 'end' as const },
  { key: 'response', label: 'Response', sortable: true },
  { key: 'therapist', label: 'Therapist', sortable: true },
];

const props = defineProps<{ open: boolean; task: TaskItem | null }>();
const emit = defineEmits<{ close: [] }>();

const range = ref('30');
const history = ref<TaskRecordHistory | null>(null);

function rangeStart(): string | undefined {
  if (range.value === 'all') return undefined;
  const start = new Date();
  start.setDate(start.getDate() - Number(range.value) + 1);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
}

const loader = useLoader(async () => {
  if (!props.task) return;
  history.value = await taskRecordsRequest(props.task.id, rangeStart());
}, 'This task’s records could not be loaded.', false);

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    history.value = null;
    void loader.load();
  },
);
watch(range, () => void loader.load());

const days = computed(() => history.value?.days ?? []);
const option = computed(() => taskRecordsOption(days.value));
const summary = computed(() => taskRecordsSummary(days.value));
const promptOption = computed(() => promptLevelsOption(days.value));
const promptSummary = computed(() => promptLevelsSummary(days.value));
// A task recorded only with prompt levels skips the empty Yes/No graph, and the reverse.
const showYesNo = computed(() => hasYesNo(days.value) || !hasPrompts(days.value));
const rows = computed(() =>
  (history.value?.records ?? []).map((record) => ({
    id: record.id,
    date: record.recordDate,
    time: formatTime(record.recordedAt),
    session: record.sessionNumber,
    trial: record.trialNumber,
    response: record.promptLevels.length
      ? record.promptLevels.map(promptLevelLabel).join(', ')
      : record.response === 'yes' ? '+ Yes' : '− No',
    therapist: record.therapistName,
  })),
);
const today = computed(() => {
  const status = history.value?.status;
  if (!status) return '';
  return `Today (${formatShortDate(status.date)}): ${status.recordedToday} recorded, ${status.remainingToday} of ${status.dailyLimit} left.`;
});
</script>

<template>
  <AppDialog :open="open" :title="`Graph · ${task?.name ?? ''}`" size="lg" @close="emit('close')">
    <div class="graph-toolbar">
      <p class="graph-context">{{ task?.programTitle }}<template v-if="today"> · {{ today }}</template></p>
      <AppSelect v-model="range" class="graph-range" label="Range" :options="RANGE_OPTIONS" hide-label />
    </div>
    <ErrorState v-if="loader.error.value" title="Records unavailable" :description="loader.error.value" @retry="loader.load" />
    <template v-else>
      <GraphContainer
        v-if="showYesNo"
        title="Yes and No by day"
        description="Records saved by every therapist on this client’s care team."
        :option="option"
        :summary="summary"
        :loading="loader.loading.value && !history"
      />
      <GraphContainer
        v-if="promptOption"
        class="prompt-graph"
        title="Prompt levels by day"
        description="How many records selected each level. One record can select several."
        :option="promptOption"
        :summary="promptSummary"
      />
      <AppTable
        v-if="history && rows.length"
        class="record-table"
        caption="Recorded responses, newest first"
        :columns="RECORD_COLUMNS"
        :rows="rows"
        row-key="id"
        :page-size="10"
        density="compact"
        :searchable="false"
      />
      <p v-if="history && history.records.length >= 200" class="record-note">Showing the latest 200 records in this range.</p>
    </template>
  </AppDialog>
</template>

<style scoped>
.graph-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  margin-bottom: 12px;
}

.graph-context {
  margin: 0;
  color: var(--color-text-muted);
}

.graph-range {
  min-width: 170px;
}

.prompt-graph,
.record-table {
  margin-top: 16px;
}

.record-note {
  margin: 8px 0 0;
  font-size: 0.85rem;
}
</style>
