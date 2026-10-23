<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ClientPlacementOrganization, ContactChannel, GuardianRelationship, MeasurementType, StaffOption } from '@abapro/shared';
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
  type ClientWriteBody,
} from '@/api/clients';
import { ApiError } from '@/api/client';
import AppButton from '@/components/ui/AppButton.vue';
import AppCheckbox from '@/components/ui/AppCheckbox.vue';
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
const relationshipOptions = [
  { value: 'parent', label: 'Parent' },
  { value: 'guardian', label: 'Guardian' },
  { value: 'grandparent', label: 'Grandparent' },
  { value: 'caregiver', label: 'Caregiver' },
  { value: 'other', label: 'Other' },
];
const measurementOptions = [
  { value: 'frequency', label: 'Frequency' },
  { value: 'duration', label: 'Duration' },
  { value: 'interval', label: 'Interval' },
  { value: 'latency', label: 'Latency' },
  { value: 'rate', label: 'Rate' },
];
const steps = computed(() => {
  const items = [{ id: 'personal', label: 'Personal' }];
  if (canGuardians.value) items.push({ id: 'guardians', label: 'Guardians' });
  if (canSensitive.value) items.push({ id: 'clinical', label: 'Clinical' });
  if (canBehaviors.value) items.push({ id: 'behaviors', label: 'Behaviors' });
  if (canGoals.value) items.push({ id: 'goals', label: 'Goals' });
  if (!editing.value && canAssign.value) items.push({ id: 'team', label: 'Care team' });
  if (canDocuments.value) items.push({ id: 'documents', label: 'Documents' });
  return items;
});
const currentStep = computed(() => steps.value[Math.min(stepIndex.value, steps.value.length - 1)]?.id ?? 'personal');
const isLastStep = computed(() => stepIndex.value >= steps.value.length - 1);
const submitLabel = computed(() => (editing.value ? 'Save client' : 'Create client'));
const organizationOptions = computed(() => placement.value.map((item) => ({ value: item.id, label: item.name })));
const clinicOptions = computed(() => (placement.value.find((item) => item.id === organizationId.value)?.clinics ?? []).map((item) => ({ value: item.id, label: item.name })));

function alignClinic(nextOrganizationId?: string): void {
  const clinics = placement.value.find((item) => item.id === (nextOrganizationId || organizationId.value))?.clinics ?? [];
  if (!clinics.some((clinic) => clinic.id === clinicId.value)) {
    clinicId.value = clinics[0]?.id ?? '';
  }
}

async function personalReady(): Promise<boolean> {
  if (!organizationId.value) {
    formError.value = 'Choose an organisation.';
    return false;
  }
  if (!clinicId.value) {
    formError.value = 'Choose a clinic.';
    return false;
  }
  if (personal.displayName.trim().length < 2) {
    formError.value = 'Enter the display name.';
    return false;
  }
  const code = personal.clientCode.trim();
  if (!code) return true;
  if (!clientCodePattern.test(code)) {
    formError.value = 'Use letters, numbers, and hyphens for the internal client ID.';
    return false;
  }
  checkingCode.value = true;
  try {
    const result = await clientCodeAvailableRequest(code, editing.value ? clientId.value : undefined, organizationId.value);
    if (!result.available) {
      formError.value = 'That internal client ID already exists in your organisation.';
      return false;
    }
    return true;
  } catch (checkError) {
    formError.value = checkError instanceof ApiError ? checkError.message : 'The internal client ID could not be checked.';
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

function toggleChannel(guardian: GuardianDraft, channel: ContactChannel, checked: boolean): void {
  guardian.channels = checked ? [...guardian.channels, channel] : guardian.channels.filter((item) => item !== channel);
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
    error.value = loadError instanceof Error ? loadError.message : 'The client form could not be loaded.';
  } finally {
    loading.value = false;
  }
}

function body(): ClientWriteBody {
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
    formError.value = 'Enter the display name.';
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
    toast.push({ tone: 'success', title: editing.value ? 'Client updated' : 'Client created', message: personal.displayName.trim() });
    if (switchedOrganization) auth.user = await currentUserRequest();
    await router.push(`/clients/${id}`);
  } catch (saveError) {
    if (switchedOrganization) auth.user = await currentUserRequest().catch(() => auth.user);
    formError.value = saveError instanceof ApiError ? saveError.message : 'The client could not be saved.';
    if (/identifier|internal client id|organisation|clinic/i.test(formError.value)) stepIndex.value = 0;
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
      :title="editing ? 'Edit client' : 'New client'"
      description="Personal details, guardians, and the clinical notes your role is allowed to record."
    />
    <SkeletonBlock v-if="loading" height="280px" />
    <ErrorState v-else-if="error" title="Client form unavailable" :description="error" @retry="load" />
    <template v-else>
      <ol class="steps">
        <li v-for="(step, index) in steps" :key="step.id" :class="{ current: currentStep === step.id }">{{ index + 1 }}. {{ step.label }}</li>
      </ol>
      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
      <form ref="formEl" class="panel" @submit.prevent="submitStep">
        <div v-if="currentStep === 'personal'" class="step-fields">
          <h2>Personal information</h2>
          <div class="personal-grid">
            <AppSelect v-model="organizationId" label="Organisation" required :disabled="editing" :options="organizationOptions" placeholder="Choose an organisation" @update:model-value="alignClinic" />
            <AppSelect v-model="clinicId" label="Clinic" required :options="clinicOptions" placeholder="Choose a clinic" />
            <AppInput v-model="personal.displayName" label="Display name" required />
            <AppInput v-model="personal.clientCode" label="Internal client ID" hint="Unique in this organization. Letters, numbers, and hyphens." />
            <AppInput v-model="personal.preferredName" label="Preferred name" />
            <AppInput v-if="canSensitive" v-model="personal.dateOfBirth" label="Date of birth" type="date" />
            <AppInput v-model="personal.language" label="Language" />
            <AppSelect
              v-if="editing"
              v-model="personal.status"
              label="Status"
              :options="[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]"
            />
          </div>
        </div>

        <template v-else-if="currentStep === 'guardians'">
          <h2>Parent and guardian information</h2>
          <article v-for="(guardian, index) in guardians" :key="guardian.id ?? guardian.key" class="repeat">
            <header class="repeat-head">
              <h3>Parent or guardian</h3>
              <AppButton v-if="index > 0 && !guardian.id" type="button" variant="ghost" @click="removeGuardian(index)">Close</AppButton>
            </header>
            <div class="grid">
              <AppInput v-model="guardian.name" label="Name" />
              <AppSelect v-model="guardian.relationship" label="Relationship" :options="relationshipOptions" />
              <AppInput v-model="guardian.email" label="Email" type="email" />
              <AppInput v-model="guardian.phone" label="Phone" />
              <AppSelect
                v-model="guardian.linkedUserId"
                label="Linked parent account"
                :options="[{ value: '', label: 'Not linked' }, ...parents.map((person) => ({ value: person.id, label: `${person.name} (${person.email})` }))]"
              />
            </div>
            <div class="choices">
              <AppCheckbox :model-value="guardian.channels.includes('email')" label="Email updates" @update:model-value="toggleChannel(guardian, 'email', $event)" />
              <AppCheckbox :model-value="guardian.channels.includes('phone')" label="Phone updates" @update:model-value="toggleChannel(guardian, 'phone', $event)" />
              <AppCheckbox :model-value="guardian.channels.includes('portal')" label="Portal messages" @update:model-value="toggleChannel(guardian, 'portal', $event)" />
              <AppCheckbox v-model="guardian.emergencyContact" label="Emergency contact" />
              <AppCheckbox v-model="guardian.portalAccess" label="Authorized for parent portal access" />
            </div>
          </article>
          <AppButton type="button" variant="secondary" block @click="guardians.push(blankGuardian())">Add parent or guardian</AppButton>
        </template>

        <div v-else-if="currentStep === 'clinical'" class="step-fields">
          <h2>Clinical information</h2>
          <p class="note">Restricted to people allowed to view medical and sensitive information.</p>
          <AppTextarea v-model="clinical.medicalHistory" label="Relevant medical history" :rows="3" />
          <AppTextarea v-model="clinical.allergies" label="Allergies" :rows="2" />
          <AppTextarea v-model="clinical.precautions" label="Precautions" :rows="2" />
          <AppTextarea v-model="clinical.communicationPreferences" label="Communication preferences" :rows="2" />
          <AppTextarea v-model="clinical.summary" label="Other clinically necessary information" :rows="3" />
        </div>

        <template v-else-if="currentStep === 'behaviors'">
          <h2>Behavior information</h2>
          <p class="note">Record descriptions and measurement settings only. This form does not generate a diagnosis or a treatment recommendation.</p>
          <article v-for="(behavior, index) in behaviors" :key="behavior.id ?? behavior.key" class="repeat">
            <header class="repeat-head">
              <h3>Behavior</h3>
              <AppButton v-if="index > 0 && !behavior.id" type="button" variant="ghost" @click="removeBehavior(index)">Close</AppButton>
            </header>
            <div class="grid">
              <AppInput v-model="behavior.name" label="Behavior" />
              <AppSelect v-model="behavior.measurementType" label="Measurement" :options="measurementOptions" />
              <AppSelect v-if="behavior.id" v-model="behavior.status" label="Status" :options="[{ value: 'active', label: 'Active' }, { value: 'discontinued', label: 'Discontinued' }]" />
            </div>
            <AppTextarea v-model="behavior.operationalDefinition" label="Operational definition" :rows="3" />
            <AppTextarea v-model="behavior.measurementNotes" label="Measurement notes" :rows="2" />
          </article>
          <AppButton type="button" variant="secondary" block @click="behaviors.push(blankBehavior())">Add behavior</AppButton>
        </template>

        <template v-else-if="currentStep === 'goals'">
          <h2>Goals and needs</h2>
          <article v-for="(goal, index) in goals" :key="goal.id ?? goal.key" class="repeat">
            <header class="repeat-head">
              <h3>Goal</h3>
              <AppButton v-if="index > 0 && !goal.id" type="button" variant="ghost" @click="removeGoal(index)">Close</AppButton>
            </header>
            <AppTextarea v-model="goal.statement" label="Goal" :rows="2" />
            <AppTextarea v-model="goal.objective" label="Objective" :rows="2" />
            <div class="grid">
              <AppInput v-model="goal.assessmentReference" label="Assessment reference" />
              <AppInput v-model="goal.reviewOn" label="Review date" type="date" />
              <AppSelect v-if="goal.id" v-model="goal.status" label="Status" :options="[{ value: 'active', label: 'Active' }, { value: 'met', label: 'Met' }, { value: 'discontinued', label: 'Discontinued' }]" />
            </div>
          </article>
          <AppButton type="button" variant="secondary" block @click="goals.push(blankGoal())">Add goal</AppButton>
        </template>

        <div v-else-if="currentStep === 'team'" class="step-fields">
          <h2>Care team</h2>
          <div class="grid">
            <AppSelect v-model="therapistId" label="Assigned therapist" :options="[{ value: '', label: 'None yet' }, ...staff.filter((person) => person.role === 'therapist' || person.role === 'clinical_supervisor').map((person) => ({ value: person.id, label: person.name }))]" />
            <AppSelect v-model="supervisorId" label="Clinical supervisor" :options="[{ value: '', label: 'None yet' }, ...staff.filter((person) => person.role === 'clinical_supervisor').map((person) => ({ value: person.id, label: person.name }))]" />
          </div>
        </div>

        <div v-else-if="currentStep === 'documents'" class="step-fields">
          <h2>Documents</h2>
          <FileUpload v-model="files" label="Care documents" accept="application/pdf,image/png,image/jpeg,image/webp" multiple :max-size-mb="0.5" hint="PDF or image, up to 512 KB. Files stay private and are not scanned in this environment." />
        </div>

        <AppButton v-if="stepIndex === 0" type="submit" :loading="checkingCode || (isLastStep && saving)">{{ isLastStep ? submitLabel : 'Continue' }}</AppButton>
        <div v-else class="actions">
          <AppButton type="button" variant="secondary" @click="goBack">Back</AppButton>
          <AppButton v-if="!isLastStep" type="submit">Continue</AppButton>
          <AppButton v-else type="submit" :loading="saving">{{ submitLabel }}</AppButton>
        </div>
      </form>
    </template>
    <ConfirmDialog
      :open="confirmOpen"
      title="Deactivate client"
      message="This keeps the clinical history and removes the client from active work. It does not delete the record."
      tone="danger"
      confirm-label="Deactivate"
      @confirm="save"
      @cancel="confirmOpen = false"
    />
  </PageContainer>
</template>

<style scoped>
.steps {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.steps li {
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text-muted);
}

.current {
  border-color: transparent;
  background: var(--color-primary-soft);
  color: var(--color-primary-ink);
  font-weight: 700;
}

.panel {
  display: grid;
  gap: 16px;
  padding: 16px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  scroll-margin-top: calc(var(--topbar-height) + 16px);
}

.step-fields {
  display: grid;
  gap: 16px;
}

.personal-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  align-items: start;
}

.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.grid > * {
  flex: 1 1 220px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: space-between;
}

.repeat {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.repeat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.repeat-head h3 {
  margin: 0;
  font-size: 1rem;
}

.choices {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.note {
  margin: 0;
  color: var(--color-text-muted);
}

.form-error {
  margin: 0;
  color: var(--color-danger);
}

h2 {
  margin: 0;
  font-size: 1.05rem;
}

@media (max-width: 640px) {
  .personal-grid {
    grid-template-columns: 1fr;
  }
}
</style>
