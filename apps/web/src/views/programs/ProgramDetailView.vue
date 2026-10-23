<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { MeasurementMethod, ProgramDetail, StaffOption, TargetSummary, TrialResult } from '@abapro/shared';
import { clientAssigneesRequest, fileToBase64 } from '@/api/clients';
import { assignProgramTherapistRequest, programRequest, recordObservationRequest, reorderTargetsRequest, saveTargetRequest, uploadProgramDocumentRequest, type TargetBody } from '@/api/programs';
import { ApiError } from '@/api/client';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTextarea from '@/components/ui/AppTextarea.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import FileUpload from '@/components/ui/FileUpload.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';

const MEASUREMENTS = [
  { value: 'trial', label: 'Trial by trial' },
  { value: 'probe', label: 'Probe' },
  { value: 'frequency', label: 'Frequency' },
  { value: 'duration', label: 'Duration' },
  { value: 'abc', label: 'ABC' },
];
const RESULTS: Array<{ value: TrialResult; label: string }> = [
  { value: 'correct', label: 'Correct' },
  { value: 'incorrect', label: 'Incorrect' },
  { value: 'prompted', label: 'Prompted' },
  { value: 'no_response', label: 'No response' },
];

function measurementLabel(method: MeasurementMethod): string {
  return { trial: 'Trial by trial', probe: 'Probe', frequency: 'Frequency', duration: 'Duration', abc: 'ABC' }[method];
}

const auth = useAuthStore();
const toast = useToastStore();
const route = useRoute();
const router = useRouter();
const programId = computed(() => String(route.params.programId ?? ''));
const loading = ref(true);
const error = ref('');
const program = ref<ProgramDetail | null>(null);
const staff = ref<StaffOption[]>([]);
const therapistId = ref('');
const showTarget = ref(false);
const target = ref<TargetBody>(blankTarget());
const editingId = ref('');
const sessionTargetId = ref('');
const trials = ref<TrialResult[]>([]);
const frequencyCount = ref('');
const durationSeconds = ref('');
const antecedent = ref('');
const behaviorNote = ref('');
const consequence = ref('');
const observationNote = ref('');
const files = ref<File[]>([]);

function blankTarget(): TargetBody {
  return { title: '', measurementMethod: 'frequency', status: 'active', phase: 'baseline' };
}

const sessionTarget = computed(() => program.value?.targets.find((item) => item.id === sessionTargetId.value));
const trialCount = computed(() => sessionTarget.value?.expectedTrialCount ?? 0);

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    program.value = await programRequest(programId.value);
    if (auth.can('assignments.manage')) staff.value = await clientAssigneesRequest();
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'The program could not be loaded.';
  } finally {
    loading.value = false;
  }
}

function openTarget(existing?: TargetSummary): void {
  editingId.value = existing?.id ?? '';
  target.value = existing
    ? {
        title: existing.title,
        description: existing.description,
        operationalDefinition: existing.operationalDefinition,
        measurementMethod: existing.measurementMethod,
        expectedTrialCount: existing.expectedTrialCount ?? undefined,
        baselineNote: existing.baselineNote,
        teachingInstructions: existing.teachingInstructions,
        promptHierarchy: existing.promptHierarchy,
        masteryCriteria: existing.masteryCriteria,
        phase: existing.phase,
        status: existing.status,
        startedOn: existing.startedOn ?? undefined,
        reviewOn: existing.reviewOn ?? undefined,
        clinicalNotes: existing.clinicalNotes,
      }
    : blankTarget();
  showTarget.value = true;
}

async function saveTarget(): Promise<void> {
  if (!program.value) return;
  try {
    program.value = await saveTargetRequest(program.value.id, {
      ...target.value,
      expectedTrialCount: target.value.measurementMethod === 'trial' || target.value.measurementMethod === 'probe' ? Number(target.value.expectedTrialCount) : undefined,
    }, editingId.value || undefined);
    showTarget.value = false;
    toast.push({ tone: 'success', title: editingId.value ? 'Target updated' : 'Target added', message: 'The measurement configuration is saved with this target.' });
  } catch (saveError) {
    toast.push({ tone: 'danger', title: 'Target was not saved', message: saveError instanceof ApiError ? saveError.message : 'Try again.' });
  }
}

async function move(index: number, direction: -1 | 1): Promise<void> {
  if (!program.value) return;
  const ids = program.value.targets.map((item) => item.id);
  const next = index + direction;
  const current = ids[index];
  const swap = ids[next];
  if (!current || !swap) return;
  ids[index] = swap;
  ids[next] = current;
  program.value = await reorderTargetsRequest(program.value.id, ids);
}

async function assign(): Promise<void> {
  if (!program.value || !therapistId.value) return;
  program.value = await assignProgramTherapistRequest(program.value.id, therapistId.value);
  therapistId.value = '';
  toast.push({ tone: 'success', title: 'Therapist assigned', message: 'The assignment is saved on this program.' });
}

function startSession(item: TargetSummary): void {
  sessionTargetId.value = item.id;
  trials.value = Array.from({ length: item.expectedTrialCount ?? 0 }, () => 'correct');
  frequencyCount.value = '';
  durationSeconds.value = '';
  antecedent.value = '';
  behaviorNote.value = '';
  consequence.value = '';
}

async function record(): Promise<void> {
  if (!program.value || !sessionTarget.value) return;
  try {
    const saved = await recordObservationRequest(program.value.id, sessionTarget.value.id, {
      note: observationNote.value || undefined,
      frequencyCount: sessionTarget.value.measurementMethod === 'frequency' ? Number(frequencyCount.value) : undefined,
      durationSeconds: sessionTarget.value.measurementMethod === 'duration' ? Number(durationSeconds.value) : undefined,
      antecedent: antecedent.value || undefined,
      behaviorNote: behaviorNote.value || undefined,
      consequence: consequence.value || undefined,
      trials: sessionTarget.value.measurementMethod === 'trial' || sessionTarget.value.measurementMethod === 'probe'
        ? trials.value.map((result, index) => ({ trialNumber: index + 1, result }))
        : undefined,
    });
    toast.push({ tone: 'success', title: 'Observation recorded', message: `Saved with configuration version ${saved.configurationVersion}. Phase and status were not changed.` });
    sessionTargetId.value = '';
  } catch (recordError) {
    toast.push({ tone: 'danger', title: 'Observation was not recorded', message: recordError instanceof ApiError ? recordError.message : 'Try again.' });
  }
}

async function upload(): Promise<void> {
  if (!program.value || !files.value[0]) return;
  const file = files.value[0];
  try {
    program.value = await uploadProgramDocumentRequest(program.value.id, {
      fileName: file.name,
      contentType: file.type,
      contentBase64: await fileToBase64(file),
    });
    files.value = [];
    toast.push({ tone: 'success', title: 'Attachment saved', message: 'Scanning is not connected, so the file is marked not scanned.' });
  } catch (uploadError) {
    toast.push({ tone: 'danger', title: 'Attachment was not saved', message: uploadError instanceof ApiError ? uploadError.message : 'Try again.' });
  }
}

onMounted(() => void load());
</script>

<template>
  <PageContainer>
    <SkeletonBlock v-if="loading" height="260px" />
    <ErrorState v-else-if="error || !program" title="Program unavailable" :description="error" @retry="load" />
    <template v-else>
      <PageHeader :title="program.title" :description="program.clientName">
        <template #actions>
          <AppButton variant="secondary" @click="router.push(`/clients/${program.clientId}`)">Client profile</AppButton>
          <AppButton v-if="auth.can('programs.edit')" @click="router.push(`/programs/${program.id}/edit`)">Edit program</AppButton>
        </template>
      </PageHeader>
      <section class="panel stack">
        <div class="meta">
          <StatusBadge :tone="program.status === 'active' ? 'success' : 'neutral'" :label="program.status" />
          <span>{{ measurementLabel(program.measurementType) }}<template v-if="program.expectedTrialCount"> · {{ program.expectedTrialCount }} trials</template></span>
          <span>Version {{ program.configurationVersion }}</span>
        </div>
        <p>{{ program.objective || 'No objective recorded.' }}</p>
        <p>{{ program.teachingProcedure || 'No teaching procedure recorded.' }}</p>
        <p>Mastery criteria: {{ program.masteryCriteria || 'Not recorded.' }} The software does not apply this criterion or change the target phase.</p>
        <p v-if="program.assessmentId"><RouterLink :to="`/assessments/${program.assessmentId}`">Linked assessment</RouterLink></p>
        <p v-for="goal in program.goals" :key="goal.id">Goal: {{ goal.statement }}</p>
      </section>

      <section class="panel stack">
        <div class="heading">
          <h2>Targets</h2>
          <AppButton v-if="auth.can('targets.edit')" type="button" @click="openTarget()">Add target</AppButton>
        </div>
        <article v-for="(item, index) in program.targets" :key="item.id" class="target">
          <strong>{{ item.title }}</strong>
          <p>{{ item.operationalDefinition || item.description || 'No operational definition.' }}</p>
          <p>{{ measurementLabel(item.measurementMethod) }}<template v-if="item.expectedTrialCount"> · {{ item.expectedTrialCount }} trials</template> · {{ item.phase }} · {{ item.status }}</p>
          <p v-if="item.promptHierarchy">Prompts: {{ item.promptHierarchy }}</p>
          <p v-if="item.masteryCriteria">Mastery: {{ item.masteryCriteria }}</p>
          <div class="actions">
            <AppButton v-if="auth.can('targets.edit')" type="button" variant="secondary" :disabled="index === 0" @click="move(index, -1)">Move up</AppButton>
            <AppButton v-if="auth.can('targets.edit')" type="button" variant="secondary" :disabled="index === program.targets.length - 1" @click="move(index, 1)">Move down</AppButton>
            <AppButton v-if="auth.can('targets.edit')" type="button" variant="secondary" @click="openTarget(item)">Edit</AppButton>
            <AppButton v-if="auth.can('observations.record') && item.status === 'active'" type="button" @click="startSession(item)">Record</AppButton>
          </div>
        </article>
      </section>

      <section v-if="showTarget" class="panel stack">
        <h2>{{ editingId ? 'Edit target' : 'New target' }}</h2>
        <div class="grid">
          <AppInput v-model="target.title" label="Title" />
          <AppSelect v-model="target.measurementMethod" label="Measurement method" :options="MEASUREMENTS" />
          <AppInput v-if="target.measurementMethod === 'trial' || target.measurementMethod === 'probe'" :model-value="String(target.expectedTrialCount ?? '')" label="Expected trials" type="number" @update:model-value="target.expectedTrialCount = Number($event)" />
          <AppSelect v-model="target.phase" label="Phase" :options="[{ value: 'baseline', label: 'Baseline' }, { value: 'intervention', label: 'Intervention' }, { value: 'maintenance', label: 'Maintenance' }, { value: 'mastered', label: 'Mastered' }]" />
          <AppSelect v-model="target.status" label="Status" :options="[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'mastered', label: 'Mastered' }, { value: 'discontinued', label: 'Discontinued' }]" />
          <AppInput v-model="target.startedOn" label="Start date" type="date" />
          <AppInput v-model="target.reviewOn" label="Review date" type="date" />
        </div>
        <AppTextarea v-model="target.operationalDefinition" label="Operational definition" :rows="2" />
        <AppTextarea v-model="target.teachingInstructions" label="Teaching instructions" :rows="2" />
        <AppTextarea v-model="target.promptHierarchy" label="Prompt hierarchy" :rows="2" />
        <AppTextarea v-model="target.baselineNote" label="Baseline" :rows="2" />
        <AppTextarea v-model="target.masteryCriteria" label="Mastery criteria" :rows="2" />
        <AppTextarea v-model="target.clinicalNotes" label="Clinical notes" :rows="2" />
        <AppInput v-if="editingId" v-model="target.changeReason" label="Reason for a clinical change" />
        <div class="actions">
          <AppButton type="button" variant="secondary" @click="showTarget = false">Cancel</AppButton>
          <AppButton type="button" @click="saveTarget">Save target</AppButton>
        </div>
      </section>

      <section v-if="sessionTarget" class="panel stack">
        <h2>Session entry · {{ sessionTarget.title }}</h2>
        <p>This records one observation against configuration version {{ sessionTarget.configurationVersion }}. It does not change the phase or status.</p>
        <div v-if="sessionTarget.measurementMethod === 'trial' || sessionTarget.measurementMethod === 'probe'" class="grid">
          <AppSelect v-for="index in trialCount" :key="index" v-model="trials[index - 1]" :label="`Trial ${index}`" :options="RESULTS" />
        </div>
        <AppInput v-else-if="sessionTarget.measurementMethod === 'frequency'" v-model="frequencyCount" label="Count" type="number" />
        <AppInput v-else-if="sessionTarget.measurementMethod === 'duration'" v-model="durationSeconds" label="Duration in seconds" type="number" />
        <template v-else>
          <AppTextarea v-model="antecedent" label="Antecedent" :rows="2" />
          <AppTextarea v-model="behaviorNote" label="Behavior" :rows="2" />
          <AppTextarea v-model="consequence" label="Consequence" :rows="2" />
        </template>
        <AppTextarea v-model="observationNote" label="Note" :rows="2" />
        <AppButton type="button" @click="record">Save observation</AppButton>
      </section>

      <section class="panel stack">
        <h2>Notes and attachments</h2>
        <p>{{ program.notes || 'No program notes.' }}</p>
        <p v-for="document in program.documents" :key="document.id">{{ document.fileName }} · {{ document.scanStatus === 'not_configured' ? 'Not scanned' : 'Rejected' }}</p>
        <FileUpload v-if="auth.can('documents.upload')" v-model="files" label="Attachment" accept="application/pdf,image/png,image/jpeg,image/webp" :max-size-mb="0.5" />
        <AppButton v-if="auth.can('documents.upload')" type="button" :disabled="files.length === 0" @click="upload">Save attachment</AppButton>
      </section>

      <section class="panel stack">
        <h2>Assigned therapists</h2>
        <p v-for="person in program.staff.filter((item) => !item.endedAt)" :key="person.id">{{ person.name }} · {{ person.role }}</p>
        <div v-if="auth.can('assignments.manage')" class="actions">
          <AppSelect v-model="therapistId" label="Therapist" :options="[{ value: '', label: 'Select' }, ...staff.filter((person) => person.role === 'therapist' || person.role === 'clinical_supervisor').map((person) => ({ value: person.id, label: person.name }))]" />
          <AppButton type="button" :disabled="!therapistId" @click="assign">Assign</AppButton>
        </div>
      </section>
    </template>
  </PageContainer>
</template>

<style scoped>
.stack { display: grid; gap: 12px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.heading, .actions, .meta { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.target { border-top: 1px solid var(--color-border); padding-top: 12px; }
h2 { margin: 0; }
</style>
