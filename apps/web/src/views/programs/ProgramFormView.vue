<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { AssessmentSummary, ClientDirectoryItem, MeasurementMethod, StaffOption } from '@abapro/shared';
import { clientAssigneesRequest, clientDirectoryRequest } from '@/api/clients';
import { assessmentsRequest, programRequest, saveProgramRequest, saveProgramTemplateRequest, type TargetBody } from '@/api/programs';
import { ApiError } from '@/api/client';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTextarea from '@/components/ui/AppTextarea.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import { useToastStore } from '@/stores/toast';

const MEASUREMENTS = [
  { value: 'trial', label: 'Trial by trial' },
  { value: 'probe', label: 'Probe' },
  { value: 'frequency', label: 'Frequency' },
  { value: 'duration', label: 'Duration' },
  { value: 'abc', label: 'ABC' },
];

const toast = useToastStore();
const route = useRoute();
const router = useRouter();
const templateMode = computed(() => route.path.includes('/templates'));
const programId = computed(() => (typeof route.params.programId === 'string' ? route.params.programId : ''));
const loading = ref(Boolean(programId.value));
const saving = ref(false);
const error = ref('');
const formError = ref('');
const clients = ref<ClientDirectoryItem[]>([]);
const assessments = ref<AssessmentSummary[]>([]);
const staff = ref<StaffOption[]>([]);
const clientId = ref('');
const title = ref('');
const description = ref('');
const objective = ref('');
const assessmentId = ref('');
const goalStatement = ref('');
const teachingProcedure = ref('');
const startedOn = ref('');
const reviewOn = ref('');
const clinicianId = ref('');
const therapistId = ref('');
const status = ref<'active' | 'paused' | 'completed' | 'discontinued'>('active');
const measurementType = ref<MeasurementMethod>('frequency');
const expectedTrialCount = ref('');
const masteryCriteria = ref('');
const notes = ref('');
const changeReason = ref('');
const originalMeasurement = ref('');
const targets = ref<TargetBody[]>([]);

const needsTrials = computed(() => measurementType.value === 'trial' || measurementType.value === 'probe');

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    clients.value = (await clientDirectoryRequest({ pageSize: 50 })).items;
    staff.value = await clientAssigneesRequest();
    if (typeof route.query.clientId === 'string') clientId.value = route.query.clientId;
    if (programId.value) {
      const program = await programRequest(programId.value);
      clientId.value = program.clientId;
      title.value = program.title;
      description.value = program.description;
      objective.value = program.objective;
      assessmentId.value = program.assessmentId ?? '';
      teachingProcedure.value = program.teachingProcedure;
      startedOn.value = program.startedOn ?? '';
      reviewOn.value = program.reviewOn ?? '';
      clinicianId.value = program.responsibleClinicianId ?? '';
      status.value = program.status;
      measurementType.value = program.measurementType;
      originalMeasurement.value = `${program.measurementType}:${program.expectedTrialCount ?? ''}:${program.masteryCriteria}`;
      expectedTrialCount.value = program.expectedTrialCount ? String(program.expectedTrialCount) : '';
      masteryCriteria.value = program.masteryCriteria;
      notes.value = program.notes;
      goalStatement.value = program.goals[0]?.statement ?? '';
    }
    if (clientId.value) assessments.value = await assessmentsRequest(clientId.value);
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'The program form could not be loaded.';
  } finally {
    loading.value = false;
  }
}

async function onClient(): Promise<void> {
  assessments.value = clientId.value ? await assessmentsRequest(clientId.value) : [];
}

async function save(): Promise<void> {
  formError.value = '';
  saving.value = true;
  try {
    const body = {
      clientId: clientId.value,
      title: title.value.trim(),
      description: description.value,
      objective: objective.value,
      assessmentId: assessmentId.value || undefined,
      goalStatement: goalStatement.value || undefined,
      teachingProcedure: teachingProcedure.value,
      startedOn: startedOn.value || undefined,
      reviewOn: reviewOn.value || undefined,
      responsibleClinicianId: clinicianId.value || undefined,
      therapistIds: therapistId.value ? [therapistId.value] : undefined,
      status: status.value,
      measurementType: measurementType.value,
      expectedTrialCount: needsTrials.value ? Number(expectedTrialCount.value) : undefined,
      masteryCriteria: masteryCriteria.value,
      notes: notes.value,
      changeReason: changeReason.value || undefined,
    };
    if (templateMode.value) {
      await saveProgramTemplateRequest({
        title: body.title,
        description: body.description,
        objective: body.objective,
        teachingProcedure: body.teachingProcedure,
        measurementType: body.measurementType,
        expectedTrialCount: body.expectedTrialCount,
        masteryCriteria: body.masteryCriteria,
        notes: body.notes,
        status: 'active',
        targets: targets.value,
      });
      toast.push({ tone: 'success', title: 'Template saved', message: 'Copy it into a client before using it.' });
      await router.push('/programs');
      return;
    }
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
      :title="templateMode ? 'Program template' : programId ? 'Edit program' : 'New program'"
      description="Measurement and mastery settings are stored with this record. The application does not decide mastery for you."
    />
    <SkeletonBlock v-if="loading" height="240px" />
    <ErrorState v-else-if="error" title="Program form unavailable" :description="error" @retry="load" />
    <form v-else class="stack" @submit.prevent="save">
      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
      <p v-if="programId && originalMeasurement" class="note">Changing measurement, trial count, mastery criteria, or the teaching procedure requires a reason. Earlier observations keep the configuration they were recorded with.</p>
      <section class="panel grid">
        <AppSelect v-if="!templateMode" v-model="clientId" label="Client" :disabled="Boolean(programId)" :options="clients.map((client) => ({ value: client.id, label: client.displayName }))" @update:model-value="onClient" />
        <AppInput v-model="title" label="Title" required />
        <AppSelect v-if="!templateMode" v-model="assessmentId" label="Associated assessment" :options="[{ value: '', label: 'None' }, ...assessments.map((item) => ({ value: item.id, label: item.name }))]" />
        <AppSelect v-model="measurementType" label="Measurement" :options="MEASUREMENTS" />
        <AppInput v-if="needsTrials" v-model="expectedTrialCount" label="Expected trials" type="number" hint="Used to build the session entry. 1 to 30." />
        <AppInput v-if="!templateMode" v-model="startedOn" label="Start date" type="date" />
        <AppInput v-model="reviewOn" label="Review date" type="date" />
        <AppSelect v-if="!templateMode" v-model="status" label="Status" :options="[{ value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }, { value: 'completed', label: 'Completed' }, { value: 'discontinued', label: 'Discontinued' }]" />
        <AppSelect v-if="!templateMode" v-model="clinicianId" label="Responsible clinician" :options="[{ value: '', label: 'Unassigned' }, ...staff.filter((person) => person.role === 'clinical_supervisor').map((person) => ({ value: person.id, label: person.name }))]" />
        <AppSelect v-if="!templateMode && !programId" v-model="therapistId" label="Assigned therapist" :options="[{ value: '', label: 'None yet' }, ...staff.filter((person) => person.role === 'therapist' || person.role === 'clinical_supervisor').map((person) => ({ value: person.id, label: person.name }))]" />
      </section>
      <section class="panel stack">
        <AppTextarea v-model="description" label="Description" :rows="3" />
        <AppTextarea v-model="objective" label="Objective" :rows="2" />
        <AppTextarea v-if="!programId" v-model="goalStatement" label="Goal" :rows="2" />
        <AppTextarea v-model="teachingProcedure" label="Teaching procedure" :rows="3" />
        <AppTextarea v-model="masteryCriteria" label="Mastery criteria" :rows="2" hint="Record the criterion. It is not applied automatically." />
        <AppTextarea v-model="notes" label="Notes" :rows="2" />
        <AppInput v-if="programId" v-model="changeReason" label="Reason for a clinical change" />
      </section>
      <section v-if="templateMode" class="panel stack">
        <h2>Template targets</h2>
        <article v-for="(target, index) in targets" :key="index" class="grid">
          <AppInput v-model="target.title" label="Target" />
          <AppSelect v-model="target.measurementMethod" label="Measurement" :options="MEASUREMENTS" />
        </article>
        <AppButton type="button" variant="secondary" @click="targets.push({ title: '', measurementMethod: 'frequency' })">Add template target</AppButton>
      </section>
      <div class="actions">
        <AppButton type="button" variant="secondary" @click="router.push(programId ? `/programs/${programId}` : '/programs')">Cancel</AppButton>
        <AppButton type="submit" :loading="saving">Save</AppButton>
      </div>
    </form>
  </PageContainer>
</template>

<style scoped>
.stack { display: grid; gap: 12px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.actions { display: flex; gap: 12px; }
.note, .form-error { color: var(--color-text-muted); }
.form-error { color: var(--color-danger); }
h2 { margin: 0; }
</style>
