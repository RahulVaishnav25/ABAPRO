<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { AssessmentSummary, AssessmentTemplate } from '@abapro/shared';
import { assessmentTemplatesRequest, assessmentsRequest, saveAssessmentTemplateRequest } from '@/api/programs';
import { ApiError } from '@/api/client';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';

const auth = useAuthStore();
const toast = useToastStore();
const router = useRouter();
const loading = ref(true);
const error = ref('');
const items = ref<AssessmentSummary[]>([]);
const templates = ref<AssessmentTemplate[]>([]);
const templateName = ref('');
const templateType = ref('');
const itemLabel = ref('');

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    items.value = await assessmentsRequest();
    templates.value = await assessmentTemplatesRequest();
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'Assessments could not be loaded.';
  } finally {
    loading.value = false;
  }
}

async function saveTemplate(): Promise<void> {
  try {
    await saveAssessmentTemplateRequest({
      name: templateName.value.trim(),
      assessmentType: templateType.value.trim(),
      description: 'Clinician-written items. This template does not include a published test.',
      items: itemLabel.value.trim() ? [{ label: itemLabel.value.trim(), responseKind: 'text' }] : [],
    });
    templateName.value = '';
    templateType.value = '';
    itemLabel.value = '';
    toast.push({ tone: 'success', title: 'Template saved', message: 'Existing assessments keep their own copied items.' });
    await load();
  } catch (saveError) {
    toast.push({ tone: 'danger', title: 'Template was not saved', message: saveError instanceof ApiError ? saveError.message : 'Try again.' });
  }
}

onMounted(() => void load());
</script>

<template>
  <PageContainer>
    <PageHeader title="Assessments" description="Client assessments and clinician-written templates. Do not enter copyrighted test questions.">
      <template #actions>
        <AppButton v-if="auth.can('assessments.create')" @click="router.push('/assessments/new')">New assessment</AppButton>
      </template>
    </PageHeader>
    <SkeletonBlock v-if="loading" height="220px" />
    <ErrorState v-else-if="error" title="Assessments unavailable" :description="error" @retry="load" />
    <template v-else>
      <section class="panel stack">
        <EmptyState v-if="items.length === 0" title="No assessments" description="Create an assessment for a client, or start from a template you write yourself." />
        <button v-for="item in items" :key="item.id" class="row" type="button" @click="router.push(`/assessments/${item.id}`)">
          <strong>{{ item.name }}</strong>
          <span>{{ item.clientName }} · {{ item.assessmentType }}</span>
          <span>{{ item.assessedOn || 'No date' }} · Review {{ item.reviewOn || 'not set' }}</span>
          <span>{{ item.clinicianName || 'No clinician' }} · {{ item.programCount }} programs</span>
          <StatusBadge :tone="item.status === 'completed' || item.status === 'reviewed' ? 'success' : 'neutral'" :label="item.status" />
        </button>
      </section>
      <section v-if="auth.can('assessments.create')" class="panel stack">
        <h2>Assessment templates</h2>
        <p class="note">Templates are organization-owned checklists. Copying one into a client assessment does not keep a live link, and editing the template later does not change completed assessments.</p>
        <ul>
          <li v-for="template in templates" :key="template.id">{{ template.name }} · {{ template.assessmentType }} · {{ template.items.length }} items</li>
        </ul>
        <div class="grid">
          <AppInput v-model="templateName" label="Template name" />
          <AppInput v-model="templateType" label="Assessment type" hint="Example: skill checklist" />
          <AppInput v-model="itemLabel" label="First item" hint="Write your own item. Do not paste a published test." />
        </div>
        <AppButton type="button" variant="secondary" :disabled="templateName.trim().length < 2 || templateType.trim().length < 2" @click="saveTemplate">Save template</AppButton>
      </section>
    </template>
  </PageContainer>
</template>

<style scoped>
.stack { display: grid; gap: 12px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.row { display: grid; gap: 4px; text-align: left; padding: 12px; border: 0; border-bottom: 1px solid var(--color-border); background: transparent; cursor: pointer; }
.note { color: var(--color-text-muted); }
h2 { margin: 0; }
</style>
