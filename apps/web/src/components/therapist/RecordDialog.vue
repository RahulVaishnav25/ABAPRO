<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { PROMPT_LEVEL_OPTIONS, type PromptLevel, type RecordResponse, type TaskRecordingStatus } from '@abapro/shared';
import type { TaskItem } from '@/api/tasks';
import AppButton from '@/components/ui/AppButton.vue';
import AppCheckbox from '@/components/ui/AppCheckbox.vue';
import AppDialog from '@/components/ui/AppDialog.vue';
import AppRadioGroup from '@/components/ui/AppRadioGroup.vue';
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
const responseOptions = computed(() => [
  { value: 'yes', label: t('workspace.yes') },
  { value: 'no', label: t('workspace.no') },
]);
const levelOptions = computed(() => PROMPT_LEVEL_OPTIONS.map((option) => ({ value: option.value, label: t(`promptLevels.${option.value}`) })));
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
  <AppDialog :open="open" :title="t('recordDialog.title')" size="sm" @close="emit('close')">
    <dl class="record-task">
      <div>
        <dt>{{ t('recordDialog.program') }}</dt>
        <dd>{{ task?.programTitle }}</dd>
      </div>
      <div>
        <dt>{{ t('recordDialog.task') }}</dt>
        <dd>{{ task?.name }}</dd>
      </div>
    </dl>
    <p class="record-position">{{ position }}</p>
    <p v-if="status" class="record-remaining">
      {{ t('recordDialog.remaining', { left: status.remainingToday, total: status.dailyLimit }) }}
    </p>
    <fieldset v-if="!full && promptUsed" class="choice-group record-options" aria-describedby="record-levels-error">
      <legend>{{ t('recordDialog.promptLevels') }}</legend>
      <AppCheckbox
        v-for="option in levelOptions"
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
      :label="t('recordDialog.response')"
      name="record-response"
      :options="responseOptions"
      :error="error"
    />
    <template #footer>
      <AppButton type="button" variant="secondary" @click="emit('close')">{{ t('common.cancel') }}</AppButton>
      <AppButton type="button" :loading="saving" :disabled="full || !status" @click="submit">{{ t('recordDialog.submit') }}</AppButton>
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
  font-size: var(--text-sm);
  font-weight: 500;
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
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.record-options {
  color: var(--color-ink);
}

fieldset.record-options {
  gap: 2px;
}
</style>
