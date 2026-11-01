<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { PROMPT_LEVEL_OPTIONS, type PromptLevel, type RecordResponse, type TaskRecordingStatus } from '@abapro/shared';
import type { TaskItem } from '@/api/tasks';
import AppIcon from '@/components/navigation/AppIcon.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppDialog from '@/components/ui/AppDialog.vue';
import FieldError from '@/components/ui/FieldError.vue';

const props = defineProps<{
  open: boolean;
  task: TaskItem | null;
  /** Today's shared capacity for the task; refreshed when the popup opens. */
  status: TaskRecordingStatus | undefined;
  saving: boolean;
}>();
const emit = defineEmits<{ submit: [value: { response: RecordResponse } | { promptLevels: PromptLevel[] }]; close: [] }>();

const { t } = useI18n();
const levelOptions = computed(() => PROMPT_LEVEL_OPTIONS.map((option) => ({ value: option.value, label: t(`promptLevels.${option.value}`) })));
const response = ref('');
const promptLevels = ref<PromptLevel[]>([]);
const error = ref('');

/** The task's saved Prompt Used setting, as the API last reported it. */
const promptUsed = computed(() => props.status?.promptUsed ?? props.task?.promptUsed ?? false);

function chooseResponse(value: RecordResponse): void {
  response.value = value;
  error.value = '';
}

/** One mark per trial today: recorded, the one being recorded now, or still to come. */
const trialMarks = computed(() => {
  const status = props.status;
  if (!status) return [];
  return Array.from({ length: status.dailyLimit }, (_, index) => {
    if (index < status.recordedToday) return 'done';
    return index === status.recordedToday ? 'current' : 'todo';
  });
});

function toggleLevel(level: PromptLevel, checked: boolean): void {
  promptLevels.value = checked ? [...promptLevels.value, level] : promptLevels.value.filter((item) => item !== level);
  error.value = '';
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      response.value = '';
      promptLevels.value = [];
      error.value = '';
    }
  },
);

const full = computed(() => props.status?.remainingToday === 0);
const position = computed(() => {
  const status = props.status;
  if (!status) return t('recordDialog.checking');
  if (status.nextTrial === null) {
    return t('recordDialog.complete', { total: status.dailyLimit });
  }
  return t('recordDialog.trialOf', { n: status.nextTrial, total: status.dailyLimit });
});

function submit(): void {
  if (promptUsed.value) {
    if (promptLevels.value.length === 0) {
      error.value = t('recordDialog.chooseLevels');
      return;
    }
    // Sent in the listed order, whatever order they were ticked in.
    emit('submit', { promptLevels: PROMPT_LEVEL_OPTIONS.map((option) => option.value).filter((level) => promptLevels.value.includes(level)) });
    return;
  }
  if (response.value !== 'yes' && response.value !== 'no') {
    error.value = t('recordDialog.chooseResponse');
    return;
  }
  emit('submit', { response: response.value });
}
</script>

<template>
  <AppDialog :open="open" :title="t('recordDialog.title')" size="sm" footer-align="center" @close="emit('close')">
    <div class="record">
      <!-- What is being recorded. -->
      <div class="record-task">
        <p class="record-program">{{ task?.programTitle }}</p>
        <p class="record-name">{{ task?.name }}</p>
      </div>

      <!-- Today's trials, shared by the care team. -->
      <div class="record-progress" :class="{ 'is-complete': full }">
        <div class="record-progress-head">
          <span class="record-position">
            <AppIcon v-if="full" name="check" :size="16" />
            {{ position }}
          </span>
        </div>
        <ol v-if="trialMarks.length && trialMarks.length <= 30" class="trial-marks" aria-hidden="true">
          <li v-for="(mark, index) in trialMarks" :key="index" :class="`is-${mark}`"></li>
        </ol>
        <p v-if="status && !full" class="record-shared">{{ t('recordDialog.remaining', { left: status.remainingToday, total: status.dailyLimit }) }}</p>
      </div>

      <!-- Yes or No. -->
      <fieldset v-if="!full && status && !promptUsed" class="record-choice" aria-describedby="record-error">
        <legend class="record-legend">{{ t('recordDialog.chooseHint') }}</legend>
        <div class="response-tiles">
          <label v-for="value in (['yes', 'no'] as const)" :key="value" class="response-tile" :class="[`is-${value}`, { 'is-selected': response === value }]">
            <input class="choice-input" type="radio" name="record-response" :value="value" :checked="response === value" @change="chooseResponse(value)" />
            <span class="response-mark" aria-hidden="true"><AppIcon :name="value === 'yes' ? 'plus' : 'minus'" :size="22" /></span>
            <span class="response-label">{{ value === 'yes' ? t('graph.yes') : t('graph.no') }}</span>
            <span class="response-hint">{{ value === 'yes' ? t('recordDialog.yesHint') : t('recordDialog.noHint') }}</span>
          </label>
        </div>
        <FieldError id="record-error" :message="error" />
      </fieldset>

      <!-- Prompt levels. -->
      <fieldset v-else-if="!full && status && promptUsed" class="record-choice" aria-describedby="record-error">
        <legend class="record-legend">{{ t('recordDialog.levelsHint') }}</legend>
        <div class="level-chips">
          <label v-for="option in levelOptions" :key="option.value" class="level-chip" :class="{ 'is-selected': promptLevels.includes(option.value) }">
            <input
              class="choice-input"
              type="checkbox"
              :checked="promptLevels.includes(option.value)"
              @change="toggleLevel(option.value, ($event.target as HTMLInputElement).checked)"
            />
            <span class="level-check" aria-hidden="true"><AppIcon name="check" :size="14" /></span>
            {{ option.label }}
          </label>
        </div>
        <FieldError id="record-error" :message="error" />
      </fieldset>
    </div>

    <template #footer>
      <AppButton type="button" variant="ghost" @click="emit('close')">{{ t('common.cancel') }}</AppButton>
      <AppButton type="button" class="record-submit" icon="check" :loading="saving" :disabled="full || !status" @click="submit">
        {{ t('recordDialog.submit') }}
      </AppButton>
    </template>
  </AppDialog>
</template>

<style scoped>
.record {
  display: grid;
  gap: var(--space-5);
}

.record-task {
  display: grid;
  gap: 2px;
  text-align: center;
}

.record-program {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: 500;
}

.record-name {
  color: var(--color-ink);
  font-size: var(--text-lg);
  font-weight: 650;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

/* Today's progress */
.record-progress {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
}

.record-progress.is-complete {
  background: var(--color-success-soft);
  border-color: transparent;
}

.record-progress-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px var(--space-3);
}

.record-position {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--color-ink);
  font-weight: 600;
}

.is-complete .record-position {
  color: var(--color-success);
}

.record-shared {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}

.trial-marks {
  display: flex;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.trial-marks li {
  flex: 1;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--color-border);
}

.trial-marks .is-done {
  background: var(--color-primary);
}

.trial-marks .is-current {
  background: color-mix(in srgb, var(--color-primary) 35%, var(--color-border));
}

/* Choices */
.record-choice {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  border: 0;
}

.record-legend {
  padding: 0;
  margin-bottom: var(--space-3);
  color: var(--color-ink);
  font-size: var(--text-sm);
  font-weight: 600;
  text-align: center;
}

/* The real input covers its whole tile, invisibly, so clicks, taps and assistive tools all reach it. */
.choice-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.response-tiles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.response-tile {
  position: relative;
  --tone: var(--color-success);
  --tone-soft: var(--color-success-soft);
  display: grid;
  justify-items: center;
  align-content: start;
  gap: 4px;
  padding: var(--space-4) var(--space-3);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  text-align: center;
  cursor: pointer;
  transition: border-color var(--transition), background-color var(--transition), box-shadow var(--transition), transform 0.1s ease;
}

.response-tile.is-no {
  --tone: var(--color-danger);
  --tone-soft: var(--color-danger-soft);
}

.response-tile:hover {
  border-color: var(--tone);
}

.response-tile:active {
  transform: scale(0.98);
}

.response-tile:has(input:focus-visible) {
  box-shadow: var(--focus);
}

.response-tile.is-selected {
  border-color: var(--tone);
  background: var(--tone-soft);
  box-shadow: 0 0 0 1px var(--tone);
}

.response-mark {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--tone-soft);
  color: var(--tone);
  transition: background-color var(--transition), color var(--transition);
}

.is-selected .response-mark {
  background: var(--tone);
  color: #ffffff;
}

.response-label {
  color: var(--color-ink);
  font-size: var(--text-md);
  font-weight: 650;
}

.response-hint {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}

.level-chips {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.level-chip {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  padding: var(--space-2) var(--space-3);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-ink);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: border-color var(--transition), background-color var(--transition);
}

.level-chip:hover {
  border-color: var(--color-primary);
}

.level-chip:has(input:focus-visible) {
  box-shadow: var(--focus);
}

.level-chip.is-selected {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}

.level-check {
  display: grid;
  place-items: center;
  flex: none;
  width: 20px;
  height: 20px;
  border: 1.5px solid var(--color-border-strong);
  border-radius: 6px;
  color: transparent;
}

.is-selected .level-check {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #ffffff;
}

.record-submit {
  min-width: 180px;
}

@media (max-width: 380px) {
  .level-chips {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .response-tile:active {
    transform: none;
  }
}
</style>
