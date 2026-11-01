<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { CARE_STATUSES, type CareStatus, type ProgramSummary } from '@abapro/shared';
import { taskCriteriaChanged, type CreateTaskInput, type TaskItem } from '@/api/tasks';
import AppButton from '@/components/ui/AppButton.vue';
import AppCheckbox from '@/components/ui/AppCheckbox.vue';
import AppDialog from '@/components/ui/AppDialog.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { careStatusTone } from '@/lib/format';

const props = withDefaults(
  defineProps<{
    open: boolean;
    mode?: 'create' | 'edit' | 'preview';
    task?: TaskItem | null;
    submitting?: boolean;
    defaultSd?: string;
    /** When set, creating a task asks which of these programs it belongs to. */
    programs?: ProgramSummary[] | null;
    /** Whether the preview offers Edit; people without permission to edit programs only view. */
    canEdit?: boolean;
  }>(),
  {
    mode: 'create',
    task: null,
    submitting: false,
    defaultSd: '',
    programs: null,
    canEdit: true,
  },
);

const emit = defineEmits<{
  close: [];
  submit: [data: CreateTaskInput];
  edit: [task: TaskItem];
}>();

const { t } = useI18n();
const taskNameInput = ref<HTMLInputElement | null>(null);
const formId = `task-form-${Math.random().toString(36).slice(2, 8)}`;

const form = reactive<CreateTaskInput & { programId: string; changeReason: string; status: CareStatus; promptUsed: boolean }>({
  name: '',
  desiredTrials: 1,
  phase: 'Treatment',
  masterySessions: 3,
  masteryProbe: 100,
  baselineSessions: undefined,
  baselineProbe: 100,
  sd: '',
  promptUsed: false,
  programId: '',
  changeReason: '',
  status: 'in_treatment',
});

const errors = reactive({
  programId: '',
  changeReason: '',
  name: '',
  desiredTrials: '',
  masterySessions: '',
  masteryProbe: '',
  baselineSessions: '',
  baselineProbe: '',
});

// New tasks choose Treatment or Baseline. A task already in another phase keeps it when edited.
const extraPhase = computed(() =>
  props.mode === 'edit' && props.task && !['Treatment', 'Baseline'].includes(props.task.phase) ? props.task.phase : '',
);

const choosesProgram = computed(() => props.mode === 'create' && props.programs !== null);
const needsReason = computed(() => props.mode === 'edit' && props.task !== null && taskCriteriaChanged(props.task, form));

const modalTitle = computed(() => {
  if (props.mode === 'edit') return t('tasks.modal.editTitle');
  if (props.mode === 'preview') return t('tasks.modal.previewTitle');
  return t('tasks.modal.createTitle');
});
const phaseName = (phase: string) => (['Baseline', 'Treatment', 'Maintenance', 'Mastered'].includes(phase) ? t(`phases.${phase}`) : phase);
const programName = computed(() => props.task?.programTitle ?? '');

function clearErrors(): void {
  for (const key of Object.keys(errors) as Array<keyof typeof errors>) errors[key] = '';
}

function resetForm(): void {
  form.name = '';
  form.desiredTrials = 1;
  form.phase = 'Treatment';
  form.masterySessions = 3;
  form.masteryProbe = 100;
  form.baselineSessions = undefined;
  form.baselineProbe = 100;
  form.sd = '';
  form.promptUsed = false;
  form.programId = '';
  form.changeReason = '';
  form.status = 'in_treatment';
  clearErrors();
}

function populateFromTask(t: TaskItem): void {
  form.name = t.name;
  form.desiredTrials = t.desiredTrials ?? 1;
  form.phase = t.phase || 'Treatment';
  form.masterySessions = t.masterySessions ?? 3;
  form.masteryProbe = t.masteryProbe ?? 100;
  form.baselineSessions = t.baselineSessions;
  form.baselineProbe = t.baselineProbe ?? 100;
  form.sd = t.sd || '';
  form.promptUsed = t.promptUsed;
  form.programId = t.programId;
  form.changeReason = '';
  form.status = t.status;
  clearErrors();
}

watch(
  () => form.phase,
  (newPhase) => {
    if (newPhase === 'Baseline') {
      if (form.baselineProbe === undefined || form.baselineProbe === null) {
        form.baselineProbe = 100;
      }
    } else {
      errors.baselineSessions = '';
      errors.baselineProbe = '';
    }
  },
);

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    if ((props.mode === 'edit' || props.mode === 'preview') && props.task) {
      populateFromTask(props.task);
    } else {
      resetForm();
      if (props.defaultSd) {
        form.sd = props.defaultSd;
      }
    }
  },
  // The task pages mount the modal already open.
  { immediate: true },
);

watch(
  () => props.task,
  (newTask) => {
    if (props.open && (props.mode === 'edit' || props.mode === 'preview') && newTask) {
      populateFromTask(newTask);
    }
  },
);

function handleSubmit(): void {
  if (props.mode === 'preview') return;

  clearErrors();

  let valid = true;

  if (choosesProgram.value && !form.programId) {
    errors.programId = t('tasks.modal.errors.program');
    valid = false;
  }

  if (!form.name.trim()) {
    errors.name = t('tasks.modal.errors.name');
    valid = false;
    taskNameInput.value?.focus();
  }

  if (form.desiredTrials === null || form.desiredTrials === undefined || form.desiredTrials < 1 || form.desiredTrials > 30) {
    errors.desiredTrials = t('tasks.modal.errors.trials');
    valid = false;
  }

  if (form.masterySessions === null || form.masterySessions === undefined || form.masterySessions < 1) {
    errors.masterySessions = t('tasks.modal.errors.sessions');
    valid = false;
  }

  if (
    form.masteryProbe === null ||
    form.masteryProbe === undefined ||
    form.masteryProbe < 0 ||
    form.masteryProbe > 100
  ) {
    errors.masteryProbe = t('tasks.modal.errors.probe');
    valid = false;
  }

  if (form.phase === 'Baseline') {
    if (
      form.baselineSessions !== undefined &&
      form.baselineSessions !== null &&
      String(form.baselineSessions).trim() !== '' &&
      Number(form.baselineSessions) < 1
    ) {
      errors.baselineSessions = t('tasks.modal.errors.sessions');
      valid = false;
    }

    if (
      form.baselineProbe !== undefined &&
      form.baselineProbe !== null &&
      String(form.baselineProbe).trim() !== '' &&
      (Number(form.baselineProbe) < 0 || Number(form.baselineProbe) > 100)
    ) {
      errors.baselineProbe = t('tasks.modal.errors.probe');
      valid = false;
    }
  }

  if (needsReason.value && form.changeReason.trim().length < 12) {
    errors.changeReason = t('tasks.modal.errors.reason');
    valid = false;
  }

  if (!valid) return;

  const submitData: CreateTaskInput = {
    name: form.name.trim(),
    desiredTrials: Number(form.desiredTrials) || 1,
    phase: form.phase || 'Treatment',
    masterySessions: Number(form.masterySessions) || 3,
    masteryProbe: Number(form.masteryProbe),
    sd: form.sd.trim(),
    promptUsed: form.promptUsed,
    programId: choosesProgram.value ? form.programId : undefined,
    changeReason: needsReason.value ? form.changeReason.trim() : undefined,
    status: props.mode === 'edit' ? form.status : undefined,
  };

  if (form.phase === 'Baseline') {
    if (
      form.baselineSessions !== undefined &&
      form.baselineSessions !== null &&
      String(form.baselineSessions).trim() !== ''
    ) {
      submitData.baselineSessions = Number(form.baselineSessions);
    }
    submitData.baselineProbe =
      form.baselineProbe !== undefined &&
      form.baselineProbe !== null &&
      String(form.baselineProbe).trim() !== ''
        ? Number(form.baselineProbe)
        : 100;
  }

  emit('submit', submitData);
}
</script>

<template>
  <AppDialog :open="open" :title="modalTitle" size="md" @close="emit('close')">
    <!-- Preview: the saved values as a read-only summary. -->
    <div v-if="mode === 'preview'" class="task-preview">
      <div class="preview-head">
        <h3 class="preview-name">{{ form.name }}</h3>
        <StatusBadge :tone="careStatusTone(form.status)" :label="t(`status.${form.status}`)" />
      </div>
      <p v-if="programName" class="preview-program">{{ programName }}</p>
      <dl class="detail-list">
        <div>
          <dt>{{ t('tasks.modal.phase') }}</dt>
          <dd>{{ phaseName(form.phase) }}</dd>
        </div>
        <div>
          <dt>{{ t('tasks.modal.desiredTrials') }}</dt>
          <dd>{{ form.desiredTrials }}</dd>
        </div>
        <div>
          <dt>{{ t('tasks.modal.masterySessions') }}</dt>
          <dd>{{ form.masterySessions }}</dd>
        </div>
        <div>
          <dt>{{ t('tasks.modal.masteryProbe') }}</dt>
          <dd>{{ form.masteryProbe }}%</dd>
        </div>
        <template v-if="form.phase === 'Baseline'">
          <div>
            <dt>{{ t('tasks.modal.baselineSessions') }}</dt>
            <dd>{{ form.baselineSessions ?? '—' }}</dd>
          </div>
          <div>
            <dt>{{ t('tasks.modal.baselineProbe') }}</dt>
            <dd>{{ form.baselineProbe ?? 100 }}%</dd>
          </div>
        </template>
        <div>
          <dt>{{ t('tasks.modal.promptUsed') }}</dt>
          <dd>{{ form.promptUsed ? t('tasks.modal.yes') : t('tasks.modal.no') }}</dd>
        </div>
      </dl>
      <div class="preview-sd">
        <span class="preview-label">{{ t('tasks.modal.sd') }}</span>
        <p>{{ form.sd || t('tasks.modal.noSd') }}</p>
      </div>
    </div>

    <form v-else :id="formId" class="task-form" novalidate @submit.prevent="handleSubmit">
      <section class="task-section">
        <h3 class="task-section-title">{{ t('tasks.modal.basics') }}</h3>
        <div v-if="choosesProgram" class="field">
          <label class="field-label" for="task-program">
            {{ t('tasks.modal.program') }}<span class="required-mark" aria-hidden="true">*</span>
          </label>
          <select
            id="task-program"
            v-model="form.programId"
            class="control"
            required
            :aria-invalid="errors.programId ? 'true' : undefined"
            :aria-describedby="errors.programId ? 'task-program-error' : undefined"
          >
            <option value="" disabled>{{ t('tasks.modal.chooseProgram') }}</option>
            <option v-for="program in programs" :key="program.id" :value="program.id">{{ program.title }} · {{ program.clientName }}</option>
          </select>
          <p v-if="errors.programId" id="task-program-error" class="field-error">{{ errors.programId }}</p>
        </div>
        <div class="field">
          <label class="field-label" for="task-name">{{ t('tasks.modal.name') }}<span class="required-mark" aria-hidden="true">*</span></label>
          <input
            id="task-name"
            ref="taskNameInput"
            v-model="form.name"
            type="text"
            class="control"
            :placeholder="t('tasks.modal.namePlaceholder')"
            required
            :aria-invalid="errors.name ? 'true' : undefined"
            :aria-describedby="errors.name ? 'task-name-error' : undefined"
          />
          <p v-if="errors.name" id="task-name-error" class="field-error">{{ errors.name }}</p>
        </div>
        <div class="field">
          <label class="field-label" for="task-sd">{{ t('tasks.modal.sd') }}</label>
          <textarea id="task-sd" v-model="form.sd" rows="2" class="control" :placeholder="t('tasks.modal.sdPlaceholder')" aria-describedby="task-sd-hint"></textarea>
          <p id="task-sd-hint" class="field-hint">{{ t('tasks.modal.sdHint') }}</p>
        </div>
      </section>

      <section class="task-section">
        <h3 class="task-section-title">{{ t('tasks.modal.trialsSection') }}</h3>
        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="desired-trials">{{ t('tasks.modal.desiredTrials') }}</label>
            <input
              id="desired-trials"
              v-model.number="form.desiredTrials"
              type="number"
              min="1"
              max="30"
              step="1"
              class="control"
              :aria-invalid="errors.desiredTrials ? 'true' : undefined"
              :aria-describedby="errors.desiredTrials ? 'desired-trials-error' : 'desired-trials-hint'"
            />
            <p v-if="errors.desiredTrials" id="desired-trials-error" class="field-error">{{ errors.desiredTrials }}</p>
            <p v-else id="desired-trials-hint" class="field-hint">{{ t('tasks.modal.desiredTrialsHint') }}</p>
          </div>
          <div class="field">
            <label class="field-label" for="task-phase">{{ t('tasks.modal.phase') }}</label>
            <select id="task-phase" v-model="form.phase" class="control">
              <option value="Treatment">{{ phaseName('Treatment') }}</option>
              <option value="Baseline">{{ phaseName('Baseline') }}</option>
              <option v-if="extraPhase" :value="extraPhase">{{ phaseName(extraPhase) }}</option>
            </select>
          </div>
          <div v-if="mode === 'edit'" class="field">
            <label class="field-label" for="task-status">{{ t('tasks.modal.status') }}</label>
            <select id="task-status" v-model="form.status" class="control">
              <option v-for="value in CARE_STATUSES" :key="value" :value="value">{{ t(`status.${value}`) }}</option>
            </select>
          </div>
        </div>
        <div class="prompt-used">
          <AppCheckbox v-model="form.promptUsed" :label="t('tasks.modal.promptUsed')" />
          <p class="field-hint">{{ t('tasks.modal.promptUsedHint') }}</p>
        </div>
      </section>

      <section class="task-section">
        <h3 class="task-section-title">{{ t('tasks.modal.masterySection') }}</h3>
        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="mastery-sessions">{{ t('tasks.modal.masterySessions') }}</label>
            <input
              id="mastery-sessions"
              v-model.number="form.masterySessions"
              type="number"
              min="1"
              step="1"
              class="control"
              :aria-invalid="errors.masterySessions ? 'true' : undefined"
              :aria-describedby="errors.masterySessions ? 'mastery-sessions-error' : undefined"
            />
            <p v-if="errors.masterySessions" id="mastery-sessions-error" class="field-error">{{ errors.masterySessions }}</p>
          </div>
          <div class="field">
            <label class="field-label" for="mastery-probe">{{ t('tasks.modal.masteryProbe') }}</label>
            <input
              id="mastery-probe"
              v-model.number="form.masteryProbe"
              type="number"
              min="0"
              max="100"
              step="1"
              class="control"
              :aria-invalid="errors.masteryProbe ? 'true' : undefined"
              :aria-describedby="errors.masteryProbe ? 'mastery-probe-error' : undefined"
            />
            <p v-if="errors.masteryProbe" id="mastery-probe-error" class="field-error">{{ errors.masteryProbe }}</p>
          </div>
        </div>
      </section>

      <!-- Revealed only for Baseline tasks. -->
      <section v-if="form.phase === 'Baseline'" class="task-section is-revealed">
        <h3 class="task-section-title">{{ t('tasks.modal.baselineSection') }}</h3>
        <p class="field-hint">{{ t('tasks.modal.baselineHint') }}</p>
        <div class="form-grid">
          <div class="field">
            <label class="field-label" for="baseline-sessions">{{ t('tasks.modal.baselineSessions') }}</label>
            <input
              id="baseline-sessions"
              v-model.number="form.baselineSessions"
              type="number"
              min="1"
              step="1"
              class="control"
              placeholder="3"
              :aria-invalid="errors.baselineSessions ? 'true' : undefined"
              :aria-describedby="errors.baselineSessions ? 'baseline-sessions-error' : undefined"
            />
            <p v-if="errors.baselineSessions" id="baseline-sessions-error" class="field-error">{{ errors.baselineSessions }}</p>
          </div>
          <div class="field">
            <label class="field-label" for="baseline-probe">{{ t('tasks.modal.baselineProbe') }}</label>
            <input
              id="baseline-probe"
              v-model.number="form.baselineProbe"
              type="number"
              min="0"
              max="100"
              step="1"
              class="control"
              :aria-invalid="errors.baselineProbe ? 'true' : undefined"
              :aria-describedby="errors.baselineProbe ? 'baseline-probe-error' : undefined"
            />
            <p v-if="errors.baselineProbe" id="baseline-probe-error" class="field-error">{{ errors.baselineProbe }}</p>
          </div>
        </div>
      </section>

      <section v-if="needsReason" class="task-section is-revealed">
        <div class="field">
          <label class="field-label" for="task-change-reason">
            {{ t('tasks.modal.changeReason') }}<span class="required-mark" aria-hidden="true">*</span>
          </label>
          <textarea
            id="task-change-reason"
            v-model="form.changeReason"
            rows="2"
            class="control"
            :placeholder="t('tasks.modal.changeReasonPlaceholder')"
            :aria-invalid="errors.changeReason ? 'true' : undefined"
            aria-describedby="task-change-reason-hint"
          ></textarea>
          <p v-if="errors.changeReason" class="field-error">{{ errors.changeReason }}</p>
          <p id="task-change-reason-hint" class="field-hint">{{ t('tasks.modal.changeReasonHint') }}</p>
        </div>
      </section>
    </form>

    <template #footer>
      <AppButton type="button" variant="secondary" @click="emit('close')">{{ mode === 'preview' ? t('common.close') : t('common.cancel') }}</AppButton>
      <AppButton v-if="mode === 'preview' && props.task && canEdit" type="button" icon="edit" @click="emit('edit', props.task)">{{ t('tasks.modal.editTask') }}</AppButton>
      <AppButton v-else-if="mode !== 'preview'" type="submit" :form="formId" :loading="submitting">
        {{ mode === 'edit' ? t('tasks.modal.save') : t('tasks.modal.submit') }}
      </AppButton>
    </template>
  </AppDialog>
</template>

<style scoped>
.task-form {
  display: grid;
  gap: var(--space-5);
}

.task-section {
  display: grid;
  gap: var(--space-3);
}

.task-section + .task-section {
  padding-top: var(--space-5);
  border-top: 1px solid var(--color-border);
}

.task-section.is-revealed {
  animation: reveal 0.18s ease;
}

.task-section-title {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: 600;
}

.prompt-used .field-hint {
  margin-top: 2px;
  padding-inline-start: 28px;
}

.task-preview {
  display: grid;
  gap: var(--space-4);
}

.preview-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.preview-name {
  font-size: var(--text-lg);
  overflow-wrap: anywhere;
}

.preview-program,
.preview-label {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.preview-sd {
  display: grid;
  gap: 4px;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
  white-space: pre-wrap;
}

@keyframes reveal {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}
</style>
