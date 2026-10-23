<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { EChartsCoreOption } from 'echarts/core';
import type {
  AssessmentReference,
  AssessmentSummary,
  ClientActivity,
  ClientBehavior,
  ClientDocumentView,
  ClientGoal,
  ClientGuardian,
  ClientProfile,
  ClientSessionView,
  ClinicalProfile,
  ContactChannel,
  ProgramSummary,
  SessionGraphPoint,
  StaffOption,
} from '@abapro/shared';
import { ApiError } from '@/api/client';
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
  sessionsRequest,
  updateClientRequest,
  uploadDocumentRequest,
} from '@/api/clients';
import { assessmentsRequest, programsRequest } from '@/api/programs';
import AppButton from '@/components/ui/AppButton.vue';
import AppCheckbox from '@/components/ui/AppCheckbox.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTextarea from '@/components/ui/AppTextarea.vue';
import AppTabs from '@/components/ui/AppTabs.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import FileUpload from '@/components/ui/FileUpload.vue';
import GraphContainer from '@/components/ui/GraphContainer.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { formatDateTime } from '@/lib/format';
import { sessionGraphRequest } from '@/api/sessions';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';

const ACTION_LABELS: Record<string, string> = {
  'client.created': 'Client created',
  'client.updated': 'Client updated',
  'client.deactivated': 'Client deactivated',
  'client.reactivated': 'Client reactivated',
  'client.sensitive_updated': 'Sensitive information updated',
  'client.assignment_changed': 'Assignment changed',
  'client.assignment_ended': 'Assignment ended',
  'client.guardian_updated': 'Guardian record updated',
  'client.guardian_ended': 'Guardian record ended',
  'client.behavior_updated': 'Behavior record updated',
  'client.goal_updated': 'Goal updated',
  'client.assessment_recorded': 'Assessment reference added',
  'client.program_updated': 'Program updated',
  'client.document_uploaded': 'Document uploaded',
  'client.avatar_updated': 'Profile image updated',
  'client.record_shared': 'Record shared',
};

const auth = useAuthStore();
const toast = useToastStore();
const route = useRoute();
const router = useRouter();
const clientId = computed(() => String(route.params.clientId ?? ''));
const loading = ref(true);
const error = ref('');
const profile = ref<ClientProfile | null>(null);
const tab = ref('overview');
const clinical = ref<ClinicalProfile | null>(null);
const behaviors = ref<ClientBehavior[]>([]);
const goals = ref<ClientGoal[]>([]);
const assessments = ref<AssessmentReference[]>([]);
const clinicalAssessments = ref<AssessmentSummary[]>([]);
const programs = ref<ProgramSummary[]>([]);
const sessions = ref<ClientSessionView[]>([]);
const graphPoints = ref<SessionGraphPoint[]>([]);
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
const goalStatusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'met', label: 'Met' },
  { value: 'discontinued', label: 'Discontinued' },
];
const clientCodePattern = /^[A-Za-z0-9][A-Za-z0-9-]{1,31}$/;

const timeZone = computed(() => profile.value?.timezone || auth.user?.organization?.timezone || 'UTC');
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
    items.unshift({ id: current.clinicId, name: current.clinicName || 'Current clinic' });
  }
  return items.map((clinic) => ({ value: clinic.id, label: clinic.name }));
});
const tabs = computed(() => {
  const items = [
    { id: 'overview', label: 'Overview' },
    { id: 'personal', label: 'Personal & Guardians' },
  ];
  if (auth.can('clients.sensitive.view')) items.push({ id: 'medical', label: 'Medical Information' });
  if (auth.can('assessments.view')) items.push({ id: 'assessments', label: 'Assessments' });
  if (auth.can('programs.view')) items.push({ id: 'programs', label: 'Programs & Goals' });
  if (auth.can('sessions.view')) items.push({ id: 'sessions', label: 'Sessions' });
  if (auth.can('progress.view') || auth.can('graphs.view')) items.push({ id: 'progress', label: 'Progress & Graphs' });
  if (auth.can('documents.download') || auth.can('documents.upload')) items.push({ id: 'documents', label: 'Documents' });
  if (auth.can('reports.view')) items.push({ id: 'reports', label: 'Reports' });
  if (auth.can('audit.view')) items.push({ id: 'activity', label: 'Activity History' });
  return items;
});
const chart = computed<EChartsCoreOption | null>(() => {
  const trialPoints = graphPoints.value.filter((point) => point.measurementMethod === 'trial' && point.percentCorrect != null);
  const probePoints = graphPoints.value.filter((point) => point.measurementMethod === 'probe' && point.percentCorrect != null);
  if (trialPoints.length > 0 || probePoints.length > 0) {
    const dates = [...new Set([...trialPoints, ...probePoints].map((point) => point.recordedOn))];
    const average = (points: SessionGraphPoint[], date: string) => {
      const matching = points.filter((point) => point.recordedOn === date && point.percentCorrect != null);
      if (matching.length === 0) return null;
      return Math.round(matching.reduce((sum, point) => sum + (point.percentCorrect ?? 0), 0) / matching.length);
    };
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['Teaching trials', 'Probes'] },
      xAxis: { type: 'category', data: dates },
      yAxis: { type: 'value', min: 0, max: 100, name: 'Percent correct' },
      series: [
        { name: 'Teaching trials', type: 'line', data: dates.map((date) => average(trialPoints, date)), itemStyle: { color: '#0e6b62' } },
        { name: 'Probes', type: 'line', data: dates.map((date) => average(probePoints, date)), itemStyle: { color: '#8a5a00' } },
      ],
    };
  }
  if (sessions.value.length === 0) return null;
  const counts = new Map<string, number>();
  for (const item of sessions.value.filter((item) => item.status === 'completed')) {
    const month = formatDateTime(item.startedAt, timeZone.value).slice(0, 8);
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  return {
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: [...counts.keys()] },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{ type: 'bar', data: [...counts.values()], itemStyle: { color: '#0e6b62' } }],
  };
});

function when(value: string | null | undefined): string {
  return value ? formatDateTime(value, timeZone.value) : 'None';
}

function recorded(value: string | null | undefined): string {
  return value?.trim() ? value : 'Not recorded';
}

function optionLabel(options: Array<{ value: string; label: string }>, value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function sectionMessage(saveError: unknown, fallback: string): string {
  return saveError instanceof ApiError ? saveError.message : fallback;
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
    sectionError.value = 'Enter the display name.';
    return;
  }
  if (clinicChoices.value.length > 0 && !detailsForm.clinicId) {
    sectionError.value = 'Choose a clinic.';
    return;
  }
  const code = detailsForm.clientCode.trim();
  if (code && !clientCodePattern.test(code)) {
    sectionError.value = 'Use letters, numbers, and hyphens for the internal client ID.';
    return;
  }
  if (code && code.toLowerCase() !== profile.value.clientCode.toLowerCase()) {
    const result = await clientCodeAvailableRequest(code, profile.value.id, profile.value.organizationId);
    if (!result.available) {
      sectionError.value = 'That internal client ID already exists in your organisation.';
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
    toast.push({ tone: 'success', title: 'Client details updated' });
  } catch (saveError) {
    sectionError.value = sectionMessage(saveError, 'The client details could not be saved.');
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
    toast.push({ tone: 'success', title: 'Medical information updated' });
  } catch (saveError) {
    sectionError.value = sectionMessage(saveError, 'The medical information could not be saved.');
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

function toggleChannel(channel: ContactChannel, checked: boolean): void {
  if (!guardianEditor.value) return;
  const channels = guardianEditor.value.channels;
  guardianEditor.value.channels = checked ? [...channels, channel] : channels.filter((item) => item !== channel);
}

async function saveGuardian(): Promise<void> {
  const draft = guardianEditor.value;
  if (!profile.value || !draft) return;
  if (draft.name.trim().length < 2) {
    sectionError.value = 'Enter the parent or guardian name.';
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
    toast.push({ tone: 'success', title: draft.id ? 'Parent or guardian updated' : 'Parent or guardian added' });
  } catch (saveError) {
    sectionError.value = sectionMessage(saveError, 'The parent or guardian could not be saved.');
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
    toast.push({ tone: 'success', title: 'Parent or guardian ended', message: 'The history is kept.' });
  } catch (saveError) {
    toast.push({ tone: 'danger', title: 'The record could not be ended', message: sectionMessage(saveError, 'Try again.') });
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
    sectionError.value = 'Enter the behavior and an operational definition.';
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
    toast.push({ tone: 'success', title: draft.id ? 'Behavior updated' : 'Behavior added' });
  } catch (saveError) {
    sectionError.value = sectionMessage(saveError, 'The behavior could not be saved.');
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
    sectionError.value = 'Enter the goal.';
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
    toast.push({ tone: 'success', title: draft.id ? 'Goal updated' : 'Goal added' });
  } catch (saveError) {
    sectionError.value = sectionMessage(saveError, 'The goal could not be saved.');
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

async function loadProfile(): Promise<void> {
  loading.value = true;
  error.value = '';
  loaded.value = new Set();
  try {
    profile.value = await clientProfileRequest(clientId.value);
    if (auth.can('assignments.manage')) {
      staff.value = await clientAssigneesRequest();
    }
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'The client profile could not be loaded.';
  } finally {
    loading.value = false;
  }
}

async function loadTab(id: string): Promise<void> {
  if (!profile.value || loaded.value.has(id)) return;
  if (id === 'medical' && auth.can('clients.sensitive.view')) clinical.value = await clinicalProfileRequest(clientId.value);
  if (id === 'personal' || id === 'overview') behaviors.value = auth.can('clients.view') ? await behaviorsRequest(clientId.value) : [];
  if (id === 'assessments') {
    clinicalAssessments.value = await assessmentsRequest(clientId.value);
    assessments.value = await referenceAssessmentsRequest(clientId.value);
  }
  if (id === 'programs' || id === 'progress') {
    if (auth.can('programs.view')) programs.value = await programsRequest(clientId.value);
    if (auth.can('programs.view')) goals.value = await goalsRequest(clientId.value);
    if (auth.can('sessions.view')) sessions.value = await sessionsRequest(clientId.value);
    if (auth.can('graphs.view') || auth.can('reports.view') || auth.can('progress.view')) graphPoints.value = await sessionGraphRequest(clientId.value);
  }
  if (id === 'sessions') sessions.value = await sessionsRequest(clientId.value);
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
  toast.push({ tone: 'success', title: 'Client deactivated', message: profile.value.displayName });
  await loadProfile();
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
  toast.push({ tone: 'success', title: 'Assignment ended', message: 'The history is kept.' });
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
    <ErrorState v-else-if="error || !profile" title="Client unavailable" :description="error || 'That client was not found.'" @retry="loadProfile" />
    <template v-else>
      <PageHeader :title="profile.preferredName || profile.displayName">
        <template #actions>
          <AppButton v-if="canEdit && profile.status === 'active'" variant="danger" @click="confirmMode = 'deactivate'; confirmOpen = true">Deactivate</AppButton>
        </template>
      </PageHeader>
      <div class="identity">
        <span class="code-chip" :title="profile.clientCode">{{ profile.clientCode }}</span>
        <StatusBadge :tone="profile.status === 'active' ? 'success' : 'neutral'" :label="profile.status === 'active' ? 'Active' : 'Inactive'" />
        <span>{{ profile.activeProgramCount }} active programs</span>
        <span>Latest session {{ when(profile.lastSessionAt) }}</span>
      </div>
      <AppTabs v-model="tab" :tabs="tabs" label="Client profile" />

      <section v-if="tab === 'overview'" class="panel">
        <div class="heading">
          <h2>Client details</h2>
          <AppButton v-if="canEdit && !editingDetails" type="button" variant="secondary" @click="startDetails">Edit</AppButton>
        </div>
        <p v-if="editingDetails && sectionError" class="form-error" role="alert">{{ sectionError }}</p>
        <form v-if="editingDetails" class="editor" @submit.prevent="saveDetails()">
          <p class="note">Organisation: {{ profile.organizationName }}</p>
          <div class="editor-grid">
            <AppSelect v-model="detailsForm.clinicId" label="Clinic" :options="clinicChoices" placeholder="Choose a clinic" required />
            <AppInput v-model="detailsForm.displayName" label="Display name" required />
            <AppInput v-model="detailsForm.preferredName" label="Preferred name" />
            <AppInput v-model="detailsForm.clientCode" label="Internal client ID" hint="Unique in this organisation. Letters, numbers, and hyphens." />
            <AppInput v-model="detailsForm.language" label="Language" />
            <AppInput v-if="canSensitive" v-model="detailsForm.dateOfBirth" label="Date of birth" type="date" />
            <AppSelect v-model="detailsForm.status" label="Status" :options="[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]" />
          </div>
          <div class="editor-actions">
            <AppButton type="button" variant="secondary" @click="editingDetails = false; sectionError = ''">Cancel</AppButton>
            <AppButton type="submit" :loading="savingSection === 'details'">Save details</AppButton>
          </div>
        </form>
        <dl v-else class="details">
          <div>
            <dt>Organisation</dt>
            <dd>{{ profile.organizationName }}</dd>
          </div>
          <div>
            <dt>Clinic</dt>
            <dd>{{ recorded(profile.clinicName) }}</dd>
          </div>
          <div>
            <dt>Display name</dt>
            <dd>{{ profile.displayName }}</dd>
          </div>
          <div v-if="profile.preferredName">
            <dt>Preferred name</dt>
            <dd>{{ profile.preferredName }}</dd>
          </div>
          <div>
            <dt>Language</dt>
            <dd>{{ recorded(profile.language) }}</dd>
          </div>
          <div>
            <dt>Time zone</dt>
            <dd>{{ recorded(profile.timezone || auth.user?.organization?.timezone) }}</dd>
          </div>
          <div v-if="auth.can('clients.sensitive.view')">
            <dt>Date of birth</dt>
            <dd>{{ recorded(profile.dateOfBirth) }}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{{ when(profile.createdAt) }}</dd>
          </div>
        </dl>
      </section>
      <section v-if="tab === 'overview'" class="panel">
        <h2>Care team</h2>
        <dl class="details">
          <div>
            <dt>Therapists</dt>
            <dd>{{ profile.therapists.map((person) => person.name).join(', ') || 'None' }}</dd>
          </div>
          <div>
            <dt>Supervisor</dt>
            <dd>{{ profile.supervisor?.name ?? 'None' }}</dd>
          </div>
        </dl>
        <div v-if="auth.can('assignments.manage')" class="assign">
          <AppSelect v-model="therapistId" label="Add therapist" :options="[{ value: '', label: 'Select' }, ...staff.filter((person) => person.role === 'therapist' || person.role === 'clinical_supervisor').map((person) => ({ value: person.id, label: person.name }))]" />
          <AppButton type="button" :disabled="!therapistId" @click="assign('therapist')">Assign therapist</AppButton>
          <AppSelect v-model="supervisorId" label="Add supervisor" :options="[{ value: '', label: 'Select' }, ...staff.filter((person) => person.role === 'clinical_supervisor').map((person) => ({ value: person.id, label: person.name }))]" />
          <AppButton type="button" :disabled="!supervisorId" @click="assign('supervisor')">Assign supervisor</AppButton>
        </div>
        <ul v-if="profile.assignments.length" class="records">
          <li v-for="assignment in profile.assignments" :key="assignment.id">
            <span>{{ assignment.name }} · {{ assignment.relationship }} · {{ assignment.endedAt ? `Ended ${when(assignment.endedAt)}` : 'Current' }}</span>
            <AppButton v-if="!assignment.endedAt && auth.can('assignments.manage') && assignment.relationship !== 'guardian'" size="sm" variant="ghost" @click="endAssignment(assignment.id)">End</AppButton>
          </li>
        </ul>
      </section>

      <section v-if="tab === 'personal'" class="panel">
        <div class="heading">
          <h2>Guardians</h2>
          <AppButton v-if="canGuardians && !guardianEditor" type="button" variant="secondary" @click="startGuardian()">Add parent or guardian</AppButton>
        </div>
        <p v-if="guardianEditor && sectionError" class="form-error" role="alert">{{ sectionError }}</p>
        <form v-if="guardianEditor && !guardianEditor.id" class="record editor" @submit.prevent="saveGuardian">
          <div class="editor-grid">
            <AppInput v-model="guardianEditor.name" label="Name" required />
            <AppSelect v-model="guardianEditor.relationship" label="Relationship" :options="relationshipOptions" />
            <AppInput v-model="guardianEditor.email" label="Email" type="email" />
            <AppInput v-model="guardianEditor.phone" label="Phone" />
            <AppSelect v-model="guardianEditor.linkedUserId" label="Linked parent account" :options="[{ value: '', label: 'Not linked' }, ...parents.map((person) => ({ value: person.id, label: person.email ? `${person.name} (${person.email})` : person.name }))]" />
          </div>
          <div class="choices">
            <AppCheckbox :model-value="guardianEditor.channels.includes('email')" label="Email updates" @update:model-value="toggleChannel('email', Boolean($event))" />
            <AppCheckbox :model-value="guardianEditor.channels.includes('phone')" label="Phone updates" @update:model-value="toggleChannel('phone', Boolean($event))" />
            <AppCheckbox :model-value="guardianEditor.channels.includes('portal')" label="Portal messages" @update:model-value="toggleChannel('portal', Boolean($event))" />
            <AppCheckbox v-model="guardianEditor.emergencyContact" label="Emergency contact" />
            <AppCheckbox v-model="guardianEditor.portalAccess" label="Authorized for parent portal access" />
          </div>
          <div class="editor-actions">
            <AppButton type="button" variant="secondary" @click="guardianEditor = null; sectionError = ''">Cancel</AppButton>
            <AppButton type="submit" :loading="savingSection === 'guardian'">Save parent or guardian</AppButton>
          </div>
        </form>
        <EmptyState v-if="activeGuardians.length === 0 && !(guardianEditor && !guardianEditor.id)" title="No guardians recorded" description="Add a parent or guardian for this client." />
        <article v-for="guardian in profile.guardians" :key="guardian.id" class="record">
          <form v-if="guardianEditor?.id === guardian.id" class="editor" @submit.prevent="saveGuardian">
            <div class="editor-grid">
              <AppInput v-model="guardianEditor.name" label="Name" required />
              <AppSelect v-model="guardianEditor.relationship" label="Relationship" :options="relationshipOptions" />
              <AppInput v-model="guardianEditor.email" label="Email" type="email" />
              <AppInput v-model="guardianEditor.phone" label="Phone" />
              <AppSelect v-model="guardianEditor.linkedUserId" label="Linked parent account" :options="[{ value: '', label: 'Not linked' }, ...parents.map((person) => ({ value: person.id, label: person.email ? `${person.name} (${person.email})` : person.name }))]" />
            </div>
            <div class="choices">
              <AppCheckbox :model-value="guardianEditor.channels.includes('email')" label="Email updates" @update:model-value="toggleChannel('email', Boolean($event))" />
              <AppCheckbox :model-value="guardianEditor.channels.includes('phone')" label="Phone updates" @update:model-value="toggleChannel('phone', Boolean($event))" />
              <AppCheckbox :model-value="guardianEditor.channels.includes('portal')" label="Portal messages" @update:model-value="toggleChannel('portal', Boolean($event))" />
              <AppCheckbox v-model="guardianEditor.emergencyContact" label="Emergency contact" />
              <AppCheckbox v-model="guardianEditor.portalAccess" label="Authorized for parent portal access" />
            </div>
            <div class="editor-actions">
              <AppButton type="button" variant="secondary" @click="guardianEditor = null; sectionError = ''">Cancel</AppButton>
              <AppButton type="submit" :loading="savingSection === 'guardian'">Save parent or guardian</AppButton>
            </div>
          </form>
          <template v-else>
            <div class="heading">
              <strong>{{ guardian.name }}</strong>
              <span v-if="canGuardians && !guardian.endedAt" class="inline-actions">
                <AppButton type="button" size="sm" variant="ghost" @click="startGuardian(guardian)">Edit</AppButton>
                <AppButton type="button" size="sm" variant="ghost" @click="endGuardian(guardian.id)">End</AppButton>
              </span>
            </div>
            <p>{{ optionLabel(relationshipOptions, guardian.relationship) }}<span v-if="guardian.endedAt"> · ended</span><span v-if="guardian.emergencyContact"> · emergency contact</span></p>
            <p>{{ guardian.email || 'No email' }} · {{ guardian.phone || 'No phone' }}</p>
            <p>Channels: {{ guardian.channels.join(', ') || 'None' }}</p>
            <p v-if="canGuardians">Portal access: {{ guardian.portalAccess ? 'Authorized' : 'Not authorized' }}</p>
          </template>
        </article>
      </section>
      <section v-if="tab === 'personal' && (canEdit || behaviors.length > 0)" class="panel">
        <div class="heading">
          <h2>Behaviors</h2>
          <AppButton v-if="canEdit && !behaviorEditor" type="button" variant="secondary" @click="startBehavior()">Add behavior</AppButton>
        </div>
        <p v-if="behaviorEditor && sectionError" class="form-error" role="alert">{{ sectionError }}</p>
        <form v-if="behaviorEditor && !behaviorEditor.id" class="record editor" @submit.prevent="saveBehavior">
          <div class="editor-grid">
            <AppInput v-model="behaviorEditor.name" label="Behavior" required />
            <AppSelect v-model="behaviorEditor.measurementType" label="Measurement" :options="measurementOptions" />
          </div>
          <AppTextarea v-model="behaviorEditor.operationalDefinition" label="Operational definition" :rows="3" />
          <AppTextarea v-model="behaviorEditor.measurementNotes" label="Measurement notes" :rows="2" />
          <div class="editor-actions">
            <AppButton type="button" variant="secondary" @click="behaviorEditor = null; sectionError = ''">Cancel</AppButton>
            <AppButton type="submit" :loading="savingSection === 'behavior'">Save behavior</AppButton>
          </div>
        </form>
        <EmptyState v-if="loaded.has('personal') && behaviors.length === 0 && !(behaviorEditor && !behaviorEditor.id)" title="No behaviors recorded" description="Add a behavior description and how it is measured." />
        <article v-for="behavior in behaviors" :key="behavior.id" class="record">
          <form v-if="behaviorEditor?.id === behavior.id" class="editor" @submit.prevent="saveBehavior">
            <div class="editor-grid">
              <AppInput v-model="behaviorEditor.name" label="Behavior" required />
              <AppSelect v-model="behaviorEditor.measurementType" label="Measurement" :options="measurementOptions" />
              <AppSelect v-model="behaviorEditor.status" label="Status" :options="[{ value: 'active', label: 'Active' }, { value: 'discontinued', label: 'Discontinued' }]" />
            </div>
            <AppTextarea v-model="behaviorEditor.operationalDefinition" label="Operational definition" :rows="3" />
            <AppTextarea v-model="behaviorEditor.measurementNotes" label="Measurement notes" :rows="2" />
            <div class="editor-actions">
              <AppButton type="button" variant="secondary" @click="behaviorEditor = null; sectionError = ''">Cancel</AppButton>
              <AppButton type="submit" :loading="savingSection === 'behavior'">Save behavior</AppButton>
            </div>
          </form>
          <template v-else>
            <div class="heading">
              <strong>{{ behavior.name }}</strong>
              <AppButton v-if="canEdit" type="button" size="sm" variant="ghost" @click="startBehavior(behavior)">Edit</AppButton>
            </div>
            <p>{{ optionLabel(measurementOptions, behavior.measurementType) }} · {{ behavior.status }}</p>
            <p>{{ behavior.operationalDefinition }}</p>
            <p v-if="behavior.measurementNotes">{{ behavior.measurementNotes }}</p>
          </template>
        </article>
      </section>

      <section v-if="tab === 'medical'" class="panel">
        <div class="heading">
          <h2>Medical information</h2>
          <AppButton v-if="canEdit && !editingMedical" type="button" variant="secondary" @click="startMedical">{{ medicalEmpty ? 'Add medical information' : 'Edit' }}</AppButton>
        </div>
        <p v-if="editingMedical && sectionError" class="form-error" role="alert">{{ sectionError }}</p>
        <form v-if="editingMedical" class="editor" @submit.prevent="saveMedical">
          <AppTextarea v-model="medicalForm.medicalHistory" label="Relevant medical history" :rows="3" />
          <AppTextarea v-model="medicalForm.allergies" label="Allergies" :rows="2" />
          <AppTextarea v-model="medicalForm.precautions" label="Precautions" :rows="2" />
          <AppTextarea v-model="medicalForm.communicationPreferences" label="Communication preferences" :rows="2" />
          <AppTextarea v-model="medicalForm.summary" label="Other clinically necessary information" :rows="3" />
          <div class="editor-actions">
            <AppButton type="button" variant="secondary" @click="editingMedical = false; sectionError = ''">Cancel</AppButton>
            <AppButton type="submit" :loading="savingSection === 'medical'">Save medical information</AppButton>
          </div>
        </form>
        <dl v-else-if="clinical" class="details">
          <div>
            <dt>Medical history</dt>
            <dd>{{ recorded(clinical.medicalHistory) }}</dd>
          </div>
          <div>
            <dt>Allergies</dt>
            <dd>{{ recorded(clinical.allergies) }}</dd>
          </div>
          <div>
            <dt>Precautions</dt>
            <dd>{{ recorded(clinical.precautions) }}</dd>
          </div>
          <div>
            <dt>Communication</dt>
            <dd>{{ recorded(clinical.communicationPreferences) }}</dd>
          </div>
          <div>
            <dt>Other information</dt>
            <dd>{{ recorded(clinical.summary) }}</dd>
          </div>
        </dl>
      </section>

      <section v-else-if="tab === 'assessments'" class="panel stack">
        <div class="heading">
          <h2>Assessments</h2>
          <AppButton v-if="auth.can('assessments.create')" type="button" @click="router.push(`/assessments/new?clientId=${profile.id}`)">New assessment</AppButton>
        </div>
        <EmptyState v-if="clinicalAssessments.length === 0 && assessments.length === 0" title="No assessments" description="Create an assessment with items written by the clinic. References already on the client record stay listed below." />
        <article v-for="item in clinicalAssessments" :key="item.id" class="record">
          <RouterLink :to="`/assessments/${item.id}`"><strong>{{ item.name }}</strong></RouterLink>
          <p>{{ item.assessmentType }} · {{ item.assessedOn || 'No date' }} · Review {{ item.reviewOn || 'not set' }} · {{ item.status }}</p>
          <p>{{ item.clinicianName || 'No clinician assigned' }} · {{ item.programCount }} linked programs</p>
        </article>
        <h2 v-if="assessments.length">Earlier references</h2>
        <article v-for="item in assessments" :key="item.id" class="record">
          <strong>{{ item.title }}</strong>
          <p>{{ item.instrument || 'No instrument' }} · {{ item.completedOn || 'No date' }}</p>
          <p>{{ item.notes }}</p>
        </article>
      </section>

      <section v-else-if="tab === 'programs'" class="panel stack">
        <div class="heading">
          <h2>Programs</h2>
          <AppButton v-if="auth.can('programs.edit')" type="button" @click="router.push(`/programs/new?clientId=${profile.id}`)">New program</AppButton>
        </div>
        <EmptyState v-if="programs.length === 0" title="No programs" description="Programs created for this client stay on the record when their status changes." />
        <article v-for="program in programs" :key="program.id" class="record">
          <RouterLink :to="`/programs/${program.id}`"><strong>{{ program.title }}</strong></RouterLink>
          · {{ program.status }} · {{ program.measurementType }} · {{ program.targetCount }} targets
        </article>
        <div class="heading">
          <h2>Client goals</h2>
          <AppButton v-if="canGoals && !goalEditor" type="button" variant="secondary" @click="startGoal()">Add goal</AppButton>
        </div>
        <p v-if="goalEditor && sectionError" class="form-error" role="alert">{{ sectionError }}</p>
        <form v-if="goalEditor && !goalEditor.id" class="record editor" @submit.prevent="saveGoal">
          <AppTextarea v-model="goalEditor.statement" label="Goal" :rows="2" />
          <AppTextarea v-model="goalEditor.objective" label="Objective" :rows="2" />
          <div class="editor-grid">
            <AppInput v-model="goalEditor.assessmentReference" label="Assessment reference" />
            <AppInput v-model="goalEditor.reviewOn" label="Review date" type="date" />
          </div>
          <div class="editor-actions">
            <AppButton type="button" variant="secondary" @click="goalEditor = null; sectionError = ''">Cancel</AppButton>
            <AppButton type="submit" :loading="savingSection === 'goal'">Save goal</AppButton>
          </div>
        </form>
        <EmptyState v-if="loaded.has('programs') && goals.length === 0 && !(goalEditor && !goalEditor.id)" title="No goals recorded" description="Add a goal for this client." />
        <article v-for="goal in goals" :key="goal.id" class="record">
          <form v-if="goalEditor?.id === goal.id" class="editor" @submit.prevent="saveGoal">
            <AppTextarea v-model="goalEditor.statement" label="Goal" :rows="2" />
            <AppTextarea v-model="goalEditor.objective" label="Objective" :rows="2" />
            <div class="editor-grid">
              <AppInput v-model="goalEditor.assessmentReference" label="Assessment reference" />
              <AppInput v-model="goalEditor.reviewOn" label="Review date" type="date" />
              <AppSelect v-model="goalEditor.status" label="Status" :options="goalStatusOptions" />
            </div>
            <div class="editor-actions">
              <AppButton type="button" variant="secondary" @click="goalEditor = null; sectionError = ''">Cancel</AppButton>
              <AppButton type="submit" :loading="savingSection === 'goal'">Save goal</AppButton>
            </div>
          </form>
          <template v-else>
            <div class="heading">
              <strong>{{ goal.statement }}</strong>
              <AppButton v-if="canGoals" type="button" size="sm" variant="ghost" @click="startGoal(goal)">Edit</AppButton>
            </div>
            <p v-if="goal.objective">{{ goal.objective }}</p>
            <p>{{ goal.assessmentReference || 'No assessment reference' }} · Review {{ goal.reviewOn || 'not set' }} · {{ optionLabel(goalStatusOptions, goal.status) }}</p>
          </template>
        </article>
      </section>

      <section v-else-if="tab === 'sessions'" class="panel stack">
        <div class="heading">
          <h2>Sessions</h2>
          <AppButton v-if="auth.can('observations.record')" type="button" @click="router.push(`/sessions?clientId=${profile.id}`)">Collect data</AppButton>
        </div>
        <EmptyState v-if="sessions.length === 0" title="No sessions" description="Sessions started for this client stay here, including a session that was interrupted before it was completed." />
        <ul class="records">
          <li v-for="session in sessions" :key="session.id">
            <RouterLink :to="`/sessions/${session.id}`">{{ when(session.startedAt) }}</RouterLink>
            · {{ session.status }} · {{ session.observationCount }} observations · {{ session.therapistName || 'No therapist' }}
          </li>
        </ul>
      </section>

      <section v-else-if="tab === 'progress'" class="stack">
        <GraphContainer title="Session results" description="Teaching trials and probes from completed sessions. The two are not combined." :option="chart" source-label="Recorded observations" />
      </section>

      <section v-else-if="tab === 'documents'" class="panel stack">
        <p class="note">Downloads are authorized on the server. Upload scanning is not connected, so files are marked not scanned.</p>
        <FileUpload v-if="auth.can('documents.upload')" v-model="files" label="Upload" accept="application/pdf,image/png,image/jpeg,image/webp" multiple :max-size-mb="0.5" />
        <AppButton v-if="auth.can('documents.upload')" type="button" :disabled="files.length === 0" @click="upload">Upload documents</AppButton>
        <EmptyState v-if="documents.length === 0" title="No documents" description="Authorized files for this client appear here." />
        <ul class="records">
          <li v-for="document in documents" :key="document.id">
            <a v-if="auth.can('documents.download')" :href="`/api/v1/clients/${profile.id}/documents/${document.id}`">{{ document.fileName }}</a>
            <span v-else>{{ document.fileName }}</span>
            · {{ document.category }} · {{ document.byteSize }} bytes · {{ document.scanStatus === 'not_configured' ? 'Not scanned' : 'Rejected' }}
          </li>
        </ul>
      </section>

      <section v-else-if="tab === 'reports'" class="panel">
        <EmptyState title="Report writing is not available yet" description="Completed session observations are saved and can be graphed. Creating and approving a report document is a later workflow." />
      </section>

      <section v-else-if="tab === 'activity'" class="panel">
        <EmptyState v-if="activity.length === 0" title="No activity" description="Important client changes are listed here." />
        <ul v-else class="records">
          <li v-for="event in activity" :key="event.id">{{ when(event.createdAt) }} · {{ ACTION_LABELS[event.action] ?? event.action }} · {{ event.actorName || 'System' }}</li>
        </ul>
      </section>
    </template>
    <ConfirmDialog
      :open="confirmOpen"
      title="Deactivate client"
      message="This keeps the clinical history and removes the client from active work. It does not delete the record."
      tone="danger"
      confirm-label="Deactivate"
      @confirm="confirmAction"
      @cancel="confirmOpen = false"
    />
  </PageContainer>
</template>

<style scoped>
.identity, .heading { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; justify-content: space-between; }
.identity { justify-content: flex-start; }
.inline-actions { display: flex; gap: 4px; }
.editor { display: grid; gap: 16px; }
.editor-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; align-items: start; }
.editor-actions, .choices { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.editor-actions { justify-content: flex-end; }
.form-error { margin: 0; color: var(--color-danger); }
.code-chip {
  display: inline-grid;
  place-items: center;
  min-width: 40px;
  min-height: 40px;
  padding: 0 12px;
  border-radius: 999px;
  background: var(--color-primary-soft);
  color: var(--color-primary-ink);
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  flex-shrink: 0;
}
.panel {
  display: grid;
  gap: 16px;
  margin-bottom: 16px;
  padding: 16px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}
.stack { display: grid; gap: 16px; }
.details { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px 20px; margin: 0; }
dt { color: var(--color-text-muted); font-size: 0.82rem; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; }
dd { margin: 4px 0 0; }
.record, .records li {
  display: grid;
  gap: 4px;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}
.records { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
.records li { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; justify-content: space-between; }
.assign { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px 16px; align-items: end; }
.note, .record p { color: var(--color-text-muted); }
.note { margin: 0; }
:deep(.tabs) { overflow-x: auto; }
h2 { margin: 0; }
@media (max-width: 640px) {
  .assign { grid-template-columns: 1fr; }
}
</style>
