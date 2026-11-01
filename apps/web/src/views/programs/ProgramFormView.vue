<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  ASSESSMENT_TYPE_GROUPS,
  CARE_STATUSES,
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
import AppIcon from '@/components/navigation/AppIcon.vue';
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
import { errorMessage, useLoader } from '@/lib/loader';


const assessmentTypeGroups = ASSESSMENT_TYPE_GROUPS.map((g) => ({
  group: g.group,
  options: g.options.map((opt) => ({ value: opt, label: opt })),
}));

const toast = useToastStore();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
// The combobox stores what is typed, so the standard procedures keep their saved English values.
const measurementProcedures = computed(() => ['Probe', 'Step by Step'].map((value) => ({ value, label: value })));
const statusOptions = computed(() => CARE_STATUSES.map((value) => ({ value, label: t(`status.${value}`) })));
const clientOptions = computed(() => clients.value.map((client) => ({ value: client.id, label: client.displayName })));
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
}, t('programs.form.error'), Boolean(programId.value));

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
    toast.push({ tone: 'success', title: t('programs.form.saved'), message: saved.title });
    await router.push(`/programs/${saved.id}`);
  } catch (saveError) {
    formError.value = errorMessage(saveError, t('programs.form.saveError'));
  } finally {
    saving.value = false;
  }
}

onMounted(() => void load());
</script>

<template>
  <PageContainer>
    <PageHeader
      :title="programId ? t('programs.form.editTitle') : t('programs.form.newTitle')"
      :description="t('programs.form.description')"
      :back-to="programId ? `/programs/${programId}` : '/programs'"
    />
    <SkeletonBlock v-if="loading" height="240px" />
    <ErrorState v-else-if="error" :title="t('programs.form.unavailable')" :description="error" @retry="load" />
    <form v-else class="program-form" @submit.prevent="save">
      <p v-if="formError" class="form-alert" role="alert"><AppIcon name="alert" :size="16" />{{ formError }}</p>
      <p v-if="programId && originalMeasurement" class="form-note"><AppIcon name="info" :size="16" />{{ t('programs.form.changeNote') }}</p>

      <section class="settings-card">
        <div class="section-heading">
          <h2>{{ t('programs.form.overview') }}</h2>
          <p class="section-desc">{{ t('programs.form.overviewHint') }}</p>
        </div>
        <div class="form-grid">
          <AppSelect v-model="clientId" :label="t('programs.form.client')" :disabled="Boolean(programId)" :options="clientOptions" required @update:model-value="onClient" />
          <AppInput v-model="title" :label="t('programs.form.title')" required />
          <AppInput v-model="domain" :label="t('programs.form.domain')" required />
          <AppSelect v-model="assessmentType" :label="t('programs.form.assessmentType')" :groups="assessmentTypeGroups" :placeholder="t('programs.form.none')" />
        </div>
        <div class="form-grid">
          <AppInput v-model="dateImplemented" :label="t('programs.form.implemented')" type="date" />
          <AppInput v-model="dateMastered" :label="t('programs.form.mastered')" type="date" />
          <AppInput v-model="reviewOn" :label="t('programs.form.reviewDate')" type="date" />
          <AppSelect v-if="programId" v-model="status" :label="t('programs.form.status')" :options="statusOptions" />
        </div>
      </section>

      <section class="settings-card">
        <div class="section-heading">
          <h2>{{ t('programs.form.protocol') }}</h2>
          <p class="section-desc">{{ t('programs.form.protocolHint') }}</p>
        </div>
        <div class="form-stack">
          <AppTextarea v-model="sd" :label="t('programs.form.sd')" :rows="2" />
          <div class="form-grid">
            <AppTextarea v-model="teachingProcedure" :label="t('programs.form.teachingSteps')" :rows="3" />
            <AppTextarea v-model="masterySteps" :label="t('programs.form.masterySteps')" :rows="3" />
          </div>
          <div class="form-grid">
            <AppTextarea v-model="teachingMethod" :label="t('programs.form.teachingMethod')" :rows="2" />
            <AppTextarea v-model="errorCorrectionProcedure" :label="t('programs.form.errorCorrection')" :rows="2" />
          </div>
          <AppTextarea v-model="netTeachingIdea" :label="t('programs.form.netIdea')" :rows="2" />
          <div class="form-grid">
            <AppCombobox v-model="measurementProcedure" :label="t('programs.form.procedure')" :options="measurementProcedures" multiline :rows="2" />
            <AppTextarea v-model="masteryCriteria" :label="t('programs.form.masteryCriteria')" :rows="2" :hint="t('programs.form.masteryCriteriaHint')" />
          </div>
          <AppInput v-if="programId" v-model="changeReason" :label="t('programs.form.changeReason')" />
        </div>
      </section>

      <div class="form-actions">
        <AppButton type="button" variant="secondary" @click="router.push(programId ? `/programs/${programId}` : '/programs')">{{ t('common.cancel') }}</AppButton>
        <AppButton type="submit" :loading="saving">{{ t('programs.form.save') }}</AppButton>
      </div>
    </form>
  </PageContainer>
</template>

<style scoped>
.program-form {
  display: grid;
  gap: var(--space-5);
  max-width: 1040px;
}

.form-note {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-info-soft);
  color: var(--color-info);
  font-size: var(--text-sm);
}
</style>
