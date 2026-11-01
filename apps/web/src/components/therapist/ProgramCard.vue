<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { RECORDABLE_STATUSES, type ProgramSummary, type RecordResponse, type TaskRecordingStatus } from '@abapro/shared';
import type { TaskItem } from '@/api/tasks';
import AppIcon from '@/components/navigation/AppIcon.vue';
import ActionMenu, { type ActionMenuItem } from '@/components/ui/ActionMenu.vue';
import AppButton from '@/components/ui/AppButton.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { careStatusTone } from '@/lib/format';

const TASKS_SHOWN = 3;

const props = defineProps<{
  program: ProgramSummary;
  /** The tasks to show, already filtered by status. */
  tasks: TaskItem[];
  /** Horizontal places the tasks in a row beside the program; vertical lists them underneath. */
  layout: 'horizontal' | 'vertical';
  expanded: boolean;
  programActions: ActionMenuItem[];
  taskActions: (task: TaskItem) => ActionMenuItem[];
  /** Today's shared recording capacity for a task, once loaded. */
  recording: (task: TaskItem) => TaskRecordingStatus | undefined;
  /** Tasks with a record being saved. */
  saving?: ReadonlySet<string>;
}>();
const emit = defineEmits<{
  programAction: [key: string];
  taskAction: [task: TaskItem, key: string];
  /** Opens the record dialog, for tasks recorded with prompt levels. */
  record: [task: TaskItem];
  /** Saves a Yes or No straight from the card. */
  quickRecord: [task: TaskItem, response: RecordResponse];
  expand: [];
}>();

const { t } = useI18n();
const shown = computed(() => (props.expanded ? props.tasks : props.tasks.slice(0, TASKS_SHOWN)));

function canRecord(task: TaskItem): boolean {
  return Boolean(props.recording(task)?.mayRecord) && RECORDABLE_STATUSES.includes(task.status);
}

function progress(status: TaskRecordingStatus): number {
  return status.dailyLimit === 0 ? 0 : Math.round((status.recordedToday / status.dailyLimit) * 100);
}
</script>

<template>
  <article :id="`program-${program.id}`" class="program-group" :class="[`care-tone-${program.status}`, `is-${layout}`]">
    <header class="program-card">
      <div class="program-header">
        <span class="status-icon" :title="t(`status.${program.status}`)"><AppIcon :name="`status-${program.status}`" /></span>
        <div class="program-heading">
          <h3 class="program-title">
            <RouterLink class="card-link" :to="`/programs/${program.id}`">{{ program.title }}</RouterLink>
          </h3>
          <p class="program-meta">{{ program.domain || t('card.general') }} · {{ program.measurementProcedure || 'Probe' }}</p>
        </div>
        <ActionMenu :label="t('workspace.programActions', { name: program.title })" :items="programActions" @select="emit('programAction', $event)" />
      </div>
      <div class="program-status">
        <StatusBadge :tone="careStatusTone(program.status)" :label="t(`status.${program.status}`)" />
        <span class="task-count">{{ t('card.tasks', tasks.length) }}</span>
      </div>
    </header>

    <div class="task-area">
      <p v-if="tasks.length === 0" class="no-tasks">{{ t('card.noTasks') }}</p>
      <ul v-else class="task-list" :aria-label="program.title">
        <li v-for="task in shown" :key="task.id" class="task-card" :class="`care-tone-${task.status}`">
          <div class="task-top">
            <span class="status-icon task-icon" :title="t(`status.${task.status}`)"><AppIcon :name="`status-${task.status}`" :size="16" /></span>
            <strong class="task-name">
              <RouterLink class="card-link" :to="`/programs/tasks/${task.id}`">{{ task.name }}</RouterLink>
            </strong>
            <ActionMenu :label="t('workspace.taskActions', { name: task.name })" :items="taskActions(task)" @select="emit('taskAction', task, $event)" />
          </div>
          <div class="task-meta">
            <span>{{ t(`phases.${task.phase}`) }} · {{ t('card.trials', task.desiredTrials) }}</span>
            <StatusBadge :tone="careStatusTone(task.status)" :label="t(`status.${task.status}`)" />
          </div>

          <template v-if="recording(task)">
            <!-- Today's allowance, shared by everyone on the client's care team. -->
            <div class="task-progress">
              <div
                class="progress-track"
                role="progressbar"
                :aria-label="t('card.progress')"
                aria-valuemin="0"
                :aria-valuemax="recording(task)!.dailyLimit"
                :aria-valuenow="recording(task)!.recordedToday"
              >
                <span class="progress-fill" :style="{ inlineSize: `${progress(recording(task)!)}%` }"></span>
              </div>
              <span class="task-capacity">
                {{
                  recording(task)!.remainingToday === 0
                    ? t('card.doneToday')
                    : t('card.leftToday', { left: recording(task)!.remainingToday, total: recording(task)!.dailyLimit })
                }}
              </span>
            </div>

            <div v-if="canRecord(task)" class="task-actions">
              <AppButton
                v-if="recording(task)!.promptUsed"
                size="sm"
                icon="plus"
                :disabled="recording(task)!.remainingToday === 0"
                :aria-label="t('card.recordTask', { name: task.name })"
                @click="emit('record', task)"
              >
                {{ t('card.record') }}
              </AppButton>
              <template v-else>
                <button
                  type="button"
                  class="quick quick-yes"
                  :disabled="recording(task)!.remainingToday === 0 || saving?.has(task.id)"
                  :aria-label="t('card.recordYes', { name: task.name })"
                  @click="emit('quickRecord', task, 'yes')"
                >
                  <AppIcon name="plus" :size="16" /> {{ t('graph.yes') }}
                </button>
                <button
                  type="button"
                  class="quick quick-no"
                  :disabled="recording(task)!.remainingToday === 0 || saving?.has(task.id)"
                  :aria-label="t('card.recordNo', { name: task.name })"
                  @click="emit('quickRecord', task, 'no')"
                >
                  <AppIcon name="minus" :size="16" /> {{ t('graph.no') }}
                </button>
              </template>
            </div>
          </template>
        </li>
      </ul>
      <button v-if="tasks.length > shown.length" type="button" class="more-tasks" @click="emit('expand')">
        {{ t('card.showAll', { n: tasks.length }) }}
      </button>
    </div>
  </article>
</template>

<style scoped>
/* A program and its tasks read as one group, marked by the program's status colour. */
.program-group {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-inline-start: 3px solid var(--status-accent);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
}

.program-group.is-horizontal {
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  align-items: start;
  gap: var(--space-4);
}

.program-card {
  display: grid;
  gap: var(--space-3);
}

.program-header {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

.program-heading {
  flex: 1;
  min-width: 0;
}

.status-icon {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: var(--status-soft);
  color: var(--status-accent);
}

.task-icon {
  width: 26px;
  height: 26px;
}

/* Program and task names open their pages. */
.card-link {
  color: inherit;
  text-decoration: none;
}

.card-link:hover,
.card-link:focus-visible {
  color: var(--color-primary-ink);
  text-decoration: underline;
}

.program-title {
  font-size: var(--text-md);
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.program-meta,
.task-count {
  margin-top: 2px;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.program-status {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.program-status .task-count {
  margin: 0;
}

.task-area {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}

.task-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Stacked: one task per row, indented under the program with a guide line. */
.is-vertical .task-list {
  grid-template-columns: minmax(0, 1fr);
  padding-inline-start: var(--space-4);
  border-inline-start: 2px solid var(--color-border);
  margin-inline-start: 15px;
}

.task-card {
  display: grid;
  gap: var(--space-2);
  align-content: start;
  padding: var(--space-3);
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition: border-color var(--transition), box-shadow var(--transition);
}

.task-card:hover {
  border-color: var(--color-border-strong);
  box-shadow: var(--shadow-xs);
}

.task-top {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}

.task-name {
  flex: 1;
  min-width: 0;
  padding-top: 3px;
  color: var(--color-ink);
  font-size: var(--text-base);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.task-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.task-progress {
  display: grid;
  gap: 4px;
}

.progress-track {
  height: 6px;
  overflow: hidden;
  border-radius: var(--radius-full);
  background: var(--color-surface-sunken);
}

.progress-fill {
  display: block;
  block-size: 100%;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  transition: inline-size 0.3s ease;
}

.task-capacity {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-weight: 500;
}

.task-actions {
  display: flex;
  gap: var(--space-2);
}

/* One tap records a Yes or a No. Large targets, labelled with the task name for screen readers. */
.quick {
  display: inline-flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 36px;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-ink);
  font-size: var(--text-sm);
  font-weight: 600;
  transition: background-color var(--transition), border-color var(--transition), color var(--transition);
}

.quick:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.quick-yes:hover:not(:disabled) {
  border-color: var(--color-success);
  background: var(--color-success-soft);
  color: var(--color-success);
}

.quick-no:hover:not(:disabled) {
  border-color: var(--color-danger);
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.quick:focus-visible {
  outline: none;
  box-shadow: var(--focus);
}

.no-tasks {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.more-tasks {
  justify-self: start;
  padding: 4px 0;
  border: 0;
  background: none;
  color: var(--color-primary-ink);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
}

.more-tasks:hover {
  text-decoration: underline;
}

@media (max-width: 900px) {
  .program-group.is-horizontal {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
