<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TaskRecordHistory } from '@abapro/shared';
import { taskRecordsRequest } from '@/api/programs';
import type { TaskItem } from '@/api/tasks';
import { hasPrompts, hasYesNo, promptLevelsOption, promptLevelsSummary, taskRecordsOption, taskRecordsSummary } from '@/charts/task-records';
import AppDialog from '@/components/ui/AppDialog.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTable from '@/components/ui/AppTable.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import GraphContainer from '@/components/ui/GraphContainer.vue';
import { formatDate, formatShortDate, formatTime } from '@/lib/format';
import { useLoader } from '@/lib/loader';


const props = defineProps<{ open: boolean; task: TaskItem | null }>();
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const rangeOptions = computed(() => ['7', '30', '90', 'all'].map((value) => ({ value, label: t(`graph.ranges.${value}`) })));
const recordColumns = computed(() => [
  { key: 'date', label: t('graph.columns.date'), sortable: true },
  { key: 'time', label: t('graph.columns.time') },
  { key: 'session', label: t('graph.columns.session'), sortable: true, align: 'end' as const },
  { key: 'trial', label: t('graph.columns.trial'), sortable: true, align: 'end' as const },
  { key: 'response', label: t('graph.columns.response'), sortable: true },
  { key: 'therapist', label: t('graph.columns.therapist'), sortable: true },
]);

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
}, t('graph.error'), false);

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
      ? record.promptLevels.map((level) => t(`promptLevels.${level}`)).join(', ')
      : record.response === 'yes' ? t('graph.plusYes') : t('graph.minusNo'),
    therapist: record.therapistName,
  })),
);
const today = computed(() => {
  const status = history.value?.status;
  if (!status) return '';
  return t('graph.today', { date: formatShortDate(status.date), recorded: status.recordedToday, left: status.remainingToday, total: status.dailyLimit });
});
</script>

<template>
  <AppDialog :open="open" :title="t('graph.title', { task: task?.name ?? '' })" size="lg" @close="emit('close')">
    <div class="graph-toolbar">
      <p class="graph-context">{{ task?.programTitle }}<template v-if="today"> · {{ today }}</template></p>
      <AppSelect v-model="range" class="graph-range" :label="t('graph.range')" :options="rangeOptions" hide-label />
    </div>
    <ErrorState v-if="loader.error.value" :title="t('graph.unavailable')" :description="loader.error.value" @retry="loader.load" />
    <EmptyState v-else-if="history && history.records.length === 0" icon="status-all" :title="t('graph.noGraph')" :description="t('graph.noGraphHint')" />
    <template v-else>
      <GraphContainer
        v-if="showYesNo"
        :title="t('graph.yesNoTitle')"
        :description="t('graph.yesNoDescription')"
        :option="option"
        :summary="summary"
        :loading="loader.loading.value && !history"
      />
      <GraphContainer
        v-if="promptOption"
        class="prompt-graph"
        :title="t('graph.promptTitle')"
        :description="t('graph.promptDescription')"
        :option="promptOption"
        :summary="promptSummary"
      />
      <AppTable
        v-if="history && rows.length"
        class="record-table"
        :caption="t('graph.caption')"
        :columns="recordColumns"
        :rows="rows"
        row-key="id"
        :page-size="10"
        density="compact"
        :searchable="false"
      >
        <template #cell-date="{ value }">{{ formatDate(String(value)) }}</template>
      </AppTable>
      <p v-if="history && history.records.length >= 200" class="record-note">{{ t('graph.latest') }}</p>
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
