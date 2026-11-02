<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import type { AssessmentSummary, AssessmentTemplate } from '@abapro/shared';
import { assessmentTemplatesRequest, assessmentsRequest, saveAssessmentTemplateRequest } from '@/api/programs';
import AppIcon from '@/components/navigation/AppIcon.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppTable from '@/components/ui/AppTable.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { formatDate } from '@/lib/format';
import { errorMessage, useLoader } from '@/lib/loader';

const auth = useAuthStore();
const toast = useToastStore();
const router = useRouter();
const { t } = useI18n();
const items = ref<AssessmentSummary[]>([]);
const templates = ref<AssessmentTemplate[]>([]);
const templateName = ref('');
const templateType = ref('');
const itemLabel = ref('');

const { loading, error, load } = useLoader(async () => {
  items.value = await assessmentsRequest();
  templates.value = await assessmentTemplatesRequest();
}, t('assessments.error'));

const columns = computed(() => [
  { key: 'name', label: t('assessments.columns.name'), sortable: true },
  { key: 'client', label: t('assessments.columns.client'), sortable: true },
  { key: 'type', label: t('assessments.columns.type'), sortable: true },
  { key: 'assessedOn', label: t('assessments.columns.dates'), sortable: true },
  { key: 'clinician', label: t('assessments.columns.clinician'), sortable: true },
  { key: 'status', label: t('assessments.columns.status'), sortable: true },
]);
const rows = computed(() =>
  items.value.map((item) => ({
    id: item.id,
    name: item.name,
    client: item.clientName,
    type: item.assessmentType,
    assessedOn: item.assessedOn ?? '',
    clinician: item.clinicianName ?? '',
    status: t(`assessments.statuses.${item.status}`),
    item,
  })),
);
const itemOf = (row: Record<string, unknown>) => row.item as AssessmentSummary;
const statusTone = (status: string) => (status === 'completed' || status === 'reviewed' ? 'success' : status === 'in_progress' ? 'info' : 'neutral');

async function saveTemplate(): Promise<void> {
  try {
    await saveAssessmentTemplateRequest({
      name: templateName.value.trim(),
      assessmentType: templateType.value.trim(),
      description: t('assessments.templates.description_text'),
      items: itemLabel.value.trim() ? [{ label: itemLabel.value.trim(), responseKind: 'text' }] : [],
    });
    templateName.value = '';
    templateType.value = '';
    itemLabel.value = '';
    toast.push({ tone: 'success', title: t('assessments.templates.saved'), message: t('assessments.templates.savedMessage') });
    await load();
  } catch (saveError) {
    toast.push({ tone: 'danger', title: t('assessments.templates.notSaved'), message: errorMessage(saveError, t('errors.generic')) });
  }
}

onMounted(() => void load());
</script>

<template>
  <PageContainer>
    <PageHeader :title="t('assessments.title')" :description="t('assessments.description')">
      <template #actions>
        <AppButton v-if="auth.can('assessments.create')" icon="plus" @click="router.push('/assessments/new')">{{ t('assessments.new') }}</AppButton>
      </template>
    </PageHeader>
    <ErrorState v-if="error" :title="t('assessments.unavailable')" :description="error" @retry="load" />
    <div v-else class="assessments">
      <AppTable :caption="t('assessments.caption')" :columns="columns" :rows="rows" row-key="id" :page-size="15" :loading="loading">
        <template #cell-name="{ row }">
          <RouterLink class="row-link" :to="`/assessments/${row.id}`" dir="auto">{{ row.name }}</RouterLink>
          <small class="muted">{{ t('assessments.programs', itemOf(row).programCount) }}</small>
        </template>
        <template #cell-client="{ row }">
          <RouterLink class="muted-link" :to="`/clients/${itemOf(row).clientId}`" dir="auto">{{ row.client }}</RouterLink>
        </template>
        <template #cell-assessedOn="{ row }">
          <span class="stack">
            <span>{{ formatDate(itemOf(row).assessedOn, t('assessments.noDate')) }}</span>
            <small class="muted">{{ itemOf(row).reviewOn ? t('assessments.reviewOn', { date: formatDate(itemOf(row).reviewOn) }) : t('assessments.reviewNotSet') }}</small>
          </span>
        </template>
        <template #cell-clinician="{ row }">{{ row.clinician || t('assessments.noClinician') }}</template>
        <template #cell-status="{ row }">
          <StatusBadge :tone="statusTone(itemOf(row).status)" :label="String(row.status)" />
        </template>
        <template #empty>
          <EmptyState icon="file" :title="t('assessments.empty')" :description="t('assessments.emptyHint')" />
        </template>
      </AppTable>

      <section v-if="auth.can('assessments.create')" class="settings-card">
        <div class="section-heading">
          <h2>{{ t('assessments.templates.title') }}</h2>
          <p class="section-desc">{{ t('assessments.templates.description') }}</p>
        </div>
        <ul v-if="templates.length" class="template-list">
          <li v-for="template in templates" :key="template.id" class="template-item">
            <span class="template-icon" aria-hidden="true"><AppIcon name="file" :size="16" /></span>
            <span class="stack">
              <strong dir="auto">{{ template.name }}</strong>
              <small class="muted">{{ template.assessmentType }} · {{ t('assessments.templates.items', template.items.length) }}</small>
            </span>
          </li>
        </ul>
        <p v-else class="muted">{{ t('assessments.templates.none') }}</p>
        <form class="record-card form-stack" @submit.prevent="saveTemplate">
          <div class="form-grid">
            <AppInput v-model="templateName" :label="t('assessments.templates.name')" />
            <AppInput v-model="templateType" :label="t('assessments.templates.type')" :hint="t('assessments.templates.typeHint')" />
            <AppInput v-model="itemLabel" :label="t('assessments.templates.firstItem')" :hint="t('assessments.templates.firstItemHint')" />
          </div>
          <div class="form-actions">
            <AppButton type="submit" variant="secondary" icon="plus" :disabled="templateName.trim().length < 2 || templateType.trim().length < 2">{{ t('assessments.templates.save') }}</AppButton>
          </div>
        </form>
      </section>
    </div>
  </PageContainer>
</template>

<style scoped>
.assessments {
  display: grid;
  gap: var(--space-5);
}

.row-link {
  display: block;
  color: var(--color-ink);
  font-weight: 600;
  text-decoration: none;
}

.row-link:hover,
.row-link:focus-visible,
.muted-link:hover,
.muted-link:focus-visible {
  color: var(--color-primary-ink);
  text-decoration: underline;
}

.muted-link {
  color: inherit;
  text-decoration: none;
}

.muted {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.stack {
  display: grid;
  min-width: 0;
}

.template-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.template-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
}

.template-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: var(--color-primary-soft);
  color: var(--color-primary-ink);
}
</style>
