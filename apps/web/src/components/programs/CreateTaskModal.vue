<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { CARE_STATUS_OPTIONS, careStatusLabel, type CareStatus, type ProgramSummary } from '@abapro/shared';
import { taskCriteriaChanged, type CreateTaskInput, type TaskItem } from '@/api/tasks';
import AppCheckbox from '@/components/ui/AppCheckbox.vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    mode?: 'create' | 'edit' | 'preview';
    task?: TaskItem | null;
    submitting?: boolean;
    defaultSd?: string;
    /** When set, creating a task asks which of these programs it belongs to. */
    programs?: ProgramSummary[] | null;
  }>(),
  {
    mode: 'create',
    task: null,
    submitting: false,
    defaultSd: '',
    programs: null,
  },
);

const emit = defineEmits<{
  close: [];
  submit: [data: CreateTaskInput];
  edit: [task: TaskItem];
}>();

const taskNameInput = ref<HTMLInputElement | null>(null);

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
  if (props.mode === 'edit') return 'Edit Task';
  if (props.mode === 'preview') return 'Task Preview';
  return 'Create Task';
});

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

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && props.open) {
    event.preventDefault();
    emit('close');
  }
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      if ((props.mode === 'edit' || props.mode === 'preview') && props.task) {
        populateFromTask(props.task);
      } else {
        resetForm();
        if (props.defaultSd) {
          form.sd = props.defaultSd;
        }
      }
      document.addEventListener('keydown', onKeydown);
      document.body.style.overflow = 'hidden';
      await nextTick();
      if (props.mode !== 'preview') {
        taskNameInput.value?.focus();
      }
    } else {
      document.removeEventListener('keydown', onKeydown);
      document.body.style.overflow = '';
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

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  document.body.style.overflow = '';
});

function handleSubmit(): void {
  if (props.mode === 'preview') return;

  clearErrors();

  let valid = true;

  if (choosesProgram.value && !form.programId) {
    errors.programId = 'Choose a program.';
    valid = false;
  }

  if (!form.name.trim()) {
    errors.name = 'Task Name is required.';
    valid = false;
    taskNameInput.value?.focus();
  }

  if (form.desiredTrials === null || form.desiredTrials === undefined || form.desiredTrials < 1 || form.desiredTrials > 30) {
    errors.desiredTrials = 'Must be 1 to 30.';
    valid = false;
  }

  if (form.masterySessions === null || form.masterySessions === undefined || form.masterySessions < 1) {
    errors.masterySessions = 'Must be at least 1.';
    valid = false;
  }

  if (
    form.masteryProbe === null ||
    form.masteryProbe === undefined ||
    form.masteryProbe < 0 ||
    form.masteryProbe > 100
  ) {
    errors.masteryProbe = 'Must be 0 to 100.';
    valid = false;
  }

  if (form.phase === 'Baseline') {
    if (
      form.baselineSessions !== undefined &&
      form.baselineSessions !== null &&
      String(form.baselineSessions).trim() !== '' &&
      Number(form.baselineSessions) < 1
    ) {
      errors.baselineSessions = 'Must be at least 1.';
      valid = false;
    }

    if (
      form.baselineProbe !== undefined &&
      form.baselineProbe !== null &&
      String(form.baselineProbe).trim() !== '' &&
      (Number(form.baselineProbe) < 0 || Number(form.baselineProbe) > 100)
    ) {
      errors.baselineProbe = 'Must be 0 to 100.';
      valid = false;
    }
  }

  if (needsReason.value && form.changeReason.trim().length < 12) {
    errors.changeReason = 'Explain the change in at least 12 characters.';
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
  <Teleport to="body">
    <div
      v-if="open"
      class="modal-backdrop"
      role="presentation"
      @mousedown.self="emit('close')"
    >
      <div
        class="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <!-- Modal Header with Close Icon at Top-Right -->
        <div class="modal-header">
          <h2 id="modal-title" class="modal-title">{{ modalTitle }}</h2>
          <button
            type="button"
            class="close-button"
            aria-label="Close"
            @click="emit('close')"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <form class="modal-form" novalidate @submit.prevent="handleSubmit">
          <template v-if="choosesProgram">
            <div class="field-group">
              <div class="field">
                <label class="field-label" for="task-program">
                  Program<span class="required-mark" aria-hidden="true">*</span>
                </label>
                <select
                  id="task-program"
                  v-model="form.programId"
                  class="control"
                  required
                  :aria-invalid="errors.programId ? 'true' : undefined"
                  :aria-describedby="errors.programId ? 'task-program-error' : undefined"
                >
                  <option value="" disabled>Choose a program</option>
                  <option v-for="program in programs" :key="program.id" :value="program.id">
                    {{ program.title }} · {{ program.clientName }}
                  </option>
                </select>
                <p v-if="errors.programId" id="task-program-error" class="field-error">{{ errors.programId }}</p>
              </div>
            </div>

            <div class="field-divider" aria-hidden="true"></div>
          </template>

          <!-- Field Group 1: Task Name (Full-width text field; required) -->
          <div class="field-group">
            <div class="field">
              <label class="field-label" for="task-name">
                Task Name<span v-if="mode !== 'preview'" class="required-mark" aria-hidden="true">*</span>
              </label>
              <input
                v-if="mode !== 'preview'"
                id="task-name"
                ref="taskNameInput"
                v-model="form.name"
                type="text"
                class="control"
                placeholder="Enter task name"
                required
                :aria-invalid="errors.name ? 'true' : undefined"
                :aria-describedby="errors.name ? 'task-name-error' : undefined"
              />
              <input
                v-else
                id="task-name"
                :value="form.name"
                type="text"
                class="control"
                readonly
              />
              <p v-if="errors.name && mode !== 'preview'" id="task-name-error" class="field-error">{{ errors.name }}</p>
            </div>
          </div>

          <div class="field-divider" aria-hidden="true"></div>

          <!-- Field Group 2: Desired Trials and Phase (Side by Side) -->
          <div class="field-group side-by-side">
            <div class="field">
              <label class="field-label" for="desired-trials">Desired Trials</label>
              <input
                v-if="mode !== 'preview'"
                id="desired-trials"
                v-model.number="form.desiredTrials"
                type="number"
                min="1"
                max="30"
                step="1"
                class="control"
                :aria-invalid="errors.desiredTrials ? 'true' : undefined"
              />
              <input
                v-else
                id="desired-trials"
                :value="form.desiredTrials"
                type="text"
                class="control"
                readonly
              />
              <p v-if="errors.desiredTrials && mode !== 'preview'" class="field-error">{{ errors.desiredTrials }}</p>
            </div>

            <div class="field">
              <label class="field-label" for="task-phase">Phase</label>
              <select
                v-if="mode !== 'preview'"
                id="task-phase"
                v-model="form.phase"
                class="control"
              >
                <option value="Treatment">Treatment</option>
                <option value="Baseline">Baseline</option>
                <option v-if="extraPhase" :value="extraPhase">{{ extraPhase }}</option>
              </select>
              <input
                v-else
                id="task-phase"
                :value="form.phase"
                type="text"
                class="control"
                readonly
              />
            </div>
          </div>

          <template v-if="mode !== 'create'">
            <div class="field-divider" aria-hidden="true"></div>

            <div class="field-group">
              <div class="field">
                <label class="field-label" for="task-status">Status</label>
                <select
                  v-if="mode === 'edit'"
                  id="task-status"
                  v-model="form.status"
                  class="control"
                >
                  <option v-for="option in CARE_STATUS_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
                <input
                  v-else
                  id="task-status"
                  :value="careStatusLabel(form.status)"
                  type="text"
                  class="control"
                  readonly
                />
              </div>
            </div>
          </template>

          <!-- Conditional Baseline Fields (When Phase = Baseline) -->
          <template v-if="form.phase === 'Baseline'">
            <div class="field-divider" aria-hidden="true"></div>

            <div class="field-group side-by-side">
              <div class="field">
                <label class="field-label" for="baseline-sessions">Baseline Sessions</label>
                <input
                  v-if="mode !== 'preview'"
                  id="baseline-sessions"
                  v-model.number="form.baselineSessions"
                  type="number"
                  min="1"
                  step="1"
                  class="control"
                  placeholder="e.g. 3"
                  :aria-invalid="errors.baselineSessions ? 'true' : undefined"
                />
                <input
                  v-else
                  id="baseline-sessions"
                  :value="form.baselineSessions ?? '—'"
                  type="text"
                  class="control"
                  readonly
                />
                <p v-if="errors.baselineSessions && mode !== 'preview'" class="field-error">{{ errors.baselineSessions }}</p>
              </div>

              <div class="field">
                <label class="field-label" for="baseline-probe">Baseline Probe %</label>
                <input
                  v-if="mode !== 'preview'"
                  id="baseline-probe"
                  v-model.number="form.baselineProbe"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  class="control"
                  :aria-invalid="errors.baselineProbe ? 'true' : undefined"
                />
                <input
                  v-else
                  id="baseline-probe"
                  :value="form.baselineProbe !== undefined ? form.baselineProbe + '%' : '100%'"
                  type="text"
                  class="control"
                  readonly
                />
                <p v-if="errors.baselineProbe && mode !== 'preview'" class="field-error">{{ errors.baselineProbe }}</p>
              </div>
            </div>
          </template>

          <div class="field-divider" aria-hidden="true"></div>

          <!-- Field Group 3: Mastery Sessions and Mastery Probe % (Side by Side) -->
          <div class="field-group side-by-side">
            <div class="field">
              <label class="field-label" for="mastery-sessions">Mastery Sessions</label>
              <input
                v-if="mode !== 'preview'"
                id="mastery-sessions"
                v-model.number="form.masterySessions"
                type="number"
                min="1"
                step="1"
                class="control"
                :aria-invalid="errors.masterySessions ? 'true' : undefined"
              />
              <input
                v-else
                id="mastery-sessions"
                :value="form.masterySessions"
                type="text"
                class="control"
                readonly
              />
              <p v-if="errors.masterySessions && mode !== 'preview'" class="field-error">{{ errors.masterySessions }}</p>
            </div>

            <div class="field">
              <label class="field-label" for="mastery-probe">Mastery Probe %</label>
              <input
                v-if="mode !== 'preview'"
                id="mastery-probe"
                v-model.number="form.masteryProbe"
                type="number"
                min="0"
                max="100"
                step="1"
                class="control"
                :aria-invalid="errors.masteryProbe ? 'true' : undefined"
              />
              <input
                v-else
                id="mastery-probe"
                :value="form.masteryProbe !== undefined ? form.masteryProbe + '%' : '100%'"
                type="text"
                class="control"
                readonly
              />
              <p v-if="errors.masteryProbe && mode !== 'preview'" class="field-error">{{ errors.masteryProbe }}</p>
            </div>
          </div>

          <div class="field-divider" aria-hidden="true"></div>

          <!-- Field Group 4: SD (Full-width multiline text field with helper text) -->
          <div class="field-group">
            <div class="field">
              <label class="field-label" for="task-sd">SD</label>
              <textarea
                v-if="mode !== 'preview'"
                id="task-sd"
                v-model="form.sd"
                rows="3"
                class="control"
                placeholder="Enter discriminative stimulus instructions"
                aria-describedby="task-sd-hint"
              ></textarea>
              <textarea
                v-else
                id="task-sd"
                :value="form.sd || 'No discriminative stimulus specified.'"
                rows="3"
                class="control"
                readonly
                aria-describedby="task-sd-hint"
              ></textarea>
              <p id="task-sd-hint" class="field-hint">Based on current target.</p>
            </div>
          </div>

          <div class="field-divider" aria-hidden="true"></div>

          <div class="field-group">
            <AppCheckbox v-model="form.promptUsed" label="Prompt Used" :disabled="mode === 'preview'" />
          </div>

          <template v-if="needsReason">
            <div class="field-divider" aria-hidden="true"></div>

            <div class="field-group">
              <div class="field">
                <label class="field-label" for="task-change-reason">
                  Reason for change<span class="required-mark" aria-hidden="true">*</span>
                </label>
                <textarea
                  id="task-change-reason"
                  v-model="form.changeReason"
                  rows="2"
                  class="control"
                  placeholder="Why are the trials, mastery criteria or status changing?"
                  :aria-invalid="errors.changeReason ? 'true' : undefined"
                  aria-describedby="task-change-reason-hint"
                ></textarea>
                <p v-if="errors.changeReason" class="field-error">{{ errors.changeReason }}</p>
                <p id="task-change-reason-hint" class="field-hint">Saved with the target's configuration history.</p>
              </div>
            </div>
          </template>

          <div class="field-divider" aria-hidden="true"></div>

          <!-- Centered Red Submit / Action Button -->
          <div class="modal-actions-center">
            <button
              v-if="mode !== 'preview'"
              type="submit"
              class="btn btn-danger btn-submit-red"
              :disabled="submitting"
            >
              <span v-if="submitting" class="spinner" aria-hidden="true"></span>
              {{ mode === 'edit' ? 'Save Changes' : 'Submit' }}
            </button>
            <button
              v-else-if="props.task"
              type="button"
              class="btn btn-danger btn-submit-red"
              @click="emit('edit', props.task)"
            >
              Edit Task
            </button>
            <button
              v-else
              type="button"
              class="btn btn-danger btn-submit-red"
              @click="emit('close')"
            >
              Close
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Dimmed backdrop behind the modal */
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(18, 28, 36, 0.48);
  display: grid;
  place-items: center;
  padding: 16px;
  overflow-y: auto;
}

/* White modal with rounded corners and padding */
.modal-card {
  width: min(520px, 100%);
  background: #ffffff;
  border-radius: var(--radius-lg);
  box-shadow: 0 16px 36px rgba(18, 28, 36, 0.16), 0 4px 12px rgba(18, 28, 36, 0.08);
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
  position: relative;
  margin: auto;
}

/* Header with close icon at top-right */
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.modal-title {
  margin: 0;
  font-size: 1.28rem;
  font-weight: 700;
  color: var(--color-ink);
}

.close-button {
  background: transparent;
  border: 0;
  padding: 6px;
  cursor: pointer;
  color: var(--color-text-muted);
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  transition: color 0.15s ease, background-color 0.15s ease;
}

.close-button:hover {
  color: var(--color-ink);
  background-color: var(--color-surface-muted);
}

.close-button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.modal-form {
  display: flex;
  flex-direction: column;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Side by side layout for specified inputs */
.field-group.side-by-side {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--color-ink);
}

.required-mark {
  color: var(--color-danger, #d9383a);
  margin-inline-start: 3px;
}

.control {
  width: 100%;
  padding: 9px 12px;
  font-size: 0.95rem;
  color: var(--color-ink);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm, 6px);
  font-family: inherit;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.control:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-soft, #e7f4f2);
}

select.control {
  cursor: pointer;
}

textarea.control {
  resize: vertical;
  min-height: 72px;
}

.control[readonly] {
  background-color: var(--color-surface-muted, #f8fafc);
  color: var(--color-ink);
  cursor: default;
  border-color: var(--color-border);
}

.control[readonly]:focus {
  border-color: var(--color-border);
  box-shadow: none;
  outline: none;
}

.field-hint {
  margin: 2px 0 0;
  font-size: 0.82rem;
  color: var(--color-text-muted);
}

.field-error {
  margin: 2px 0 0;
  font-size: 0.82rem;
  color: var(--color-danger, #d9383a);
  font-weight: 600;
}

/* Subtle dividers between field groups */
.field-divider {
  height: 1px;
  background-color: var(--color-border-subtle, #edf2f7);
  margin: 16px 0;
}

/* Centered red submit button */
.modal-actions-center {
  display: flex;
  justify-content: center;
  margin-top: 4px;
}

.btn-submit-red {
  min-width: 140px;
  padding: 10px 24px;
  font-weight: 600;
  border-radius: var(--radius-sm, 6px);
}

.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-radius: 50%;
  border-top-color: #ffffff;
  animation: spin 0.7s linear infinite;
  margin-inline-end: 6px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 540px) {
  .field-group.side-by-side {
    grid-template-columns: 1fr;
  }

  .modal-card {
    padding: 20px 16px;
  }
}
</style>
