<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { ClientPlacementOrganization, ClientWrite, ContactChannel, GuardianRelationship, MeasurementType, StaffOption } from '@abapro/shared';
import {
  assignClientRequest,
  behaviorsRequest,
  clientAssigneesRequest,
  clientCodeAvailableRequest,
  clientPlacementRequest,
  clientProfileRequest,
  clinicalProfileRequest,
  createClientRequest,
  fileToBase64,
  goalsRequest,
  parentMembersRequest,
  saveBehaviorRequest,
  saveClinicalProfileRequest,
  saveGoalRequest,
  saveGuardianRequest,
  updateClientRequest,
  uploadDocumentRequest,
} from '@/api/clients';
import { ApiError } from '@/api/client';
import AppIcon from '@/components/navigation/AppIcon.vue';
import BehaviorFields from '@/components/clients/BehaviorFields.vue';
import GoalFields from '@/components/clients/GoalFields.vue';
import GuardianFields from '@/components/clients/GuardianFields.vue';
import { useClientOptions } from '@/components/clients/options';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTextarea from '@/components/ui/AppTextarea.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import FileUpload from '@/components/ui/FileUpload.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import { currentUserRequest, switchOrganizationRequest } from '@/api/resources';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { errorMessage } from '@/lib/loader';

interface GuardianDraft {
  id?: string;
  key: string;
  name: string;
  relationship: GuardianRelationship;
  email: string;
  phone: string;
  channels: ContactChannel[];
  emergencyContact: boolean;
  portalAccess: boolean;
  linkedUserId: string;
}

interface BehaviorDraft {
  id?: string;
  key: string;
  name: string;
  operationalDefinition: string;
  measurementType: MeasurementType;
  measurementNotes: string;
  status: 'active' | 'discontinued';
}

interface GoalDraft {
  id?: string;
  key: string;
  statement: string;
  objective: string;
  assessmentReference: string;
  reviewOn: string;
  status: 'active' | 'met' | 'discontinued';
}

const auth = useAuthStore();
const toast = useToastStore();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { clientStatusOptions } = useClientOptions();
const clientId = computed(() => (typeof route.params.clientId === 'string' ? route.params.clientId : ''));
const editing = computed(() => Boolean(clientId.value));
const loading = ref(editing.value);
const saving = ref(false);
const error = ref('');
const formError = ref('');
const confirmOpen = ref(false);
const files = ref<File[]>([]);
const staff = ref<StaffOption[]>([]);
const parents = ref<StaffOption[]>([]);
const therapistId = ref('');
const supervisorId = ref('');
const placement = ref<ClientPlacementOrganization[]>([]);
const organizationId = ref('');
const clinicId = ref('');
const personal = reactive({
  displayName: '',
  clientCode: '',
  preferredName: '',
  dateOfBirth: '',
  language: '',
  timezone: '',
  status: 'active' as 'active' | 'inactive',
});
const clinical = reactive({
  medicalHistory: '',
  allergies: '',
  precautions: '',
  communicationPreferences: '',
  summary: '',
});
const guardians = ref<GuardianDraft[]>([]);
const behaviors = ref<BehaviorDraft[]>([]);
const goals = ref<GoalDraft[]>([]);
const originalStatus = ref<'active' | 'inactive'>('active');
const stepIndex = ref(0);
const checkingCode = ref(false);
const formEl = ref<HTMLFormElement | null>(null);
const clientCodePattern = /^[A-Za-z0-9][A-Za-z0-9-]{1,31}$/;

const canSensitive = computed(() => auth.can('clients.sensitive.view'));
const canGuardians = computed(() => auth.can('guardians.manage'));
const canBehaviors = computed(() => auth.can('clients.edit'));
const canGoals = computed(() => auth.can('programs.edit'));
const canDocuments = computed(() => auth.can('documents.upload'));
const canAssign = computed(() => auth.can('assignments.manage'));
const steps = computed(() => {
  const ids = ['personal'];
  if (canGuardians.value) ids.push('guardians');
  if (canSensitive.value) ids.push('clinical');
  if (canBehaviors.value) ids.push('behaviors');
  if (canGoals.value) ids.push('goals');
  if (!editing.value && canAssign.value) ids.push('team');
  if (canDocuments.value) ids.push('documents');
  return ids.map((id) => ({ id, label: t(`clients.form.steps.${id}`) }));
});
const currentStep = computed(() => steps.value[Math.min(stepIndex.value, steps.value.length - 1)]?.id ?? 'personal');
const isLastStep = computed(() => stepIndex.value >= steps.value.length - 1);
const submitLabel = computed(() => (editing.value ? t('clients.form.save') : t('clients.form.create')));
const organizationOptions = computed(() => placement.value.map((item) => ({ value: item.id, label: item.name })));
const therapistOptions = computed(() => [
  { value: '', label: t('clients.form.noneYet') },
  ...staff.value.filter((person) => person.role === 'therapist' || person.role === 'clinical_supervisor').map((person) => ({ value: person.id, label: person.name })),
]);
const supervisorOptions = computed(() => [
  { value: '', label: t('clients.form.noneYet') },
  ...staff.value.filter((person) => person.role === 'clinical_supervisor').map((person) => ({ value: person.id, label: person.name })),
]);
const clinicOptions = computed(() => (placement.value.find((item) => item.id === organizationId.value)?.clinics ?? []).map((item) => ({ value: item.id, label: item.name })));

function alignClinic(nextOrganizationId?: string): void {
  const clinics = placement.value.find((item) => item.id === (nextOrganizationId || organizationId.value))?.clinics ?? [];
  if (!clinics.some((clinic) => clinic.id === clinicId.value)) {
    clinicId.value = clinics[0]?.id ?? '';
  }
}

async function personalReady(): Promise<boolean> {
  if (!organizationId.value) {
    formError.value = t('clients.validation.organisation');
    return false;
  }
  if (!clinicId.value) {
    formError.value = t('clients.validation.clinic');
    return false;
  }
  if (personal.displayName.trim().length < 2) {
    formError.value = t('clients.validation.displayName');
    return false;
  }
  const code = personal.clientCode.trim();
  if (!code) return true;
  if (!clientCodePattern.test(code)) {
    formError.value = t('clients.validation.codeFormat');
    return false;
  }
  checkingCode.value = true;
  try {
    const result = await clientCodeAvailableRequest(code, editing.value ? clientId.value : undefined, organizationId.value);
    if (!result.available) {
      formError.value = t('clients.validation.codeTaken');
      return false;
    }
    return true;
  } catch (checkError) {
    formError.value = errorMessage(checkError, t('clients.validation.codeCheck'));
    return false;
  } finally {
    checkingCode.value = false;
  }
}

function revealStep(): void {
  void nextTick(() => formEl.value?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
}

async function continueStep(): Promise<void> {
  formError.value = '';
  if (currentStep.value === 'personal' && !(await personalReady())) return;
  if (stepIndex.value < steps.value.length - 1) stepIndex.value += 1;
  revealStep();
}

async function submitStep(): Promise<void> {
  if (!isLastStep.value) {
    await continueStep();
    return;
  }
  void save();
}

/** Earlier steps can be revisited directly; later ones are reached with Continue, which checks each step. */
function goToStep(index: number): void {
  if (index >= stepIndex.value) return;
  formError.value = '';
  stepIndex.value = index;
  revealStep();
}

function goBack(): void {
  formError.value = '';
  if (stepIndex.value > 0) stepIndex.value -= 1;
  revealStep();
}

function blankGuardian(): GuardianDraft {
  return { key: crypto.randomUUID(), name: '', relationship: 'parent', email: '', phone: '', channels: [], emergencyContact: false, portalAccess: false, linkedUserId: '' };
}

function blankBehavior(): BehaviorDraft {
  return { key: crypto.randomUUID(), name: '', operationalDefinition: '', measurementType: 'frequency', measurementNotes: '', status: 'active' };
}

function blankGoal(): GoalDraft {
  return { key: crypto.randomUUID(), statement: '', objective: '', assessmentReference: '', reviewOn: '', status: 'active' };
}

function removeGuardian(index: number): void {
  const guardian = guardians.value[index];
  if (!guardian || index === 0 || guardian.id) return;
  guardians.value.splice(index, 1);
}

function removeBehavior(index: number): void {
  const behavior = behaviors.value[index];
  if (!behavior || index === 0 || behavior.id) return;
  behaviors.value.splice(index, 1);
}

function removeGoal(index: number): void {
  const goal = goals.value[index];
  if (!goal || index === 0 || goal.id) return;
  goals.value.splice(index, 1);
}

async function load(): Promise<void> {
  if (!editing.value) {
    guardians.value = [blankGuardian()];
    behaviors.value = [blankBehavior()];
    goals.value = [blankGoal()];
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const profile = await clientProfileRequest(clientId.value);
    personal.displayName = profile.displayName;
    personal.clientCode = profile.clientCode;
    personal.preferredName = profile.preferredName ?? '';
    personal.dateOfBirth = profile.dateOfBirth ?? '';
    personal.language = profile.language ?? '';
    personal.timezone = profile.timezone ?? '';
    personal.status = profile.status;
    originalStatus.value = profile.status;
    organizationId.value = profile.organizationId;
    clinicId.value = profile.clinicId ?? '';
    guardians.value = profile.guardians.filter((item) => !item.endedAt).map((item) => ({
      id: item.id,
      name: item.name,
      relationship: item.relationship,
      email: item.email ?? '',
      phone: item.phone ?? '',
      channels: [...item.channels],
      emergencyContact: item.emergencyContact,
      portalAccess: item.portalAccess,
      linkedUserId: item.linkedUserId ?? '',
      key: item.id,
    }));
    if (guardians.value.length === 0) guardians.value = [blankGuardian()];
    if (canBehaviors.value || auth.can('clients.view')) {
      behaviors.value = (await behaviorsRequest(clientId.value)).map((item) => ({ ...item, key: item.id, measurementNotes: item.measurementNotes ?? '' }));
    }
    if (behaviors.value.length === 0) behaviors.value = [blankBehavior()];
    if (canGoals.value || auth.can('programs.view')) {
      goals.value = (await goalsRequest(clientId.value)).map((item) => ({
        id: item.id,
        key: item.id,
        statement: item.statement,
        objective: item.objective ?? '',
        assessmentReference: item.assessmentReference ?? '',
        reviewOn: item.reviewOn ?? '',
        status: item.status,
      }));
    }
    if (goals.value.length === 0) goals.value = [blankGoal()];
    if (canSensitive.value) {
      Object.assign(clinical, await clinicalProfileRequest(clientId.value));
    }
  } catch (loadError) {
    error.value = errorMessage(loadError, t('clients.form.error'));
  } finally {
    loading.value = false;
  }
}

function body(): ClientWrite {
  return {
    displayName: personal.displayName.trim(),
    clientCode: personal.clientCode.trim() || undefined,
    preferredName: personal.preferredName.trim(),
    language: personal.language.trim(),
    timezone: personal.timezone.trim(),
    dateOfBirth: canSensitive.value ? personal.dateOfBirth || undefined : undefined,
    clinicId: clinicId.value || undefined,
    status: editing.value ? personal.status : undefined,
    confirmDeactivation: editing.value && personal.status === 'inactive' && originalStatus.value === 'active' ? true : undefined,
  };
}

async function persist(id: string): Promise<void> {
  if (canSensitive.value) {
    await saveClinicalProfileRequest(id, { ...clinical });
  }
  if (canGuardians.value) {
    for (const guardian of guardians.value.filter((item) => item.name.trim())) {
      await saveGuardianRequest(id, {
        name: guardian.name.trim(),
        relationship: guardian.relationship,
        email: guardian.email.trim() || undefined,
        phone: guardian.phone.trim() || undefined,
        channels: guardian.channels,
        emergencyContact: guardian.emergencyContact,
        portalAccess: guardian.portalAccess,
        linkedUserId: guardian.linkedUserId || undefined,
      }, guardian.id);
    }
  }
  if (canBehaviors.value) {
    for (const behavior of behaviors.value.filter((item) => item.name.trim() && item.operationalDefinition.trim())) {
      await saveBehaviorRequest(id, {
        name: behavior.name.trim(),
        operationalDefinition: behavior.operationalDefinition.trim(),
        measurementType: behavior.measurementType,
        measurementNotes: behavior.measurementNotes.trim() || undefined,
        status: behavior.id ? behavior.status : undefined,
      }, behavior.id);
    }
  }
  if (canGoals.value) {
    for (const goal of goals.value.filter((item) => item.statement.trim())) {
      await saveGoalRequest(id, {
        statement: goal.statement.trim(),
        objective: goal.objective.trim() || undefined,
        assessmentReference: goal.assessmentReference.trim() || undefined,
        reviewOn: goal.reviewOn || undefined,
        status: goal.id ? goal.status : undefined,
      }, goal.id);
    }
  }
  if (canDocuments.value) {
    for (const file of files.value) {
      await uploadDocumentRequest(id, {
        fileName: file.name,
        contentType: file.type,
        contentBase64: await fileToBase64(file),
        category: 'record',
      });
    }
  }
}

async function save(): Promise<void> {
  formError.value = '';
  if (personal.displayName.trim().length < 2) {
    formError.value = t('clients.validation.displayName');
    stepIndex.value = 0;
    return;
  }
  if (editing.value && personal.status === 'inactive' && originalStatus.value === 'active' && !confirmOpen.value) {
    confirmOpen.value = true;
    return;
  }
  confirmOpen.value = false;
  saving.value = true;
  let switchedOrganization = false;
  try {
    if (!editing.value && organizationId.value && organizationId.value !== auth.user?.organization?.id) {
      await switchOrganizationRequest(organizationId.value, clinicId.value);
      switchedOrganization = true;
    }
    const id = editing.value
      ? (await updateClientRequest(clientId.value, body())).id
      : (await createClientRequest(body())).id;
    await persist(id);
    if (!editing.value && canAssign.value && therapistId.value) {
      await assignClientRequest(id, therapistId.value, 'therapist');
    }
    if (!editing.value && canAssign.value && supervisorId.value) {
      await assignClientRequest(id, supervisorId.value, 'supervisor');
    }
    toast.push({ tone: 'success', title: editing.value ? t('clients.form.updated') : t('clients.form.created'), message: personal.displayName.trim() });
    if (switchedOrganization) auth.user = await currentUserRequest();
    await router.push(`/clients/${id}`);
  } catch (saveError) {
    if (switchedOrganization) auth.user = await currentUserRequest().catch(() => auth.user);
    formError.value = errorMessage(saveError, t('clients.form.saveError'));
    if (saveError instanceof ApiError && /identifier|internal client id|organisation|clinic/i.test(saveError.message)) stepIndex.value = 0;
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  placement.value = (await clientPlacementRequest().catch(() => ({ organizations: [] }))).organizations;
  if (canAssign.value) {
    staff.value = await clientAssigneesRequest().catch(() => []);
  }
  if (canGuardians.value) {
    parents.value = await parentMembersRequest().catch(() => []);
  }
  await load();
  if (!editing.value) {
    const activeOrganization = auth.user?.organization?.id ?? '';
    organizationId.value = placement.value.some((item) => item.id === activeOrganization) ? activeOrganization : placement.value[0]?.id ?? '';
    const clinics = placement.value.find((item) => item.id === organizationId.value)?.clinics ?? [];
    const activeClinic = auth.user?.clinic?.id ?? '';
    clinicId.value = clinics.some((clinic) => clinic.id === activeClinic) ? activeClinic : clinics[0]?.id ?? '';
  }
});
</script>

<template>
  <PageContainer>
    <PageHeader
      :title="editing ? t('clients.form.editTitle') : t('clients.form.newTitle')"
      :description="t('clients.form.description')"
      :back-to="editing ? `/clients/${clientId}` : '/clients'"
    />
    <SkeletonBlock v-if="loading" height="280px" />
    <ErrorState v-else-if="error" :title="t('clients.form.unavailable')" :description="error" @retry="load" />
    <div v-else class="client-form">
      <nav class="stepper" :aria-label="t('clients.form.stepsLabel')">
        <ol>
          <li
            v-for="(step, index) in steps"
            :key="step.id"
            :class="{ 'is-current': index === stepIndex, 'is-done': index < stepIndex }"
            :aria-current="index === stepIndex ? 'step' : undefined"
          >
            <button type="button" class="step" :disabled="index >= stepIndex" @click="goToStep(index)">
              <span class="step-number" aria-hidden="true">
                <AppIcon v-if="index < stepIndex" name="check" :size="14" />
                <template v-else>{{ index + 1 }}</template>
              </span>
              <span class="step-label">{{ step.label }}</span>
            </button>
          </li>
        </ol>
      </nav>

      <form ref="formEl" class="settings-card form-card" novalidate @submit.prevent="submitStep">
        <p class="step-count">{{ t('clients.form.stepOf', { n: stepIndex + 1, total: steps.length }) }}</p>
        <p v-if="formError" class="form-alert" role="alert"><AppIcon name="alert" :size="16" />{{ formError }}</p>

        <div v-if="currentStep === 'personal'" class="form-stack">
          <h2>{{ t('clients.form.personal') }}</h2>
          <div class="form-grid">
            <AppSelect
              v-model="organizationId"
              :label="t('clients.fields.organisation')"
              required
              :disabled="editing"
              :options="organizationOptions"
              :placeholder="t('clients.fields.chooseOrganisation')"
              @update:model-value="alignClinic"
            />
            <AppSelect v-model="clinicId" :label="t('clients.fields.clinic')" required :options="clinicOptions" :placeholder="t('clients.fields.chooseClinic')" />
          </div>
          <div class="form-grid">
            <AppInput v-model="personal.displayName" :label="t('clients.fields.displayName')" required />
            <AppInput v-model="personal.preferredName" :label="t('clients.fields.preferredName')" />
            <AppInput v-model="personal.clientCode" :label="t('clients.fields.clientCode')" :hint="t('clients.fields.clientCodeHint')" />
            <AppInput v-model="personal.language" :label="t('clients.fields.language')" />
            <AppInput v-if="canSensitive" v-model="personal.dateOfBirth" :label="t('clients.fields.dateOfBirth')" type="date" />
            <AppSelect v-if="editing" v-model="personal.status" :label="t('clients.fields.status')" :options="clientStatusOptions" />
          </div>
        </div>

        <div v-else-if="currentStep === 'guardians'" class="form-stack">
          <h2>{{ t('clients.form.guardians') }}</h2>
          <article v-for="(guardian, index) in guardians" :key="guardian.id ?? guardian.key" class="record-card">
            <header class="card-header">
              <h3>{{ t('clients.form.guardian', { n: index + 1 }) }}</h3>
              <AppButton v-if="index > 0 && !guardian.id" type="button" variant="ghost" size="sm" icon="close" @click="removeGuardian(index)">{{ t('clients.form.remove') }}</AppButton>
            </header>
            <GuardianFields v-model="guardians[index]" :parents="parents" />
          </article>
          <AppButton type="button" variant="secondary" icon="plus" @click="guardians.push(blankGuardian())">{{ t('clients.profile.addGuardian') }}</AppButton>
        </div>

        <div v-else-if="currentStep === 'clinical'" class="form-stack">
          <h2>{{ t('clients.form.clinical') }}</h2>
          <p class="restricted"><AppIcon name="info" :size="16" />{{ t('clients.form.clinicalNote') }}</p>
          <AppTextarea v-model="clinical.medicalHistory" :label="t('clients.fields.medicalHistory')" :rows="3" />
          <div class="form-grid">
            <AppTextarea v-model="clinical.allergies" :label="t('clients.fields.allergies')" :rows="2" />
            <AppTextarea v-model="clinical.precautions" :label="t('clients.fields.precautions')" :rows="2" />
          </div>
          <AppTextarea v-model="clinical.communicationPreferences" :label="t('clients.fields.communicationPreferences')" :rows="2" />
          <AppTextarea v-model="clinical.summary" :label="t('clients.fields.otherInformation')" :rows="3" />
        </div>

        <div v-else-if="currentStep === 'behaviors'" class="form-stack">
          <h2>{{ t('clients.form.behaviors') }}</h2>
          <p class="section-desc">{{ t('clients.form.behaviorsNote') }}</p>
          <article v-for="(behavior, index) in behaviors" :key="behavior.id ?? behavior.key" class="record-card">
            <header class="card-header">
              <h3>{{ t('clients.form.behavior', { n: index + 1 }) }}</h3>
              <AppButton v-if="index > 0 && !behavior.id" type="button" variant="ghost" size="sm" icon="close" @click="removeBehavior(index)">{{ t('clients.form.remove') }}</AppButton>
            </header>
            <BehaviorFields v-model="behaviors[index]" :show-status="Boolean(behavior.id)" />
          </article>
          <AppButton type="button" variant="secondary" icon="plus" @click="behaviors.push(blankBehavior())">{{ t('clients.profile.addBehavior') }}</AppButton>
        </div>

        <div v-else-if="currentStep === 'goals'" class="form-stack">
          <h2>{{ t('clients.form.goals') }}</h2>
          <article v-for="(goal, index) in goals" :key="goal.id ?? goal.key" class="record-card">
            <header class="card-header">
              <h3>{{ t('clients.form.goal', { n: index + 1 }) }}</h3>
              <AppButton v-if="index > 0 && !goal.id" type="button" variant="ghost" size="sm" icon="close" @click="removeGoal(index)">{{ t('clients.form.remove') }}</AppButton>
            </header>
            <GoalFields v-model="goals[index]" :show-status="Boolean(goal.id)" />
          </article>
          <AppButton type="button" variant="secondary" icon="plus" @click="goals.push(blankGoal())">{{ t('clients.profile.addGoal') }}</AppButton>
        </div>

        <div v-else-if="currentStep === 'team'" class="form-stack">
          <h2>{{ t('clients.form.team') }}</h2>
          <div class="form-grid">
            <AppSelect v-model="therapistId" :label="t('clients.form.assignedTherapist')" :options="therapistOptions" />
            <AppSelect v-model="supervisorId" :label="t('clients.form.clinicalSupervisor')" :options="supervisorOptions" />
          </div>
        </div>

        <div v-else-if="currentStep === 'documents'" class="form-stack">
          <h2>{{ t('clients.form.documents') }}</h2>
          <FileUpload
            v-model="files"
            :label="t('clients.form.careDocuments')"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            multiple
            :max-size-mb="0.5"
            :hint="t('clients.form.documentsHint')"
          />
        </div>

        <div class="form-nav">
          <AppButton v-if="stepIndex > 0" type="button" variant="secondary" icon="arrow-left" @click="goBack">{{ t('clients.form.back') }}</AppButton>
          <AppButton v-if="!isLastStep" type="submit" icon-end="arrow-right" :loading="checkingCode">{{ t('clients.form.continue') }}</AppButton>
          <AppButton v-else type="submit" :loading="saving || checkingCode">{{ submitLabel }}</AppButton>
        </div>
      </form>
    </div>
    <ConfirmDialog
      :open="confirmOpen"
      :title="t('clients.deactivateTitle')"
      :message="t('clients.deactivateMessage')"
      tone="danger"
      :confirm-label="t('clients.deactivate')"
      @confirm="save"
      @cancel="confirmOpen = false"
    />
  </PageContainer>
</template>

<style scoped>
.client-form {
  display: grid;
  gap: var(--space-5);
  max-width: 920px;
}

/* Stepper: numbered steps; completed ones show a check and can be revisited. */
.stepper ol {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.step {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 36px;
  padding: 0 var(--space-3) 0 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: 500;
}

.step:disabled {
  cursor: default;
}

.step-number {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--color-surface-sunken);
  font-size: var(--text-xs);
  font-weight: 700;
}

.is-current .step {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary-ink);
  font-weight: 600;
}

.is-current .step-number,
.is-done .step-number {
  background: var(--color-primary);
  color: #ffffff;
}

.is-done .step {
  color: var(--color-ink);
}

.is-done .step:hover {
  border-color: var(--color-primary);
}

.form-card {
  scroll-margin-top: calc(var(--topbar-height) + 16px);
}

.form-card h2 {
  font-size: var(--text-lg);
}

.step-count {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: 500;
}

.restricted {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-info-soft);
  color: var(--color-info);
  font-size: var(--text-sm);
}

.form-nav {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}

.form-nav > :only-child {
  margin-inline-start: auto;
}
</style>
