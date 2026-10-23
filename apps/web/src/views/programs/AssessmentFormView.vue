<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { AssessmentDocumentLink, AssessmentTemplate, ClientDirectoryItem, ResponseKind, StaffOption } from '@abapro/shared';
import { clientAssigneesRequest, clientDirectoryRequest, fileToBase64 } from '@/api/clients';
import { assessmentRequest, assessmentTemplatesRequest, saveAssessmentRequest, uploadAssessmentDocumentRequest, type AssessmentBody } from '@/api/programs';
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
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';

interface ItemDraft {
  label: string;
  responseKind: ResponseKind;
  responseText: string;
}

const toast = useToastStore();
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const assessmentId = computed(() => (typeof route.params.assessmentId === 'string' ? route.params.assessmentId : ''));
const editing = computed(() => Boolean(assessmentId.value) && route.name !== 'assessment-detail');
const reading = computed(() => route.name === 'assessment-detail');
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const formError = ref('');
const clients = ref<ClientDirectoryItem[]>([]);
const templates = ref<AssessmentTemplate[]>([]);
const clinicians = ref<StaffOption[]>([]);
const programs = ref<Array<{ id: string; title: string }>>([]);
const documents = ref<AssessmentDocumentLink[]>([]);
const files = ref<File[]>([]);
const clientId = ref('');
const templateId = ref('');
const name = ref('');
const assessmentType = ref('');
const status = ref<AssessmentBody['status']>('draft');
const assessedOn = ref('');
const reviewOn = ref('');
const clinicianId = ref('');
const summary = ref('');
const resultsNote = ref('');
const changeReason = ref('');
const items = ref<ItemDraft[]>([]);

const kinds = [
  { value: 'text', label: 'Text' },
  { value: 'yes_no', label: 'Yes / no' },
  { value: 'rating', label: 'Rating' },
  { value: 'count', label: 'Count' },
];

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const directory = await clientDirectoryRequest({ pageSize: 50 });
    clients.value = directory.items;
    templates.value = await assessmentTemplatesRequest();
    clinicians.value = (await clientAssigneesRequest()).filter((person) => person.role === 'clinical_supervisor');
    if (assessmentId.value) {
      const assessment = await assessmentRequest(assessmentId.value);
      clientId.value = assessment.clientId;
      templateId.value = assessment.templateId ?? '';
      name.value = assessment.name;
      assessmentType.value = assessment.assessmentType;
      status.value = assessment.status;
      assessedOn.value = assessment.assessedOn ?? '';
      reviewOn.value = assessment.reviewOn ?? '';
      summary.value = assessment.summary;
      resultsNote.value = assessment.resultsNote;
      programs.value = assessment.programs;
      documents.value = assessment.documents;
      items.value = assessment.items.map((item) => ({ label: item.label, responseKind: item.responseKind, responseText: item.responseText }));
    } else if (typeof route.query.clientId === 'string') {
      clientId.value = route.query.clientId;
    }
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'The assessment could not be loaded.';
  } finally {
    loading.value = false;
  }
}

function applyTemplate(): void {
  const template = templates.value.find((item) => item.id === templateId.value);
  if (!template) return;
  name.value = name.value || template.name;
  assessmentType.value = template.assessmentType;
  items.value = template.items.map((item) => ({ label: item.label, responseKind: item.responseKind, responseText: '' }));
}

async function save(): Promise<void> {
  formError.value = '';
  saving.value = true;
  try {
    const saved = await saveAssessmentRequest({
      clientId: clientId.value,
      templateId: templateId.value || undefined,
      name: name.value.trim(),
      assessmentType: assessmentType.value.trim(),
      status: status.value,
      assessedOn: assessedOn.value || undefined,
      reviewOn: reviewOn.value || undefined,
      assignedClinicianId: clinicianId.value || undefined,
      summary: summary.value,
      resultsNote: resultsNote.value,
      changeReason: changeReason.value || undefined,
      items: items.value.filter((item) => item.label.trim()),
    }, assessmentId.value || undefined);
    toast.push({ tone: 'success', title: 'Assessment saved', message: saved.name });
    await router.push(`/assessments/${saved.id}`);
  } catch (saveError) {
    formError.value = saveError instanceof ApiError ? saveError.message : 'The assessment could not be saved.';
  } finally {
    saving.value = false;
  }
}

async function upload(): Promise<void> {
  const file = files.value[0];
  if (!assessmentId.value || !file) return;
  try {
    await uploadAssessmentDocumentRequest(assessmentId.value, {
      fileName: file.name,
      contentType: file.type,
      contentBase64: await fileToBase64(file),
    });
    files.value = [];
    documents.value = (await assessmentRequest(assessmentId.value)).documents;
    toast.push({ tone: 'success', title: 'Document saved', message: 'Scanning is not connected, so the file is marked not scanned.' });
  } catch (uploadError) {
    toast.push({ tone: 'danger', title: 'Document was not saved', message: uploadError instanceof ApiError ? uploadError.message : 'Try again.' });
  }
}

onMounted(() => void load());
</script>

<template>
  <PageContainer>
    <PageHeader :title="reading ? name || 'Assessment' : editing ? 'Edit assessment' : 'New assessment'" description="Record the clinician’s summary and the items configured for this assessment.">
      <template v-if="reading" #actions>
        <AppButton variant="secondary" @click="router.push(`/assessments/${assessmentId}/edit`)">Edit</AppButton>
      </template>
    </PageHeader>
    <SkeletonBlock v-if="loading" height="240px" />
    <ErrorState v-else-if="error" title="Assessment unavailable" :description="error" @retry="load" />
    <form v-else class="stack" @submit.prevent="save">
      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
      <section class="panel grid">
        <AppSelect v-model="clientId" label="Client" :disabled="reading || editing" :options="clients.map((client) => ({ value: client.id, label: `${client.displayName} (${client.clientCode})` }))" />
        <AppSelect v-if="!reading" v-model="templateId" label="Template" :options="[{ value: '', label: 'No template' }, ...templates.map((template) => ({ value: template.id, label: template.name }))]" @update:model-value="applyTemplate" />
        <AppInput v-model="name" label="Assessment name" :disabled="reading" required />
        <AppInput v-model="assessmentType" label="Type" :disabled="reading" hint="Use your own type name." required />
        <AppInput v-model="assessedOn" label="Assessment date" type="date" :disabled="reading" />
        <AppInput v-model="reviewOn" label="Review date" type="date" :disabled="reading" />
        <AppSelect v-model="status" label="Status" :disabled="reading" :options="[{ value: 'draft', label: 'Draft' }, { value: 'in_progress', label: 'In progress' }, { value: 'completed', label: 'Completed' }, { value: 'reviewed', label: 'Reviewed' }]" />
        <AppSelect v-model="clinicianId" label="Assigned clinician" :disabled="reading" :options="[{ value: '', label: 'Unassigned' }, ...clinicians.map((person) => ({ value: person.id, label: person.name }))]" />
      </section>
      <section class="panel stack">
        <h2>Items</h2>
        <p class="note">These items are written by the clinic. The form does not supply a licensed instrument.</p>
        <article v-for="(item, index) in items" :key="index" class="grid">
          <AppInput v-model="item.label" label="Item" :disabled="reading" />
          <AppSelect v-model="item.responseKind" label="Response" :disabled="reading" :options="kinds" />
          <AppInput v-model="item.responseText" label="Result" :disabled="reading" />
        </article>
        <AppButton v-if="!reading" type="button" variant="secondary" @click="items.push({ label: '', responseKind: 'text', responseText: '' })">Add item</AppButton>
      </section>
      <section class="panel stack">
        <AppTextarea v-model="summary" label="Clinician summary" :rows="3" :disabled="reading" />
        <AppTextarea v-model="resultsNote" label="Results" :rows="3" :disabled="reading" />
        <AppInput v-if="!reading && editing" v-model="changeReason" label="Reason for completing or reviewing" hint="Required when the status becomes completed or reviewed." />
      </section>
      <section v-if="assessmentId" class="panel stack">
        <h2>Supporting documents</h2>
        <p v-for="document in documents" :key="document.id">{{ document.fileName }} · {{ document.scanStatus === 'not_configured' ? 'Not scanned' : 'Rejected' }}</p>
        <FileUpload v-if="auth.can('documents.upload')" v-model="files" label="Document" accept="application/pdf,image/png,image/jpeg,image/webp" :max-size-mb="0.5" />
        <AppButton v-if="auth.can('documents.upload')" type="button" :disabled="files.length === 0" @click="upload">Save document</AppButton>
      </section>
      <section v-if="programs.length" class="panel">
        <h2>Linked programs</h2>
        <p v-for="program in programs" :key="program.id"><RouterLink :to="`/programs/${program.id}`">{{ program.title }}</RouterLink></p>
      </section>
      <div v-if="!reading" class="actions">
        <AppButton type="button" variant="secondary" @click="router.push(assessmentId ? `/assessments/${assessmentId}` : '/assessments')">Cancel</AppButton>
        <AppButton type="submit" :loading="saving">Save assessment</AppButton>
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
