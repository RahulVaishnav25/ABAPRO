<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
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
import { formatDate, formatDateTime } from '@/lib/format';

const props = defineProps<{ open: boolean; programId: string | null; programTitle: string }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const col = (key: string) => t(`programs.history.columns.${key}`);
const entryColumns = computed(() => [
  { key: 'when', label: col('when') },
  { key: 'therapist', label: col('therapist') },
  { key: 'client', label: col('client') },
  { key: 'task', label: col('task') },
  { key: 'phase', label: col('phase') },
  { key: 'trial', label: col('trial'), align: 'end' as const },
  { key: 'recorded', label: col('recorded') },
  { key: 'saved', label: col('saved') },
]);
const totalColumns = computed(() => [
  { key: 'task', label: col('task'), sortable: true },
  { key: 'therapist', label: col('therapist'), sortable: true },
  { key: 'trials', label: col('trials'), sortable: true, align: 'end' as const },
]);

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
}, t('programs.history.error'), false);

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
    dateError.value = filters.from && filters.to && filters.from > filters.to ? t('programs.history.dateOrder') : '';
    if (!dateError.value) void loader.load();
  },
);

const taskOptions = computed(() => [{ value: '', label: t('programs.history.allTasks') }, ...(history.value?.tasks ?? []).map((task) => ({ value: task.id, label: task.title }))]);
const therapistOptions = computed(() => [
  { value: '', label: t('programs.history.allTherapists') },
  ...(history.value?.therapists ?? []).map((therapist) => ({ value: therapist.id, label: therapist.name })),
]);
const phaseLabel = (phase: RecordPhaseGroup) => t(`programs.history.phases.${phase}`);
const phaseOptions = computed(() => [
  { value: '', label: t('programs.history.allPhases') },
  ...RECORD_PHASE_OPTIONS.map((option) => ({ value: option.value, label: phaseLabel(option.value) })),
]);

function recorded(entry: SessionHistoryEntry): string {
  if (entry.promptLevels.length) return entry.promptLevels.map((level) => t(`promptLevels.${level}`)).join(', ');
  return entry.response === 'yes' ? t('graph.plusYes') : t('graph.minusNo');
}

const entryRows = computed(() =>
  (history.value?.entries ?? []).map((entry) => ({
    id: entry.id,
    when: formatDateTime(entry.recordedAt),
    therapist: entry.therapistName,
    client: entry.clientName,
    task: entry.taskTitle,
    phase: phaseLabel(entry.phase),
    trial: t('programs.history.trialOf', { n: entry.trialNumber, total: entry.trialsPerSession }),
    recorded: recorded(entry),
    // Only records saved under the earlier session-based limit have more than one session a day.
    saved: [
      entry.sessionsPerDay > 1
        ? t('programs.history.sessionOf', { n: entry.sessionNumber, total: entry.sessionsPerDay, date: formatDate(entry.recordDate) })
        : formatDate(entry.recordDate),
      t('programs.history.savedStatus', { task: t(`status.${entry.taskStatus}`), program: t(`status.${entry.programStatus}`) }),
    ].join(' · '),
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
  <AppDialog :open="open" :title="t('programs.history.title', { program: programTitle })" size="lg" @close="emit('close')">
    <p class="history-intro">
      {{ t('programs.history.intro') }}
    </p>

    <div class="history-filters" role="group" :aria-label="t('programs.history.filters')">
      <AppSelect v-model="filters.taskId" :label="t('programs.history.task')" :options="taskOptions" />
      <AppSelect v-model="filters.therapistId" :label="t('programs.history.therapist')" :options="therapistOptions" />
      <AppSelect v-model="filters.phase" :label="t('programs.history.phase')" :options="phaseOptions" />
      <AppInput v-model="filters.from" :label="t('programs.history.from')" type="date" />
      <AppInput v-model="filters.to" :label="t('programs.history.to')" type="date" :error="dateError" />
    </div>

    <ErrorState v-if="loader.error.value" :title="t('programs.history.unavailable')" :description="loader.error.value" @retry="loader.load" />
    <SkeletonBlock v-else-if="!history" height="240px" />
    <EmptyState
      v-else-if="history.total === 0"
      :title="filtered ? t('programs.history.noMatches') : t('programs.history.noRecords')"
      :description="filtered ? t('programs.history.noMatchesHint') : t('programs.history.noRecordsHint')"
    />
    <div v-else class="history-body" :class="{ 'is-refreshing': loader.loading.value }" :aria-busy="loader.loading.value">
      <section aria-labelledby="history-totals-title">
        <h3 id="history-totals-title" class="history-heading">{{ t('programs.history.totals') }}</h3>
        <AppTable
          :caption="t('programs.history.totalsCaption')"
          :columns="totalColumns"
          :rows="totalRows"
          row-key="id"
          :page-size="6"
          density="compact"
          :searchable="false"
        />
      </section>

      <section aria-labelledby="history-log-title">
        <h3 id="history-log-title" class="history-heading">
          {{ t('programs.history.log') }} <span class="history-count">{{ t('programs.history.count', history.total) }}</span>
        </h3>
        <AppTable
          :caption="t('programs.history.logCaption')"
          :columns="entryColumns"
          :rows="entryRows"
          row-key="id"
          :page-size="10"
          density="compact"
          :searchable="false"
        >
          <template #cell-saved="{ row }">
            <span class="saved-data">{{ row.saved }}</span>
            <StatusBadge v-if="row.onHold" tone="warning" :label="t('programs.history.onHold')" />
          </template>
        </AppTable>
        <p v-if="history.total > history.entries.length" class="history-note">
          {{ t('programs.history.latest', { shown: history.entries.length, total: history.total }) }}
        </p>
      </section>
    </div>
  </AppDialog>
</template>

<style scoped>
.history-intro {
  margin: 0 0 var(--space-4);
  color: var(--color-text-muted);
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
