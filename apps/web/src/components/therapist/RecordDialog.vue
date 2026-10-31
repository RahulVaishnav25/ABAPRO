<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { PROMPT_LEVEL_OPTIONS, type PromptLevel, type RecordResponse, type TaskRecordingStatus } from '@abapro/shared';
import type { TaskItem } from '@/api/tasks';
import AppButton from '@/components/ui/AppButton.vue';
import AppCheckbox from '@/components/ui/AppCheckbox.vue';
import AppDialog from '@/components/ui/AppDialog.vue';
import AppRadioGroup from '@/components/ui/AppRadioGroup.vue';
import FieldError from '@/components/ui/FieldError.vue';

const RESPONSE_OPTIONS = [
  { value: 'yes', label: '+ (Yes)' },
  { value: 'no', label: '− (No)' },
];

const props = defineProps<{
  open: boolean;
  task: TaskItem | null;
  /** Today's shared capacity for the task; refreshed when the popup opens. */
  status: TaskRecordingStatus | undefined;
  saving: boolean;
}>();
const emit = defineEmits<{ submit: [value: { response: RecordResponse } | { promptLevels: PromptLevel[] }]; close: [] }>();

const response = ref('');
const promptLevels = ref<PromptLevel[]>([]);
const error = ref('');

/** The task's saved Prompt Used setting, as the API last reported it. */
const promptUsed = computed(() => props.status?.promptUsed ?? props.task?.promptUsed ?? false);

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
  if (!status) return 'Checking today’s records…';
  if (status.nextSession === null || status.nextTrial === null) {
    return `Today is complete: ${status.sessionsPerDay} of ${status.sessionsPerDay} sessions recorded.`;
  }
  return `Session ${status.nextSession} of ${status.sessionsPerDay} · Trial ${status.nextTrial} of ${status.trialsPerSession}`;
});

function submit(): void {
  if (promptUsed.value) {
    if (promptLevels.value.length === 0) {
      error.value = 'Choose one or more prompt levels.';
      return;
    }
    // Sent in the listed order, whatever order they were ticked in.
    emit('submit', { promptLevels: PROMPT_LEVEL_OPTIONS.map((option) => option.value).filter((level) => promptLevels.value.includes(level)) });
    return;
  }
  if (response.value !== 'yes' && response.value !== 'no') {
    error.value = 'Choose + (Yes) or − (No).';
    return;
  }
  emit('submit', { response: response.value });
}
</script>

<template>
  <AppDialog :open="open" title="Record" @close="emit('close')">
    <dl class="record-task">
      <div>
        <dt>Program</dt>
        <dd>{{ task?.programTitle }}</dd>
      </div>
      <div>
        <dt>Task</dt>
        <dd>{{ task?.name }}</dd>
      </div>
    </dl>
    <p class="record-position">{{ position }}</p>
    <p v-if="status" class="record-remaining">
      {{ status.remainingToday }} of {{ status.trialsPerSession * status.sessionsPerDay }} records left today, shared by everyone on this client’s care team.
    </p>
    <fieldset v-if="!full && promptUsed" class="choice-group record-options" aria-describedby="record-levels-error">
      <legend>Prompt levels</legend>
      <AppCheckbox
        v-for="option in PROMPT_LEVEL_OPTIONS"
        :key="option.value"
        :model-value="promptLevels.includes(option.value)"
        :label="option.label"
        @update:model-value="toggleLevel(option.value, $event)"
      />
      <FieldError id="record-levels-error" :message="error" />
    </fieldset>
    <AppRadioGroup
      v-else-if="!full"
      v-model="response"
      class="record-options"
      label="Response"
      name="record-response"
      :options="RESPONSE_OPTIONS"
      :error="error"
    />
    <template #footer>
      <AppButton type="button" variant="secondary" @click="emit('close')">Cancel</AppButton>
      <AppButton type="button" :loading="saving" :disabled="full || !status" @click="submit">Submit</AppButton>
    </template>
  </AppDialog>
</template>

<style scoped>
.record-task {
  display: grid;
  gap: 8px;
  margin: 4px 0 12px;
}

.record-task div {
  display: grid;
  gap: 2px;
}

.record-task dt {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.record-task dd {
  margin: 0;
  font-weight: 700;
  color: var(--color-ink);
}

.record-position {
  margin: 0;
  font-weight: 600;
  color: var(--color-ink);
}

.record-remaining {
  margin: 2px 0 14px;
  font-size: 0.88rem;
}

.record-options {
  color: var(--color-ink);
}

fieldset.record-options {
  gap: 2px;
}
</style>
