<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ASSESSMENT_TYPE_GROUPS,
  CARE_STATUS_OPTIONS,
  type AssessmentSummary,
  type CareStatus,
  type ClientDirectoryItem,
  type MeasurementProcedure,
  type ProgramWrite,
} from '@abapro/shared';
import { clientDirectoryRequest } from '@/api/clients';
import {
  assessmentsRequest,
  programRequest,
  saveProgramRequest,
} from '@/api/programs';
import { ApiError } from '@/api/client';
import AppButton from '@/components/ui/AppButton.vue';
import AppCombobox from '@/components/ui/AppCombobox.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTextarea from '@/components/ui/AppTextarea.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import { useToastStore } from '@/stores/toast';
import { useLoader } from '@/lib/loader';

const MEASUREMENT_PROCEDURES = [
  { value: 'Probe', label: 'Probe' },
  { value: 'Step by Step', label: 'Step by Step' },
];

const assessmentTypeGroups = ASSESSMENT_TYPE_GROUPS.map((g) => ({
  group: g.group,
  options: g.options.map((opt) => ({ value: opt, label: opt })),
}));

const toast = useToastStore();
const route = useRoute();
const router = useRouter();
const programId = computed(() => (typeof route.params.programId === 'string' ? route.params.programId : ''));
const saving = ref(false);
const formError = ref('');
const clients = ref<ClientDirectoryItem[]>([]);
const assessments = ref<AssessmentSummary[]>([]);

const clientId = ref('');
const title = ref('');
const domain = ref('');
const dateImplemented = ref('');
const dateMastered = ref('');
const assessmentType = ref('');
const sd = ref('');
const masterySteps = ref('');
const errorCorrectionProcedure = ref('');
const teachingMethod = ref('');
const netTeachingIdea = ref('');
const measurementProcedure = ref<MeasurementProcedure>('Probe');
const masteryCriteria = ref('');
const status = ref<CareStatus>('in_treatment');

const description = ref('');
const objective = ref('');
const assessmentId = ref('');
const goalStatement = ref('');
const teachingProcedure = ref('');
const reviewOn = ref('');
const notes = ref('');
const changeReason = ref('');
const originalMeasurement = ref('');

const { loading, error, load } = useLoader(async () => {
  clients.value = (await clientDirectoryRequest({ pageSize: 50 })).items;
  if (typeof route.query.clientId === 'string') clientId.value = route.query.clientId;
  if (programId.value) {
    const program = await programRequest(programId.value);
    clientId.value = program.clientId;
    title.value = program.title;
    domain.value = program.domain || '';
    dateImplemented.value = program.dateImplemented || '';
    dateMastered.value = program.dateMastered || '';
    assessmentType.value = program.assessmentType || '';
    sd.value = program.sd || '';
    masterySteps.value = program.masterySteps || '';
    errorCorrectionProcedure.value = program.errorCorrectionProcedure || '';
    teachingMethod.value = program.teachingMethod || '';
    netTeachingIdea.value = program.netTeachingIdea || '';
    measurementProcedure.value = program.measurementProcedure || (program.measurementType === 'trial' ? 'Step by Step' : 'Probe');
    masteryCriteria.value = program.masteryCriteria || '';
    description.value = program.description;
    objective.value = program.objective;
    assessmentId.value = program.assessmentId ?? '';
    teachingProcedure.value = program.teachingProcedure;
    reviewOn.value = program.reviewOn ?? '';
    status.value = program.status;
    originalMeasurement.value = `${measurementProcedure.value}:${program.masteryCriteria}`;
    notes.value = program.notes;
    goalStatement.value = program.goals[0]?.statement ?? '';
  }
  if (clientId.value) assessments.value = await assessmentsRequest(clientId.value);
}, 'The program form could not be loaded.', Boolean(programId.value));

async function onClient(): Promise<void> {
  assessments.value = clientId.value ? await assessmentsRequest(clientId.value) : [];
}

async function save(): Promise<void> {
  formError.value = '';
  saving.value = true;
  try {
    const body: ProgramWrite = {
      clientId: clientId.value,
      title: title.value.trim(),
      domain: domain.value.trim(),
      dateImplemented: dateImplemented.value || undefined,
      dateMastered: dateMastered.value || undefined,
      assessmentType: assessmentType.value || undefined,
      sd: sd.value || undefined,
      masterySteps: masterySteps.value || undefined,
      errorCorrectionProcedure: errorCorrectionProcedure.value || undefined,
      teachingMethod: teachingMethod.value || undefined,
      netTeachingIdea: netTeachingIdea.value || undefined,
      measurementProcedure: measurementProcedure.value,
      masteryCriteria: masteryCriteria.value || undefined,
      description: description.value || undefined,
      objective: objective.value || undefined,
      assessmentId: assessmentId.value || undefined,
      goalStatement: goalStatement.value || undefined,
      teachingProcedure: teachingProcedure.value || undefined,
      reviewOn: reviewOn.value || undefined,
      // New programs start In Treatment. Status changes only from the Edit form.
      status: programId.value ? status.value : undefined,
      measurementType: measurementProcedure.value === 'Step by Step' ? 'trial' : 'probe',
      notes: notes.value || undefined,
      changeReason: changeReason.value || undefined,
    };
    const saved = await saveProgramRequest(body, programId.value || undefined);
    toast.push({ tone: 'success', title: 'Program saved', message: saved.title });
    await router.push(`/programs/${saved.id}`);
  } catch (saveError) {
    formError.value = saveError instanceof ApiError ? saveError.message : 'The program could not be saved.';
  } finally {
    saving.value = false;
  }
}

onMounted(() => void load());
</script>

<template>
  <PageContainer>
    <PageHeader
      :title="programId ? 'Edit program' : 'New program'"
      description="Measurement and mastery settings are stored with this record. The application does not decide mastery for you."
    />
    <SkeletonBlock v-if="loading" height="240px" />
    <ErrorState v-else-if="error" title="Program form unavailable" :description="error" @retry="load" />
    <form v-else class="program-form" @submit.prevent="save">
      <div v-if="formError" class="alert alert-danger" role="alert">
        <p class="form-error">{{ formError }}</p>
      </div>
      <div v-if="programId && originalMeasurement" class="alert alert-info">
        <p class="note">Changing measurement procedure, mastery criteria, or teaching steps requires a reason. Earlier observations keep the configuration they were recorded with.</p>
      </div>

      <section class="form-section">
        <div class="section-header">
          <h2 class="section-title">Program Overview</h2>
          <p class="section-desc">General details, domain, implementation timeline, and assessment grouping</p>
        </div>
        <div class="fields-grid">
          <AppSelect v-model="clientId" label="Client" :disabled="Boolean(programId)" :options="clients.map((client) => ({ value: client.id, label: client.displayName }))" required @update:model-value="onClient" />
          <AppInput v-model="title" label="Program Name" required />
          <AppInput v-model="domain" label="Program Domain" required />
          <AppInput v-model="dateImplemented" label="Date Implemented" type="date" />
          <AppInput v-model="dateMastered" label="Date Mastered" type="date" />
          <AppSelect v-model="assessmentType" label="Assessment Type" :groups="assessmentTypeGroups" placeholder="None" />
          <AppSelect v-if="programId" v-model="status" label="Status" :options="[...CARE_STATUS_OPTIONS]" />
          <AppInput v-model="reviewOn" label="Review date" type="date" />
        </div>
      </section>

      <section class="form-section">
        <div class="section-header">
          <h2 class="section-title">Clinical Protocol & Instructions</h2>
          <p class="section-desc">SD, teaching method, procedures, steps, and measurement protocol</p>
        </div>
        <div class="fields-stack">
          <AppTextarea v-model="sd" label="SD" :rows="2" />
          <AppTextarea v-model="masterySteps" label="Mastery Steps" :rows="2" />
          <AppTextarea v-model="teachingProcedure" label="Teaching Steps" :rows="2" />
          <AppTextarea v-model="errorCorrectionProcedure" label="Error Correction Procedure" :rows="2" />
          <AppTextarea v-model="teachingMethod" label="Teaching Method" :rows="2" />
          <AppTextarea v-model="netTeachingIdea" label="Net Teaching Idea" :rows="2" />
          <AppCombobox v-model="measurementProcedure" label="Measurement Procedure" :options="MEASUREMENT_PROCEDURES" multiline :rows="2" />
          <AppTextarea v-model="masteryCriteria" label="Mastery Criteria" :rows="2" hint="Record the criterion. It is not applied automatically." />
          <AppInput v-if="programId" v-model="changeReason" label="Reason for a clinical change" />
        </div>
      </section>

      <div class="form-actions">
        <AppButton type="button" variant="secondary" @click="router.push(programId ? `/programs/${programId}` : '/programs')">Cancel</AppButton>
        <AppButton type="submit" :loading="saving">Save</AppButton>
      </div>
    </form>
  </PageContainer>
</template>

<style scoped>
.program-form {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.alert {
  padding: 14px 18px;
  border-radius: var(--radius-md);
  font-size: 0.92rem;
  line-height: 1.45;
}

.alert-danger {
  background: var(--color-danger-soft);
  border: 1px solid var(--color-danger);
  color: var(--color-danger);
}

.alert-info {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-inline-start: 4px solid var(--color-primary);
  color: var(--color-ink);
}

.form-error {
  margin: 0;
  color: var(--color-danger);
  font-weight: 600;
}

.note {
  margin: 0;
  color: var(--color-text-muted);
}

.form-section {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-sm);
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section-header {
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 14px;
}

.section-title {
  margin: 0;
  font-size: 1.12rem;
  font-weight: 700;
  color: var(--color-ink);
  letter-spacing: -0.01em;
}

.section-desc {
  margin: 4px 0 0;
  font-size: 0.88rem;
  color: var(--color-text-muted);
}

.fields-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 20px;
  align-items: start;
}

.fields-stack {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  padding: 8px 0 16px;
}

@media (max-width: 640px) {
  .form-section {
    padding: 16px;
    gap: 16px;
  }

  .fields-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .form-actions {
    flex-direction: column-reverse;
  }

  .form-actions > * {
    width: 100%;
  }
}
</style>
