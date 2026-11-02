<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { AssessmentDocumentLink, AssessmentTemplate, AssessmentWrite, ClientDirectoryItem, ResponseKind, StaffOption } from '@abapro/shared';
import { clientAssigneesRequest, clientDirectoryRequest, fileToBase64 } from '@/api/clients';
import { assessmentRequest, assessmentTemplatesRequest, saveAssessmentRequest, uploadAssessmentDocumentRequest } from '@/api/programs';
import AppIcon from '@/components/navigation/AppIcon.vue';
import AppButton from '@/components/ui/AppButton.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
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
import { errorMessage, useLoader } from '@/lib/loader';

interface ItemDraft {
  label: string;
  responseKind: ResponseKind;
  responseText: string;
}

const toast = useToastStore();
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const assessmentId = computed(() => (typeof route.params.assessmentId === 'string' ? route.params.assessmentId : ''));
const editing = computed(() => Boolean(assessmentId.value) && route.name !== 'assessment-detail');
const reading = computed(() => route.name === 'assessment-detail');
const saving = ref(false);
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
const status = ref<AssessmentWrite['status']>('draft');
const assessedOn = ref('');
const reviewOn = ref('');
const clinicianId = ref('');
const summary = ref('');
const resultsNote = ref('');
const changeReason = ref('');
const items = ref<ItemDraft[]>([]);

const kinds = computed(() => ['text', 'yes_no', 'rating', 'count'].map((value) => ({ value, label: t(`assessments.form.kinds.${value}`) })));
const statusOptions = computed(() => ['draft', 'in_progress', 'completed', 'reviewed'].map((value) => ({ value, label: t(`assessments.statuses.${value}`) })));
const clientOptions = computed(() => clients.value.map((client) => ({ value: client.id, label: `${client.displayName} (${client.clientCode})` })));
const templateOptions = computed(() => [{ value: '', label: t('assessments.form.noTemplate') }, ...templates.value.map((template) => ({ value: template.id, label: template.name }))]);
const clinicianOptions = computed(() => [{ value: '', label: t('assessments.form.unassigned') }, ...clinicians.value.map((person) => ({ value: person.id, label: person.name }))]);
const title = computed(() => (reading.value ? name.value || t('assessments.form.readTitle') : editing.value ? t('assessments.form.editTitle') : t('assessments.form.newTitle')));

const { loading, error, load } = useLoader(async () => {
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
    clinicianId.value = assessment.assignedClinicianId ?? '';
    summary.value = assessment.summary;
    resultsNote.value = assessment.resultsNote;
    programs.value = assessment.programs;
    documents.value = assessment.documents;
    items.value = assessment.items.map((item) => ({ label: item.label, responseKind: item.responseKind, responseText: item.responseText }));
  } else if (typeof route.query.clientId === 'string') {
    clientId.value = route.query.clientId;
  }
}, t('assessments.form.error'));

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
    toast.push({ tone: 'success', title: t('assessments.form.saved'), message: saved.name });
    await router.push(`/assessments/${saved.id}`);
  } catch (saveError) {
    formError.value = errorMessage(saveError, t('assessments.form.saveError'));
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
    toast.push({ tone: 'success', title: t('assessments.form.documentSaved'), message: t('assessments.form.documentSavedMessage') });
  } catch (uploadError) {
    toast.push({ tone: 'danger', title: t('assessments.form.documentNotSaved'), message: errorMessage(uploadError, t('errors.generic')) });
  }
}

onMounted(() => void load());
</script>

<template>
  <PageContainer>
    <PageHeader :title="title" :description="t('assessments.form.description')" :back-to="reading || !assessmentId ? '/assessments' : `/assessments/${assessmentId}`" :back-label="t('assessments.title')">
      <template v-if="reading" #actions>
        <AppButton variant="secondary" icon="edit" @click="router.push(`/assessments/${assessmentId}/edit`)">{{ t('assessments.form.edit') }}</AppButton>
      </template>
    </PageHeader>
    <SkeletonBlock v-if="loading" height="240px" />
    <ErrorState v-else-if="error" :title="t('assessments.form.unavailable')" :description="error" @retry="load" />
    <form v-else class="assessment-form" @submit.prevent="save">
      <p v-if="formError" class="form-alert" role="alert"><AppIcon name="alert" :size="16" />{{ formError }}</p>

      <section class="settings-card">
        <header class="card-header">
          <h2>{{ t('assessments.form.details') }}</h2>
          <StatusBadge v-if="reading" :tone="status === 'completed' || status === 'reviewed' ? 'success' : status === 'in_progress' ? 'info' : 'neutral'" :label="t(`assessments.statuses.${status}`)" />
        </header>
        <div class="form-grid">
          <AppSelect v-model="clientId" :label="t('assessments.form.client')" :disabled="reading || editing" :options="clientOptions" />
          <AppSelect v-if="!reading" v-model="templateId" :label="t('assessments.form.template')" :options="templateOptions" @update:model-value="applyTemplate" />
          <AppInput v-model="name" :label="t('assessments.form.name')" :disabled="reading" required />
          <AppInput v-model="assessmentType" :label="t('assessments.form.type')" :disabled="reading" :hint="reading ? undefined : t('assessments.form.typeHint')" required />
          <AppInput v-model="assessedOn" :label="t('assessments.form.assessedOn')" type="date" :disabled="reading" />
          <AppInput v-model="reviewOn" :label="t('assessments.form.reviewOn')" type="date" :disabled="reading" />
          <AppSelect v-if="!reading" v-model="status" :label="t('assessments.form.status')" :options="statusOptions" />
          <AppSelect v-model="clinicianId" :label="t('assessments.form.clinician')" :disabled="reading" :options="clinicianOptions" />
        </div>
      </section>

      <section class="settings-card">
        <div class="section-heading">
          <h2>{{ t('assessments.form.items') }} <span class="count">{{ items.length }}</span></h2>
          <p class="section-desc">{{ t('assessments.form.itemsHint') }}</p>
        </div>
        <p v-if="items.length === 0" class="muted">{{ t('assessments.form.noItems') }}</p>
        <div v-for="(item, index) in items" :key="index" class="record-card item-row">
          <span class="item-number" aria-hidden="true">{{ index + 1 }}</span>
          <div class="form-grid item-fields">
            <AppInput v-model="item.label" :label="t('assessments.form.item')" :disabled="reading" />
            <AppSelect v-model="item.responseKind" :label="t('assessments.form.response')" :disabled="reading" :options="kinds" />
            <AppInput v-model="item.responseText" :label="t('assessments.form.result')" :disabled="reading" />
          </div>
          <AppButton v-if="!reading" type="button" variant="ghost" size="sm" icon="close" :aria-label="t('assessments.form.removeItem')" @click="items.splice(index, 1)" />
        </div>
        <div v-if="!reading">
          <AppButton type="button" variant="secondary" icon="plus" @click="items.push({ label: '', responseKind: 'text', responseText: '' })">{{ t('assessments.form.addItem') }}</AppButton>
        </div>
      </section>

      <section class="settings-card">
        <h2>{{ t('assessments.form.results') }}</h2>
        <AppTextarea v-model="summary" :label="t('assessments.form.summary')" :rows="3" :disabled="reading" />
        <AppTextarea v-model="resultsNote" :label="t('assessments.form.resultsNote')" :rows="3" :disabled="reading" />
        <AppInput v-if="!reading && editing" v-model="changeReason" :label="t('assessments.form.changeReason')" :hint="t('assessments.form.changeReasonHint')" />
      </section>

      <section v-if="assessmentId" class="settings-card">
        <h2>{{ t('assessments.form.documents') }}</h2>
        <p v-if="documents.length === 0" class="muted">{{ t('assessments.form.noDocuments') }}</p>
        <ul v-else class="record-list">
          <li v-for="document in documents" :key="document.id" class="record-card doc-row">
            <AppIcon name="file" :size="16" />
            <span dir="auto">{{ document.fileName }}</span>
            <StatusBadge :tone="document.scanStatus === 'not_configured' ? 'neutral' : 'danger'" :label="document.scanStatus === 'not_configured' ? t('assessments.form.notScanned') : t('assessments.form.rejected')" />
          </li>
        </ul>
        <template v-if="auth.can('documents.upload')">
          <FileUpload v-model="files" :label="t('assessments.form.document')" accept="application/pdf,image/png,image/jpeg,image/webp" :max-size-mb="0.5" />
          <div class="form-actions">
            <AppButton type="button" icon="upload" :disabled="files.length === 0" @click="upload">{{ t('assessments.form.saveDocument') }}</AppButton>
          </div>
        </template>
      </section>

      <section v-if="assessmentId" class="settings-card">
        <h2>{{ t('assessments.form.linkedPrograms') }}</h2>
        <p v-if="programs.length === 0" class="muted">{{ t('assessments.form.noPrograms') }}</p>
        <ul v-else class="program-links">
          <li v-for="program in programs" :key="program.id"><RouterLink :to="`/programs/${program.id}`" dir="auto">{{ program.title }}</RouterLink></li>
        </ul>
      </section>

      <div v-if="!reading" class="form-actions">
        <AppButton type="button" variant="secondary" @click="router.push(assessmentId ? `/assessments/${assessmentId}` : '/assessments')">{{ t('common.cancel') }}</AppButton>
        <AppButton type="submit" :loading="saving">{{ t('assessments.form.save') }}</AppButton>
      </div>
    </form>
  </PageContainer>
</template>

<style scoped>
.assessment-form {
  display: grid;
  gap: var(--space-5);
  max-width: 1040px;
}

h2 {
  font-size: var(--text-md);
}

.count {
  margin-inline-start: 6px;
  padding: 1px 8px;
  border-radius: var(--radius-full);
  background: var(--color-surface-sunken);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-weight: 600;
  vertical-align: middle;
}

.muted {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.item-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

.item-number {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  margin-top: 26px;
  border-radius: 50%;
  background: var(--color-primary-soft);
  color: var(--color-primary-ink);
  font-size: var(--text-xs);
  font-weight: 700;
}

.item-fields {
  flex: 1;
  min-width: 0;
}

.item-row > :last-child:not(.item-fields) {
  margin-top: 26px;
}

.doc-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.doc-row span {
  flex: 1;
  min-width: 0;
}

.program-links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
