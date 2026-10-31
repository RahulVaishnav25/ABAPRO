<script setup lang="ts">
import { computed } from 'vue';
import { careStatusLabel, RECORDABLE_STATUSES, type ProgramSummary, type TaskRecordingStatus } from '@abapro/shared';
import type { TaskItem } from '@/api/tasks';
import AppIcon from '@/components/navigation/AppIcon.vue';
import ActionMenu, { type ActionMenuItem } from '@/components/therapist/ActionMenu.vue';
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
}>();
const emit = defineEmits<{ programAction: [key: string]; taskAction: [task: TaskItem, key: string]; record: [task: TaskItem]; expand: [] }>();

function capacity(status: TaskRecordingStatus | undefined): number {
  return status?.dailyLimit ?? 0;
}

const shown = computed(() => (props.expanded ? props.tasks : props.tasks.slice(0, TASKS_SHOWN)));
</script>

<template>
  <article :id="`program-${program.id}`" class="program-group" :class="[`care-tone-${program.status}`, `is-${layout}`]">
    <div class="program-card">
      <header class="program-header">
        <div class="program-heading">
          <span class="status-icon" :title="careStatusLabel(program.status)"><AppIcon :name="`status-${program.status}`" /></span>
          <div>
            <h3 class="program-title">{{ program.title }}</h3>
            <p class="program-meta">{{ program.domain || 'General' }} · {{ program.measurementProcedure || 'Probe' }}</p>
          </div>
        </div>
        <ActionMenu :label="`Actions for program ${program.title}`" :items="programActions" @select="emit('programAction', $event)" />
      </header>
      <div class="program-status">
        <StatusBadge :tone="careStatusTone(program.status)" :label="careStatusLabel(program.status)" />
        <span class="task-count">{{ tasks.length }} task{{ tasks.length === 1 ? '' : 's' }}</span>
      </div>
    </div>

    <div class="task-area">
      <span v-if="layout === 'horizontal'" class="connector" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 12h15" />
          <path d="M14 7l5 5-5 5" />
        </svg>
      </span>
      <p v-if="tasks.length === 0" class="no-tasks">No tasks</p>
      <ul v-else class="task-list" :aria-label="`Tasks in ${program.title}`">
        <li v-for="task in shown" :key="task.id" class="task-card" :class="`care-tone-${task.status}`">
          <span class="status-icon task-icon" :title="careStatusLabel(task.status)"><AppIcon :name="`status-${task.status}`" /></span>
          <div class="task-body">
            <strong class="task-name">{{ task.name }}</strong>
            <span class="task-meta">{{ task.phase }} · {{ task.desiredTrials }} trials</span>
            <StatusBadge :tone="careStatusTone(task.status)" :label="careStatusLabel(task.status)" />
            <div v-if="recording(task)" class="task-record">
              <span class="task-capacity">{{ recording(task)?.remainingToday }} of {{ capacity(recording(task)) }} left today</span>
              <AppButton
                v-if="recording(task)?.mayRecord && RECORDABLE_STATUSES.includes(task.status)"
                size="sm"
                :disabled="recording(task)?.remainingToday === 0"
                :aria-label="`Record ${task.name}`"
                @click="emit('record', task)"
              >
                Record
              </AppButton>
            </div>
          </div>
          <ActionMenu :label="`Actions for task ${task.name}`" :items="taskActions(task)" @select="emit('taskAction', task, $event)" />
        </li>
      </ul>
      <button v-if="tasks.length > shown.length" type="button" class="more-tasks" @click="emit('expand')">
        Show all {{ tasks.length }} tasks
      </button>
    </div>
  </article>
</template>

<style scoped>
/* A program and its tasks share one tinted container so they read as a group. */
.program-group {
  padding: 12px;
  background: var(--status-soft);
  border: 1px solid var(--color-border);
  border-left: 4px solid var(--status-accent);
  border-radius: var(--radius-lg);
}

.program-group.is-horizontal {
  display: grid;
  grid-template-columns: minmax(240px, 300px) minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.program-group.is-vertical {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.program-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.program-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.program-heading {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.status-icon {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--status-soft);
  color: var(--status-accent);
}

.task-icon {
  width: 26px;
  height: 26px;
}

.program-title {
  margin: 0;
  font-size: 1rem;
  color: var(--color-ink);
}

.program-meta,
.task-count {
  margin: 2px 0 0;
  color: var(--color-text-muted);
  font-size: 0.8rem;
}

.program-status {
  display: flex;
  align-items: center;
  gap: 10px;
}

.program-status .task-count {
  margin: 0;
}

.task-area {
  display: flex;
  min-width: 0;
}

.is-horizontal .task-area {
  align-items: flex-start;
  gap: 10px;
}

.is-vertical .task-area {
  flex-direction: column;
  gap: 6px;
  padding-left: 18px;
}

.connector {
  display: grid;
  place-items: center;
  flex: none;
  height: 40px;
  color: var(--status-accent);
}

.no-tasks {
  margin: 0;
  padding: 10px 12px;
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.task-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.is-horizontal .task-list {
  display: flex;
  gap: 10px;
  min-width: 0;
  overflow-x: auto;
  padding-bottom: 4px;
}

.is-horizontal .task-card {
  flex: 0 0 220px;
}

.is-vertical .task-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Tree connectors: a trunk down the left with a branch to each task. */
.is-vertical .task-card {
  position: relative;
}

.is-vertical .task-card::before {
  content: '';
  position: absolute;
  top: -8px;
  bottom: 0;
  left: -14px;
  border-left: 2px solid var(--color-border-strong);
}

.is-vertical .task-card:last-child::before {
  bottom: 50%;
}

.is-vertical .task-card::after {
  content: '';
  position: absolute;
  top: 50%;
  left: -14px;
  width: 13px;
  border-top: 2px solid var(--color-border-strong);
}

.task-card {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.task-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
}

.task-name {
  font-size: 0.9rem;
  color: var(--color-ink);
}

.task-meta {
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.task-record {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 8px;
  width: 100%;
  margin-top: 2px;
}

.task-capacity {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--color-text-muted);
}

.more-tasks {
  align-self: flex-start;
  padding: 4px 0;
  border: 0;
  background: none;
  color: var(--color-primary);
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

.is-horizontal .more-tasks {
  align-self: center;
}

@media (max-width: 900px) {
  .program-group.is-horizontal {
    grid-template-columns: minmax(0, 1fr);
  }

  .is-horizontal .connector {
    display: none;
  }
}
</style>
