<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type {
  AssessmentReference,
  AssessmentSummary,
  ClientActivity,
  ClientBehavior,
  ClientDocumentView,
  ClientGoal,
  ClientGuardian,
  ClientProfile,
  ClinicalProfile,
  ContactChannel,
  ProgramSummary,
  StaffOption,
} from '@abapro/shared';
import {
  activityRequest,
  assessmentsRequest as referenceAssessmentsRequest,
  assignClientRequest,
  behaviorsRequest,
  clientAssigneesRequest,
  clientCodeAvailableRequest,
  clientPlacementRequest,
  clientProfileRequest,
  clinicalProfileRequest,
  documentsRequest,
  endAssignmentRequest,
  endGuardianRequest,
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
import { assessmentsRequest, programsRequest } from '@/api/programs';
import AppIcon from '@/components/navigation/AppIcon.vue';
import BehaviorFields from '@/components/clients/BehaviorFields.vue';
import ClientAvatar from '@/components/clients/ClientAvatar.vue';
import GoalFields from '@/components/clients/GoalFields.vue';
import GuardianFields from '@/components/clients/GuardianFields.vue';
import { useClientOptions } from '@/components/clients/options';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTextarea from '@/components/ui/AppTextarea.vue';
import AppTabs from '@/components/ui/AppTabs.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import FileUpload from '@/components/ui/FileUpload.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { careStatusTone, formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { errorMessage, useLoader } from '@/lib/loader';

const auth = useAuthStore();
const toast = useToastStore();
const route = useRoute();
const router = useRouter();
const { t, te } = useI18n();
const { relationshipOptions, measurementOptions, goalStatusOptions, behaviorStatusOptions, clientStatusOptions } = useClientOptions();
const clientId = computed(() => String(route.params.clientId ?? ''));
const profile = ref<ClientProfile | null>(null);
const tab = ref('overview');
const clinical = ref<ClinicalProfile | null>(null);
const behaviors = ref<ClientBehavior[]>([]);
const goals = ref<ClientGoal[]>([]);
const assessments = ref<AssessmentReference[]>([]);
const clinicalAssessments = ref<AssessmentSummary[]>([]);
const programs = ref<ProgramSummary[]>([]);
const documents = ref<ClientDocumentView[]>([]);
const activity = ref<ClientActivity[]>([]);
const staff = ref<StaffOption[]>([]);
const therapistId = ref('');
const supervisorId = ref('');
const files = ref<File[]>([]);
const confirmOpen = ref(false);
const confirmMode = ref<'deactivate' | 'details'>('deactivate');
const loaded = ref(new Set<string>());
const parents = ref<StaffOption[]>([]);
const clinics = ref<Array<{ id: string; name: string }>>([]);
const savingSection = ref('');
const sectionError = ref('');
const editingDetails = ref(false);
const editingMedical = ref(false);
const detailsForm = reactive({
  displayName: '',
  preferredName: '',
  clientCode: '',
  language: '',
  dateOfBirth: '',
  clinicId: '',
  status: 'active' as 'active' | 'inactive',
});
const medicalForm = reactive({
  medicalHistory: '',
  allergies: '',
  precautions: '',
  communicationPreferences: '',
  summary: '',
});
const guardianEditor = ref<GuardianDraft | null>(null);
const behaviorEditor = ref<BehaviorDraft | null>(null);
const goalEditor = ref<GoalDraft | null>(null);

interface GuardianDraft {
  id?: string;
  name: string;
  relationship: ClientGuardian['relationship'];
  email: string;
  phone: string;
  channels: ContactChannel[];
  emergencyContact: boolean;
  portalAccess: boolean;
  linkedUserId: string;
}

interface BehaviorDraft {
  id?: string;
  name: string;
  operationalDefinition: string;
  measurementType: ClientBehavior['measurementType'];
  measurementNotes: string;
  status: ClientBehavior['status'];
}

interface GoalDraft {
  id?: string;
  statement: string;
  objective: string;
  assessmentReference: string;
  reviewOn: string;
  status: ClientGoal['status'];
}

const clientCodePattern = /^[A-Za-z0-9][A-Za-z0-9-]{1,31}$/;

const canEdit = computed(() => auth.can('clients.edit'));
const canSensitive = computed(() => auth.can('clients.sensitive.view'));
const canGuardians = computed(() => auth.can('guardians.manage'));
const canGoals = computed(() => auth.can('programs.edit'));
const activeGuardians = computed(() => profile.value?.guardians.filter((item) => !item.endedAt) ?? []);
const medicalEmpty = computed(() => {
  if (!clinical.value) return true;
  return !clinical.value.medicalHistory && !clinical.value.allergies && !clinical.value.precautions && !clinical.value.communicationPreferences && !clinical.value.summary;
});
const clinicChoices = computed(() => {
  const items = [...clinics.value];
  const current = profile.value;
  if (current?.clinicId && !items.some((clinic) => clinic.id === current.clinicId)) {
    items.unshift({ id: current.clinicId, name: current.clinicName || t('clients.notRecorded') });
  }
  return items.map((clinic) => ({ value: clinic.id, label: clinic.name }));
});
const tabs = computed(() => {
  const ids = ['overview', 'personal'];
  if (auth.can('clients.sensitive.view')) ids.push('medical');
  if (auth.can('assessments.view')) ids.push('assessments');
  if (auth.can('programs.view')) ids.push('programs');
  if (auth.can('documents.download') || auth.can('documents.upload')) ids.push('documents');
  if (auth.can('reports.view')) ids.push('reports');
  if (auth.can('audit.view')) ids.push('activity');
  return ids.map((id) => ({ id, label: t(`clients.profile.tabs.${id}`) }));
});
function when(value: string | null | undefined): string {
  return formatDateTime(value, t('clients.none'));
}

function recorded(value: string | null | undefined): string {
  return value?.trim() ? value : t('clients.notRecorded');
}

function optionLabel(options: Array<{ value: string; label: string }>, value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function sectionMessage(saveError: unknown, fallback: string): string {
  return errorMessage(saveError, fallback);
}

function actionLabel(action: string): string {
  const key = `clients.profile.actions.${action.replace('.', '_')}`;
  return te(key) ? t(key) : action;
}

function names(people: Array<{ name: string }>): string {
  return people.map((person) => person.name).join(', ') || t('clients.none');
}

function relationshipName(relationship: string): string {
  const key = `clients.roles.${relationship}`;
  return te(key) ? t(key) : relationship;
}

async function ensureClinics(): Promise<void> {
  if (!profile.value || clinics.value.length > 0) return;
  const placement = await clientPlacementRequest().catch(() => ({ organizations: [] }));
  clinics.value = placement.organizations.find((item) => item.id === profile.value?.organizationId)?.clinics ?? [];
}

async function ensureParents(): Promise<void> {
  if (!canGuardians.value || parents.value.length > 0) return;
  parents.value = await parentMembersRequest().catch(() => []);
}

async function startDetails(): Promise<void> {
  if (!profile.value) return;
  sectionError.value = '';
  detailsForm.displayName = profile.value.displayName;
  detailsForm.preferredName = profile.value.preferredName ?? '';
  detailsForm.clientCode = profile.value.clientCode;
  detailsForm.language = profile.value.language ?? '';
  detailsForm.dateOfBirth = profile.value.dateOfBirth ?? '';
  detailsForm.clinicId = profile.value.clinicId ?? '';
  detailsForm.status = profile.value.status;
  await ensureClinics();
  editingDetails.value = true;
}

async function saveDetails(confirmed = false): Promise<void> {
  if (!profile.value) return;
  sectionError.value = '';
  await ensureClinics();
  if (detailsForm.displayName.trim().length < 2) {
    sectionError.value = t('clients.validation.displayName');
    return;
  }
  if (clinicChoices.value.length > 0 && !detailsForm.clinicId) {
    sectionError.value = t('clients.validation.clinic');
    return;
  }
  const code = detailsForm.clientCode.trim();
  if (code && !clientCodePattern.test(code)) {
    sectionError.value = t('clients.validation.codeFormat');
    return;
  }
  if (code && code.toLowerCase() !== profile.value.clientCode.toLowerCase()) {
    const result = await clientCodeAvailableRequest(code, profile.value.id, profile.value.organizationId);
    if (!result.available) {
      sectionError.value = t('clients.validation.codeTaken');
      return;
    }
  }
  if (detailsForm.status === 'inactive' && profile.value.status === 'active' && !confirmed) {
    confirmMode.value = 'details';
    confirmOpen.value = true;
    return;
  }
  savingSection.value = 'details';
  try {
    await updateClientRequest(profile.value.id, {
      displayName: detailsForm.displayName.trim(),
      clientCode: code || undefined,
      preferredName: detailsForm.preferredName.trim(),
      language: detailsForm.language.trim(),
      timezone: profile.value.timezone ?? undefined,
      dateOfBirth: canSensitive.value && detailsForm.dateOfBirth ? detailsForm.dateOfBirth : undefined,
      clinicId: detailsForm.clinicId || undefined,
      status: detailsForm.status,
      confirmDeactivation: detailsForm.status === 'inactive' && profile.value.status === 'active' ? true : undefined,
    });
    profile.value = await clientProfileRequest(profile.value.id);
    editingDetails.value = false;
    toast.push({ tone: 'success', title: t('clients.profile.detailsUpdated') });
  } catch (saveError) {
    sectionError.value = sectionMessage(saveError, t('clients.profile.detailsError'));
  } finally {
    savingSection.value = '';
  }
}

async function startMedical(): Promise<void> {
  sectionError.value = '';
  if (!loaded.value.has('medical')) await loadTab('medical');
  medicalForm.medicalHistory = clinical.value?.medicalHistory ?? '';
  medicalForm.allergies = clinical.value?.allergies ?? '';
  medicalForm.precautions = clinical.value?.precautions ?? '';
  medicalForm.communicationPreferences = clinical.value?.communicationPreferences ?? '';
  medicalForm.summary = clinical.value?.summary ?? '';
  editingMedical.value = true;
}

async function saveMedical(): Promise<void> {
  if (!profile.value) return;
  sectionError.value = '';
  savingSection.value = 'medical';
  try {
    clinical.value = await saveClinicalProfileRequest(profile.value.id, { ...medicalForm });
    editingMedical.value = false;
    toast.push({ tone: 'success', title: t('clients.profile.medicalUpdated') });
  } catch (saveError) {
    sectionError.value = sectionMessage(saveError, t('clients.profile.medicalError'));
  } finally {
    savingSection.value = '';
  }
}

async function startGuardian(guardian?: ClientGuardian): Promise<void> {
  sectionError.value = '';
  await ensureParents();
  guardianEditor.value = {
    id: guardian?.id,
    name: guardian?.name ?? '',
    relationship: guardian?.relationship ?? 'parent',
    email: guardian?.email ?? '',
    phone: guardian?.phone ?? '',
    channels: [...(guardian?.channels ?? [])],
    emergencyContact: guardian?.emergencyContact ?? false,
    portalAccess: guardian?.portalAccess ?? false,
    linkedUserId: guardian?.linkedUserId ?? '',
  };
}

async function saveGuardian(): Promise<void> {
  const draft = guardianEditor.value;
  if (!profile.value || !draft) return;
  if (draft.name.trim().length < 2) {
    sectionError.value = t('clients.validation.guardianName');
    return;
  }
  sectionError.value = '';
  savingSection.value = 'guardian';
  try {
    await saveGuardianRequest(profile.value.id, {
      name: draft.name.trim(),
      relationship: draft.relationship,
      email: draft.email.trim() || undefined,
      phone: draft.phone.trim() || undefined,
      channels: draft.channels,
      emergencyContact: draft.emergencyContact,
      portalAccess: draft.portalAccess,
      linkedUserId: draft.linkedUserId || undefined,
    }, draft.id);
    profile.value = await clientProfileRequest(profile.value.id);
    guardianEditor.value = null;
    toast.push({ tone: 'success', title: draft.id ? t('clients.profile.guardianUpdated') : t('clients.profile.guardianAdded') });
  } catch (saveError) {
    sectionError.value = sectionMessage(saveError, t('clients.profile.guardianError'));
  } finally {
    savingSection.value = '';
  }
}

async function endGuardian(guardianId: string): Promise<void> {
  if (!profile.value) return;
  savingSection.value = 'guardian';
  try {
    await endGuardianRequest(profile.value.id, guardianId);
    profile.value = await clientProfileRequest(profile.value.id);
    toast.push({ tone: 'success', title: t('clients.profile.guardianEnded'), message: t('clients.profile.historyKept') });
  } catch (saveError) {
    toast.push({ tone: 'danger', title: t('clients.profile.guardianNotEnded'), message: sectionMessage(saveError, t('errors.generic')) });
  } finally {
    savingSection.value = '';
  }
}

function startBehavior(behavior?: ClientBehavior): void {
  sectionError.value = '';
  behaviorEditor.value = {
    id: behavior?.id,
    name: behavior?.name ?? '',
    operationalDefinition: behavior?.operationalDefinition ?? '',
    measurementType: behavior?.measurementType ?? 'frequency',
    measurementNotes: behavior?.measurementNotes ?? '',
    status: behavior?.status ?? 'active',
  };
}

async function saveBehavior(): Promise<void> {
  const draft = behaviorEditor.value;
  if (!profile.value || !draft) return;
  if (draft.name.trim().length < 2 || draft.operationalDefinition.trim().length < 2) {
    sectionError.value = t('clients.validation.behavior');
    return;
  }
  sectionError.value = '';
  savingSection.value = 'behavior';
  try {
    await saveBehaviorRequest(profile.value.id, {
      name: draft.name.trim(),
      operationalDefinition: draft.operationalDefinition.trim(),
      measurementType: draft.measurementType,
      measurementNotes: draft.measurementNotes.trim() || undefined,
      status: draft.id ? draft.status : undefined,
    }, draft.id);
    behaviors.value = await behaviorsRequest(profile.value.id);
    behaviorEditor.value = null;
    toast.push({ tone: 'success', title: draft.id ? t('clients.profile.behaviorUpdated') : t('clients.profile.behaviorAdded') });
  } catch (saveError) {
    sectionError.value = sectionMessage(saveError, t('clients.profile.behaviorError'));
  } finally {
    savingSection.value = '';
  }
}

function startGoal(goal?: ClientGoal): void {
  sectionError.value = '';
  goalEditor.value = {
    id: goal?.id,
    statement: goal?.statement ?? '',
    objective: goal?.objective ?? '',
    assessmentReference: goal?.assessmentReference ?? '',
    reviewOn: goal?.reviewOn ?? '',
    status: goal?.status ?? 'active',
  };
}

async function saveGoal(): Promise<void> {
  const draft = goalEditor.value;
  if (!profile.value || !draft) return;
  if (draft.statement.trim().length < 2) {
    sectionError.value = t('clients.validation.goal');
    return;
  }
  sectionError.value = '';
  savingSection.value = 'goal';
  try {
    await saveGoalRequest(profile.value.id, {
      statement: draft.statement.trim(),
      objective: draft.objective.trim() || undefined,
      assessmentReference: draft.assessmentReference.trim() || undefined,
      reviewOn: draft.reviewOn || undefined,
      status: draft.id ? draft.status : undefined,
    }, draft.id);
    goals.value = await goalsRequest(profile.value.id);
    goalEditor.value = null;
    toast.push({ tone: 'success', title: draft.id ? t('clients.profile.goalUpdated') : t('clients.profile.goalAdded') });
  } catch (saveError) {
    sectionError.value = sectionMessage(saveError, t('clients.profile.goalError'));
  } finally {
    savingSection.value = '';
  }
}

async function confirmAction(): Promise<void> {
  if (confirmMode.value === 'details') {
    confirmOpen.value = false;
    await saveDetails(true);
    return;
  }
  await deactivate();
}

const { loading, error, load: loadProfile } = useLoader(async () => {
  loaded.value = new Set();
  profile.value = await clientProfileRequest(clientId.value);
  if (auth.can('assignments.manage')) {
    staff.value = await clientAssigneesRequest();
  }
}, t('clients.profile.error'));

async function loadTab(id: string): Promise<void> {
  if (!profile.value || loaded.value.has(id)) return;
  if (id === 'medical' && auth.can('clients.sensitive.view')) clinical.value = await clinicalProfileRequest(clientId.value);
  if (id === 'personal' || id === 'overview') behaviors.value = auth.can('clients.view') ? await behaviorsRequest(clientId.value) : [];
  if (id === 'assessments') {
    clinicalAssessments.value = await assessmentsRequest(clientId.value);
    assessments.value = await referenceAssessmentsRequest(clientId.value);
  }
  if (id === 'programs') {
    if (auth.can('programs.view')) programs.value = await programsRequest(clientId.value);
    if (auth.can('programs.view')) goals.value = await goalsRequest(clientId.value);
  }
  if (id === 'documents') documents.value = await documentsRequest(clientId.value);
  if (id === 'activity') activity.value = await activityRequest(clientId.value);
  loaded.value.add(id);
}

async function deactivate(): Promise<void> {
  if (!profile.value) return;
  confirmOpen.value = false;
  await updateClientRequest(profile.value.id, {
    displayName: profile.value.displayName,
    status: 'inactive',
    confirmDeactivation: true,
  });
  toast.push({ tone: 'success', title: t('clients.deactivated'), message: profile.value.displayName });
  await loadProfile();
}

/** Team members with the matching role who are not already on this client's care team in that role. */
function assignOptions(relationship: 'therapist' | 'supervisor'): Array<{ value: string; label: string }> {
  const role = relationship === 'therapist' ? 'therapist' : 'clinical_supervisor';
  const assigned = new Set(
    (relationship === 'therapist' ? profile.value?.therapists : profile.value?.supervisors)?.map((person) => person.id) ?? [],
  );
  return [
    { value: '', label: t('clients.profile.select') },
    ...staff.value
      .filter((person) => person.role === role && !assigned.has(person.id))
      .map((person) => ({ value: person.id, label: person.name })),
  ];
}

async function assign(relationship: 'therapist' | 'supervisor'): Promise<void> {
  const userId = relationship === 'therapist' ? therapistId.value : supervisorId.value;
  if (!userId || !profile.value) return;
  await assignClientRequest(profile.value.id, userId, relationship);
  therapistId.value = '';
  supervisorId.value = '';
  await loadProfile();
}

async function endAssignment(assignmentId: string): Promise<void> {
  if (!profile.value) return;
  await endAssignmentRequest(profile.value.id, assignmentId);
  toast.push({ tone: 'success', title: t('clients.profile.assignmentEnded'), message: t('clients.profile.historyKept') });
  await loadProfile();
}

async function upload(): Promise<void> {
  if (!profile.value) return;
  for (const file of files.value) {
    await uploadDocumentRequest(profile.value.id, {
      fileName: file.name,
      contentType: file.type,
      contentBase64: await fileToBase64(file),
      category: 'record',
    });
  }
  files.value = [];
  loaded.value.delete('documents');
  await loadTab('documents');
}

watch(tab, (id) => {
  void loadTab(id);
});

watch(clientId, () => {
  tab.value = 'overview';
  void loadProfile();
});

onMounted(async () => {
  await loadProfile();
  await loadTab('overview');
});
</script>

<template>
  <PageContainer>
    <SkeletonBlock v-if="loading" height="280px" />
    <ErrorState v-else-if="error || !profile" :title="t('clients.profile.unavailable')" :description="error || t('clients.profile.notFound')" @retry="loadProfile" />
    <template v-else>
      <PageHeader :title="profile.preferredName || profile.displayName" back-to="/clients" :back-label="t('clients.title')">
        <template #actions>
          <AppButton v-if="canEdit" variant="secondary" icon="edit" @click="router.push(`/clients/${profile.id}/edit`)">{{ t('common.edit') }}</AppButton>
          <AppButton v-if="canEdit && profile.status === 'active'" variant="danger" @click="confirmMode = 'deactivate'; confirmOpen = true">{{ t('clients.deactivate') }}</AppButton>
        </template>
      </PageHeader>

      <!-- Key facts, always visible above the tabs. -->
      <section class="hero" :aria-label="t('clients.profile.details')">
        <ClientAvatar :client-id="profile.id" :initials="profile.initials" :has-avatar="profile.hasAvatar" :name="profile.displayName" :size="64" />
        <div class="hero-main">
          <div class="hero-badges">
            <span class="code-chip">{{ profile.clientCode }}</span>
            <StatusBadge :tone="profile.status === 'active' ? 'success' : 'neutral'" :label="profile.status === 'active' ? t('clients.active') : t('clients.inactive')" />
            <span class="hero-muted">{{ t('clients.profile.activePrograms', profile.activeProgramCount) }}</span>
          </div>
          <p v-if="profile.preferredName" class="hero-muted">{{ profile.displayName }}</p>
        </div>
        <dl class="hero-facts">
          <div>
            <dt>{{ t('clients.fields.clinic') }}</dt>
            <dd>
              {{ recorded(profile.clinicName) }}
              <span v-if="profile.organizationName !== profile.clinicName" class="hero-muted">· {{ profile.organizationName }}</span>
            </dd>
          </div>
          <div>
            <dt>{{ t('clients.profile.therapists') }}</dt>
            <dd>{{ names(profile.therapists) }}</dd>
          </div>
          <div>
            <dt>{{ t('clients.profile.supervisors') }}</dt>
            <dd>{{ names(profile.supervisors) }}</dd>
          </div>
        </dl>
      </section>

      <AppTabs v-model="tab" :tabs="tabs" :label="t('clients.profile.tabsLabel')" />

      <div class="tab-panels">
        <template v-if="tab === 'overview'">
          <section class="settings-card">
            <header class="card-header">
              <h2>{{ t('clients.profile.details') }}</h2>
              <AppButton v-if="canEdit && !editingDetails" type="button" variant="secondary" size="sm" icon="edit" @click="startDetails">{{ t('common.edit') }}</AppButton>
            </header>
            <form v-if="editingDetails" class="form-stack" @submit.prevent="saveDetails()">
              <p v-if="sectionError" class="form-alert" role="alert"><AppIcon name="alert" :size="16" />{{ sectionError }}</p>
              <p class="section-desc">{{ t('clients.fields.organisation') }}: {{ profile.organizationName }}</p>
              <div class="form-grid">
                <AppSelect v-model="detailsForm.clinicId" :label="t('clients.fields.clinic')" :options="clinicChoices" :placeholder="t('clients.fields.chooseClinic')" required />
                <AppInput v-model="detailsForm.displayName" :label="t('clients.fields.displayName')" required />
                <AppInput v-model="detailsForm.preferredName" :label="t('clients.fields.preferredName')" />
                <AppInput v-model="detailsForm.clientCode" :label="t('clients.fields.clientCode')" :hint="t('clients.fields.clientCodeHint')" />
                <AppInput v-model="detailsForm.language" :label="t('clients.fields.language')" />
                <AppInput v-if="canSensitive" v-model="detailsForm.dateOfBirth" :label="t('clients.fields.dateOfBirth')" type="date" />
                <AppSelect v-model="detailsForm.status" :label="t('clients.fields.status')" :options="clientStatusOptions" />
              </div>
              <div class="form-actions">
                <AppButton type="button" variant="secondary" @click="editingDetails = false; sectionError = ''">{{ t('common.cancel') }}</AppButton>
                <AppButton type="submit" :loading="savingSection === 'details'">{{ t('clients.profile.saveDetails') }}</AppButton>
              </div>
            </form>
            <dl v-else class="detail-list">
              <div>
                <dt>{{ t('clients.fields.organisation') }}</dt>
                <dd>{{ profile.organizationName }}</dd>
              </div>
              <div>
                <dt>{{ t('clients.fields.clinic') }}</dt>
                <dd>{{ recorded(profile.clinicName) }}</dd>
              </div>
              <div>
                <dt>{{ t('clients.fields.displayName') }}</dt>
                <dd>{{ profile.displayName }}</dd>
              </div>
              <div v-if="profile.preferredName">
                <dt>{{ t('clients.fields.preferredName') }}</dt>
                <dd>{{ profile.preferredName }}</dd>
              </div>
              <div>
                <dt>{{ t('clients.fields.language') }}</dt>
                <dd>{{ recorded(profile.language) }}</dd>
              </div>
              <div>
                <dt>{{ t('clients.fields.timezone') }}</dt>
                <dd>{{ recorded(profile.timezone || auth.user?.organization?.timezone) }}</dd>
              </div>
              <div v-if="auth.can('clients.sensitive.view')">
                <dt>{{ t('clients.fields.dateOfBirth') }}</dt>
                <dd>{{ formatDate(profile.dateOfBirth, t('clients.notRecorded')) }}</dd>
              </div>
              <div>
                <dt>{{ t('clients.fields.created') }}</dt>
                <dd>{{ when(profile.createdAt) }}</dd>
              </div>
            </dl>
          </section>

          <section class="settings-card">
            <header class="card-header">
              <h2>{{ t('clients.profile.careTeam') }}</h2>
            </header>
            <dl class="detail-list">
              <div>
                <dt>{{ t('clients.profile.therapists') }}</dt>
                <dd>{{ names(profile.therapists) }}</dd>
              </div>
              <div>
                <dt>{{ t('clients.profile.supervisors') }}</dt>
                <dd>{{ names(profile.supervisors) }}</dd>
              </div>
            </dl>
            <div v-if="auth.can('assignments.manage')" class="assign">
              <div class="assign-row">
                <AppSelect v-model="therapistId" :label="t('clients.profile.addTherapist')" :options="assignOptions('therapist')" />
                <AppButton type="button" :disabled="!therapistId" @click="assign('therapist')">{{ t('clients.profile.assignTherapist') }}</AppButton>
              </div>
              <div class="assign-row">
                <AppSelect v-model="supervisorId" :label="t('clients.profile.addSupervisor')" :options="assignOptions('supervisor')" />
                <AppButton type="button" :disabled="!supervisorId" @click="assign('supervisor')">{{ t('clients.profile.assignSupervisor') }}</AppButton>
              </div>
            </div>
            <template v-if="profile.assignments.length">
              <h3 class="subheading">{{ t('clients.profile.history') }}</h3>
              <ul class="record-list">
                <li v-for="assignment in profile.assignments" :key="assignment.id" class="record-card assignment">
                  <div>
                    <strong>{{ assignment.name }}</strong>
                    <p class="record-meta">
                      <span>{{ relationshipName(assignment.relationship) }}</span>
                      <span>{{ assignment.endedAt ? t('clients.profile.endedOn', { date: when(assignment.endedAt) }) : t('clients.profile.current') }}</span>
                    </p>
                  </div>
                  <AppButton
                    v-if="!assignment.endedAt && auth.can('assignments.manage') && assignment.relationship !== 'guardian'"
                    size="sm"
                    variant="ghost"
                    @click="endAssignment(assignment.id)"
                  >
                    {{ t('clients.profile.end') }}
                  </AppButton>
                </li>
              </ul>
            </template>
          </section>
        </template>

        <template v-if="tab === 'personal'">
          <section class="settings-card">
            <header class="card-header">
              <h2>{{ t('clients.profile.guardians') }}</h2>
              <AppButton v-if="canGuardians && !guardianEditor" type="button" variant="secondary" size="sm" icon="plus" @click="startGuardian()">{{ t('clients.profile.addGuardian') }}</AppButton>
            </header>
            <form v-if="guardianEditor && !guardianEditor.id" class="record-card is-editing form-stack" @submit.prevent="saveGuardian">
              <p v-if="sectionError" class="form-alert" role="alert"><AppIcon name="alert" :size="16" />{{ sectionError }}</p>
              <GuardianFields v-model="guardianEditor" :parents="parents" required />
              <div class="form-actions">
                <AppButton type="button" variant="secondary" @click="guardianEditor = null; sectionError = ''">{{ t('common.cancel') }}</AppButton>
                <AppButton type="submit" :loading="savingSection === 'guardian'">{{ t('clients.profile.saveGuardian') }}</AppButton>
              </div>
            </form>
            <EmptyState
              v-if="activeGuardians.length === 0 && !(guardianEditor && !guardianEditor.id)"
              icon="user"
              :title="t('clients.profile.noGuardians')"
              :description="t('clients.profile.noGuardiansHint')"
            />
            <div class="record-list">
              <article v-for="guardian in profile.guardians" :key="guardian.id" class="record-card" :class="{ 'is-editing': guardianEditor?.id === guardian.id }">
                <form v-if="guardianEditor && guardianEditor.id === guardian.id" class="form-stack" @submit.prevent="saveGuardian">
                  <p v-if="sectionError" class="form-alert" role="alert"><AppIcon name="alert" :size="16" />{{ sectionError }}</p>
                  <GuardianFields v-model="guardianEditor" :parents="parents" required />
                  <div class="form-actions">
                    <AppButton type="button" variant="secondary" @click="guardianEditor = null; sectionError = ''">{{ t('common.cancel') }}</AppButton>
                    <AppButton type="submit" :loading="savingSection === 'guardian'">{{ t('clients.profile.saveGuardian') }}</AppButton>
                  </div>
                </form>
                <template v-else>
                  <div class="card-header">
                    <h3>{{ guardian.name }}</h3>
                    <span v-if="canGuardians && !guardian.endedAt" class="inline-actions">
                      <AppButton type="button" size="sm" variant="ghost" @click="startGuardian(guardian)">{{ t('common.edit') }}</AppButton>
                      <AppButton type="button" size="sm" variant="ghost" @click="endGuardian(guardian.id)">{{ t('clients.profile.end') }}</AppButton>
                    </span>
                  </div>
                  <p class="record-meta">
                    <span>{{ optionLabel(relationshipOptions, guardian.relationship) }}</span>
                    <StatusBadge v-if="guardian.endedAt" tone="neutral" :label="t('clients.profile.ended')" />
                    <StatusBadge v-if="guardian.emergencyContact" tone="warning" :label="t('clients.fields.emergencyContact')" />
                  </p>
                  <p class="record-meta">
                    <span>{{ guardian.email || t('clients.profile.noEmail') }}</span>
                    <span>{{ guardian.phone || t('clients.profile.noPhone') }}</span>
                  </p>
                  <p class="record-meta">
                    <span>{{ t('clients.profile.channelsList', { list: guardian.channels.map((channel) => t(`clients.channels.${channel}`)).join(', ') || t('clients.none') }) }}</span>
                    <span v-if="canGuardians">{{ guardian.portalAccess ? t('clients.profile.portalAuthorised') : t('clients.profile.portalNotAuthorised') }}</span>
                  </p>
                </template>
              </article>
            </div>
          </section>

          <section v-if="canEdit || behaviors.length > 0" class="settings-card">
            <header class="card-header">
              <h2>{{ t('clients.profile.behaviors') }}</h2>
              <AppButton v-if="canEdit && !behaviorEditor" type="button" variant="secondary" size="sm" icon="plus" @click="startBehavior()">{{ t('clients.profile.addBehavior') }}</AppButton>
            </header>
            <form v-if="behaviorEditor && !behaviorEditor.id" class="record-card is-editing form-stack" @submit.prevent="saveBehavior">
              <p v-if="sectionError" class="form-alert" role="alert"><AppIcon name="alert" :size="16" />{{ sectionError }}</p>
              <BehaviorFields v-model="behaviorEditor" required />
              <div class="form-actions">
                <AppButton type="button" variant="secondary" @click="behaviorEditor = null; sectionError = ''">{{ t('common.cancel') }}</AppButton>
                <AppButton type="submit" :loading="savingSection === 'behavior'">{{ t('clients.profile.saveBehavior') }}</AppButton>
              </div>
            </form>
            <EmptyState
              v-if="loaded.has('personal') && behaviors.length === 0 && !(behaviorEditor && !behaviorEditor.id)"
              :title="t('clients.profile.noBehaviors')"
              :description="t('clients.profile.noBehaviorsHint')"
            />
            <div class="record-list">
              <article v-for="behavior in behaviors" :key="behavior.id" class="record-card" :class="{ 'is-editing': behaviorEditor?.id === behavior.id }">
                <form v-if="behaviorEditor && behaviorEditor.id === behavior.id" class="form-stack" @submit.prevent="saveBehavior">
                  <p v-if="sectionError" class="form-alert" role="alert"><AppIcon name="alert" :size="16" />{{ sectionError }}</p>
                  <BehaviorFields v-model="behaviorEditor" show-status required />
                  <div class="form-actions">
                    <AppButton type="button" variant="secondary" @click="behaviorEditor = null; sectionError = ''">{{ t('common.cancel') }}</AppButton>
                    <AppButton type="submit" :loading="savingSection === 'behavior'">{{ t('clients.profile.saveBehavior') }}</AppButton>
                  </div>
                </form>
                <template v-else>
                  <div class="card-header">
                    <h3>{{ behavior.name }}</h3>
                    <AppButton v-if="canEdit" type="button" size="sm" variant="ghost" @click="startBehavior(behavior)">{{ t('common.edit') }}</AppButton>
                  </div>
                  <p class="record-meta">
                    <span>{{ optionLabel(measurementOptions, behavior.measurementType) }}</span>
                    <span>{{ optionLabel(behaviorStatusOptions, behavior.status) }}</span>
                  </p>
                  <p>{{ behavior.operationalDefinition }}</p>
                  <p v-if="behavior.measurementNotes" class="record-meta">{{ behavior.measurementNotes }}</p>
                </template>
              </article>
            </div>
          </section>
        </template>

        <section v-if="tab === 'medical'" class="settings-card">
          <header class="card-header">
            <h2>{{ t('clients.profile.medical') }}</h2>
            <AppButton v-if="canEdit && !editingMedical" type="button" variant="secondary" size="sm" :icon="medicalEmpty ? 'plus' : 'edit'" @click="startMedical">
              {{ medicalEmpty ? t('clients.profile.addMedical') : t('common.edit') }}
            </AppButton>
          </header>
          <p class="restricted"><AppIcon name="info" :size="16" />{{ t('clients.profile.restricted') }}</p>
          <form v-if="editingMedical" class="form-stack" @submit.prevent="saveMedical">
            <p v-if="sectionError" class="form-alert" role="alert"><AppIcon name="alert" :size="16" />{{ sectionError }}</p>
            <AppTextarea v-model="medicalForm.medicalHistory" :label="t('clients.fields.medicalHistory')" :rows="3" />
            <div class="form-grid">
              <AppTextarea v-model="medicalForm.allergies" :label="t('clients.fields.allergies')" :rows="2" />
              <AppTextarea v-model="medicalForm.precautions" :label="t('clients.fields.precautions')" :rows="2" />
            </div>
            <AppTextarea v-model="medicalForm.communicationPreferences" :label="t('clients.fields.communicationPreferences')" :rows="2" />
            <AppTextarea v-model="medicalForm.summary" :label="t('clients.fields.otherInformation')" :rows="3" />
            <div class="form-actions">
              <AppButton type="button" variant="secondary" @click="editingMedical = false; sectionError = ''">{{ t('common.cancel') }}</AppButton>
              <AppButton type="submit" :loading="savingSection === 'medical'">{{ t('clients.profile.saveMedical') }}</AppButton>
            </div>
          </form>
          <dl v-else-if="clinical" class="detail-list">
            <div>
              <dt>{{ t('clients.fields.medicalHistoryShort') }}</dt>
              <dd>{{ recorded(clinical.medicalHistory) }}</dd>
            </div>
            <div>
              <dt>{{ t('clients.fields.allergies') }}</dt>
              <dd>{{ recorded(clinical.allergies) }}</dd>
            </div>
            <div>
              <dt>{{ t('clients.fields.precautions') }}</dt>
              <dd>{{ recorded(clinical.precautions) }}</dd>
            </div>
            <div>
              <dt>{{ t('clients.fields.communicationShort') }}</dt>
              <dd>{{ recorded(clinical.communicationPreferences) }}</dd>
            </div>
            <div>
              <dt>{{ t('clients.fields.otherShort') }}</dt>
              <dd>{{ recorded(clinical.summary) }}</dd>
            </div>
          </dl>
        </section>

        <section v-else-if="tab === 'assessments'" class="settings-card">
          <header class="card-header">
            <h2>{{ t('clients.profile.assessments') }}</h2>
            <AppButton v-if="auth.can('assessments.create')" type="button" size="sm" icon="plus" @click="router.push({ path: '/assessments/new', query: { clientId: profile.id } })">
              {{ t('clients.profile.newAssessment') }}
            </AppButton>
          </header>
          <EmptyState
            v-if="clinicalAssessments.length === 0 && assessments.length === 0"
            icon="file"
            :title="t('clients.profile.noAssessments')"
            :description="t('clients.profile.noAssessmentsHint')"
          />
          <div class="record-list">
            <article v-for="item in clinicalAssessments" :key="item.id" class="record-card">
              <RouterLink class="record-link" :to="`/assessments/${item.id}`">{{ item.name }}</RouterLink>
              <p class="record-meta">
                <span>{{ item.assessmentType }}</span>
                <span>{{ formatDate(item.assessedOn, t('clients.profile.noDate')) }}</span>
                <span>{{ item.reviewOn ? t('clients.profile.reviewOn', { date: formatDate(item.reviewOn) }) : t('clients.profile.reviewNotSet') }}</span>
                <span>{{ item.status }}</span>
              </p>
              <p class="record-meta">
                <span>{{ item.clinicianName || t('clients.profile.noClinician') }}</span>
                <span>{{ t('clients.profile.linkedPrograms', item.programCount) }}</span>
              </p>
            </article>
          </div>
          <template v-if="assessments.length">
            <h3 class="subheading">{{ t('clients.profile.earlier') }}</h3>
            <div class="record-list">
              <article v-for="item in assessments" :key="item.id" class="record-card">
                <strong>{{ item.title }}</strong>
                <p class="record-meta">
                  <span>{{ item.instrument || t('clients.profile.noInstrument') }}</span>
                  <span>{{ formatDate(item.completedOn, t('clients.profile.noDate')) }}</span>
                </p>
                <p v-if="item.notes">{{ item.notes }}</p>
              </article>
            </div>
          </template>
        </section>

        <template v-else-if="tab === 'programs'">
          <section class="settings-card">
            <header class="card-header">
              <h2>{{ t('clients.profile.programs') }}</h2>
              <AppButton v-if="auth.can('programs.edit')" type="button" size="sm" icon="plus" @click="router.push({ path: '/programs/new', query: { clientId: profile.id } })">
                {{ t('clients.profile.newProgram') }}
              </AppButton>
            </header>
            <EmptyState v-if="programs.length === 0" icon="programs" :title="t('clients.profile.noPrograms')" :description="t('clients.profile.noProgramsHint')" />
            <ul v-else class="record-list">
              <li v-for="program in programs" :key="program.id" class="record-card program-row">
                <RouterLink class="record-link" :to="`/programs/${program.id}`">{{ program.title }}</RouterLink>
                <span class="record-meta">
                  <StatusBadge :tone="careStatusTone(program.status)" :label="t(`status.${program.status}`)" />
                  <span>{{ t('card.tasks', program.targetCount) }}</span>
                </span>
              </li>
            </ul>
          </section>
          <section class="settings-card">
            <header class="card-header">
              <h2>{{ t('clients.profile.goals') }}</h2>
              <AppButton v-if="canGoals && !goalEditor" type="button" variant="secondary" size="sm" icon="plus" @click="startGoal()">{{ t('clients.profile.addGoal') }}</AppButton>
            </header>
            <form v-if="goalEditor && !goalEditor.id" class="record-card is-editing form-stack" @submit.prevent="saveGoal">
              <p v-if="sectionError" class="form-alert" role="alert"><AppIcon name="alert" :size="16" />{{ sectionError }}</p>
              <GoalFields v-model="goalEditor" />
              <div class="form-actions">
                <AppButton type="button" variant="secondary" @click="goalEditor = null; sectionError = ''">{{ t('common.cancel') }}</AppButton>
                <AppButton type="submit" :loading="savingSection === 'goal'">{{ t('clients.profile.saveGoal') }}</AppButton>
              </div>
            </form>
            <EmptyState
              v-if="loaded.has('programs') && goals.length === 0 && !(goalEditor && !goalEditor.id)"
              :title="t('clients.profile.noGoals')"
              :description="t('clients.profile.noGoalsHint')"
            />
            <div class="record-list">
              <article v-for="goal in goals" :key="goal.id" class="record-card" :class="{ 'is-editing': goalEditor?.id === goal.id }">
                <form v-if="goalEditor && goalEditor.id === goal.id" class="form-stack" @submit.prevent="saveGoal">
                  <p v-if="sectionError" class="form-alert" role="alert"><AppIcon name="alert" :size="16" />{{ sectionError }}</p>
                  <GoalFields v-model="goalEditor" show-status />
                  <div class="form-actions">
                    <AppButton type="button" variant="secondary" @click="goalEditor = null; sectionError = ''">{{ t('common.cancel') }}</AppButton>
                    <AppButton type="submit" :loading="savingSection === 'goal'">{{ t('clients.profile.saveGoal') }}</AppButton>
                  </div>
                </form>
                <template v-else>
                  <div class="card-header">
                    <h3>{{ goal.statement }}</h3>
                    <AppButton v-if="canGoals" type="button" size="sm" variant="ghost" @click="startGoal(goal)">{{ t('common.edit') }}</AppButton>
                  </div>
                  <p v-if="goal.objective">{{ goal.objective }}</p>
                  <p class="record-meta">
                    <span>{{ goal.assessmentReference || t('clients.profile.noReference') }}</span>
                    <span>{{ goal.reviewOn ? t('clients.profile.reviewOn', { date: formatDate(goal.reviewOn) }) : t('clients.profile.reviewNotSet') }}</span>
                    <span>{{ optionLabel(goalStatusOptions, goal.status) }}</span>
                  </p>
                </template>
              </article>
            </div>
          </section>
        </template>

        <section v-else-if="tab === 'documents'" class="settings-card">
          <header class="card-header">
            <h2>{{ t('clients.profile.documents') }}</h2>
          </header>
          <p class="section-desc">{{ t('clients.profile.documentsNote') }}</p>
          <template v-if="auth.can('documents.upload')">
            <FileUpload v-model="files" :label="t('clients.profile.upload')" accept="application/pdf,image/png,image/jpeg,image/webp" multiple :max-size-mb="0.5" />
            <div class="form-actions">
              <AppButton type="button" icon="upload" :disabled="files.length === 0" @click="upload">{{ t('clients.profile.uploadDocuments') }}</AppButton>
            </div>
          </template>
          <EmptyState v-if="documents.length === 0" icon="file" :title="t('clients.profile.noDocuments')" :description="t('clients.profile.noDocumentsHint')" />
          <ul v-else class="record-list">
            <li v-for="document in documents" :key="document.id" class="record-card document-row">
              <AppIcon name="file" />
              <a v-if="auth.can('documents.download')" class="record-link" :href="`/api/v1/clients/${profile.id}/documents/${document.id}`">{{ document.fileName }}</a>
              <span v-else>{{ document.fileName }}</span>
              <span class="record-meta">
                <span>{{ document.category }}</span>
                <span>{{ t('clients.profile.size', { size: formatNumber(Math.max(1, Math.round(document.byteSize / 1024))) }) }}</span>
                <StatusBadge :tone="document.scanStatus === 'not_configured' ? 'neutral' : 'danger'" :label="document.scanStatus === 'not_configured' ? t('clients.profile.notScanned') : t('clients.profile.rejected')" />
              </span>
            </li>
          </ul>
        </section>

        <section v-else-if="tab === 'reports'" class="settings-card">
          <EmptyState icon="file" :title="t('clients.profile.reportsUnavailable')" :description="t('clients.profile.reportsHint')" />
        </section>

        <section v-else-if="tab === 'activity'" class="settings-card">
          <EmptyState v-if="activity.length === 0" :title="t('clients.profile.noActivity')" :description="t('clients.profile.noActivityHint')" />
          <ol v-else class="timeline">
            <li v-for="event in activity" :key="event.id">
              <strong>{{ actionLabel(event.action) }}</strong>
              <span class="record-meta">
                <span>{{ when(event.createdAt) }}</span>
                <span>{{ event.actorName || t('clients.profile.system') }}</span>
              </span>
            </li>
          </ol>
        </section>
      </div>
    </template>
    <ConfirmDialog
      :open="confirmOpen"
      :title="t('clients.deactivateTitle')"
      :message="t('clients.deactivateMessage')"
      tone="danger"
      :confirm-label="t('clients.deactivate')"
      @confirm="confirmAction"
      @cancel="confirmOpen = false"
    />
  </PageContainer>
</template>

<style scoped>
.hero {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-4) var(--space-6);
  padding: var(--space-5) var(--space-6);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
}

.hero-main {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.hero-badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
}

.hero-muted {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.hero-facts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3) var(--space-6);
}

.hero-facts dt {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-weight: 500;
}

.hero-facts dd {
  margin: 2px 0 0;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-ink);
}

.code-chip {
  padding: 2px 10px;
  border-radius: var(--radius-full);
  background: var(--color-primary-soft);
  color: var(--color-primary-ink);
  font-size: var(--text-sm);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.tab-panels {
  display: grid;
  gap: var(--space-5);
}

.subheading {
  font-size: var(--text-base);
  color: var(--color-text-muted);
}

.inline-actions {
  display: flex;
  gap: 4px;
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

.assign {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-4);
}

.assign-row {
  display: flex;
  align-items: flex-end;
  gap: var(--space-3);
}

.assign-row > :first-child {
  flex: 1;
  min-width: 0;
}

.assignment,
.program-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2) var(--space-4);
}

.document-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
}

.document-row .record-meta {
  margin-inline-start: auto;
  align-items: center;
}

.record-link {
  color: var(--color-ink);
  font-weight: 600;
  text-decoration: none;
}

.record-link:hover,
.record-link:focus-visible {
  color: var(--color-primary-ink);
  text-decoration: underline;
}

.record-card h3 {
  font-size: var(--text-base);
  overflow-wrap: anywhere;
}

/* Activity history: a vertical line with one point per event. */
.timeline {
  display: grid;
  gap: var(--space-4);
  margin: 0;
  padding: 0 0 0 0;
  padding-inline-start: var(--space-5);
  border-inline-start: 2px solid var(--color-border);
  list-style: none;
}

.timeline li {
  position: relative;
  display: grid;
  gap: 2px;
}

.timeline li::before {
  content: '';
  position: absolute;
  top: 6px;
  inset-inline-start: calc(-1 * var(--space-5) - 6px);
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-surface);
  border: 2px solid var(--color-primary);
}

@media (max-width: 860px) {
  .hero {
    grid-template-columns: auto minmax(0, 1fr);
    padding: var(--space-4);
  }

  .hero-facts {
    grid-column: 1 / -1;
  }
}

@media (max-width: 480px) {
  .assign-row {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
