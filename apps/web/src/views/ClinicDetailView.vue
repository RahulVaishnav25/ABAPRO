<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { ClinicDetail } from '@abapro/shared';
import { apiRequest, encodedPath } from '@/api/client';
import { displayStoredAddress } from '@/components/address/postal-address';
import AppIcon from '@/components/navigation/AppIcon.vue';
import ClinicFormFields from '@/components/organization/ClinicFormFields.vue';
import { clinicDraftFrom, clinicFormFrom, emptyClinicForm, type ClinicFormValue } from '@/components/organization/form-values';
import AppButton from '@/components/ui/AppButton.vue';
import AppTable from '@/components/ui/AppTable.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useToastStore } from '@/stores/toast';
import { errorMessage, useLoader } from '@/lib/loader';

const route = useRoute();
const toast = useToastStore();
const { t } = useI18n();
const saving = ref(false);
const editing = ref(false);
const editError = ref('');
const clinic = ref<ClinicDetail | null>(null);
const draft = ref<ClinicFormValue>(emptyClinicForm());

const childSentence = computed(() => t('clinics.detail.enrolled', clinic.value?.childCount ?? 0));
const columns = computed(() => [
  { key: 'name', label: t('clinics.detail.columns.name'), sortable: true },
  { key: 'code', label: t('clinics.detail.columns.code'), sortable: true },
  { key: 'status', label: t('clinics.detail.columns.status'), sortable: true },
]);
const rows = computed(() =>
  (clinic.value?.children ?? []).map((child) => ({
    id: child.id,
    name: child.displayName,
    code: child.clientCode,
    status: child.status === 'active' ? t('clinics.detail.active') : t('clinics.detail.inactive'),
    active: child.status === 'active',
  })),
);

function recorded(value: string | null | undefined): string {
  return value?.trim() ? value : t('clinics.detail.notRecorded');
}

function startEdit(): void {
  if (!clinic.value) return;
  editError.value = '';
  draft.value = clinicFormFrom(clinic.value);
  editing.value = true;
}

async function saveClinic(): Promise<void> {
  if (!clinic.value) return;
  editError.value = '';
  if (draft.value.name.trim().length < 2) {
    editError.value = t('clinics.detail.nameRequired');
    return;
  }
  saving.value = true;
  try {
    clinic.value = await apiRequest<ClinicDetail>(encodedPath`/clinics/${clinic.value.id}`, {
      method: 'PATCH',
      body: clinicDraftFrom(draft.value, clinic.value),
    });
    editing.value = false;
    toast.push({ tone: 'success', title: t('clinics.detail.updated') });
  } catch (saveError) {
    editError.value = errorMessage(saveError, t('clinics.detail.updateError'));
  } finally {
    saving.value = false;
  }
}

const { loading, error, load } = useLoader(async () => {
  editing.value = false;
  clinic.value = null;
  clinic.value = await apiRequest<ClinicDetail>(encodedPath`/clinics/${String(route.params.clinicId)}`);
}, t('clinics.detail.error'));

watch(() => route.params.clinicId, () => {
  void load();
});

onMounted(() => {
  void load();
});
</script>

<template>
  <PageContainer>
    <SkeletonBlock v-if="loading" height="220px" />
    <ErrorState v-else-if="error || !clinic" :title="t('clinics.detail.unavailable')" :description="error || t('clinics.detail.error')" @retry="load" />
    <div v-else class="clinic-detail">
      <PageHeader :title="clinic.name" back-to="/clinics" :back-label="t('clinics.title')">
        <template #meta>
          <RouterLink class="org-link" :to="`/organizations/${clinic.organizationId}`">{{ clinic.organizationName }}</RouterLink>
        </template>
        <template v-if="!editing" #actions>
          <AppButton type="button" variant="secondary" icon="edit" @click="startEdit">{{ t('clinics.detail.edit') }}</AppButton>
        </template>
      </PageHeader>

      <section class="settings-card" aria-labelledby="clinic-details-heading">
        <header class="card-header">
          <h2 id="clinic-details-heading">{{ t('clinics.detail.details') }}</h2>
        </header>
        <form v-if="editing" class="form-stack" novalidate @submit.prevent="saveClinic">
          <p v-if="editError" class="form-alert" role="alert"><AppIcon name="alert" :size="16" />{{ editError }}</p>
          <ClinicFormFields v-model="draft" />
          <div class="form-actions">
            <AppButton type="button" variant="secondary" @click="editing = false">{{ t('common.cancel') }}</AppButton>
            <AppButton type="submit" :loading="saving">{{ t('clinics.detail.save') }}</AppButton>
          </div>
        </form>
        <dl v-else class="detail-list">
          <div>
            <dt>{{ t('clinics.detail.organisation') }}</dt>
            <dd><RouterLink :to="`/organizations/${clinic.organizationId}`">{{ clinic.organizationName }}</RouterLink></dd>
          </div>
          <div>
            <dt>{{ t('clinics.detail.email') }}</dt>
            <dd><span dir="ltr">{{ recorded(clinic.contactEmail) }}</span></dd>
          </div>
          <div>
            <dt>{{ t('clinics.detail.phone') }}</dt>
            <dd><span dir="ltr">{{ recorded(clinic.contactPhone) }}</span></dd>
          </div>
          <div class="is-wide">
            <dt>{{ t('clinics.detail.address') }}</dt>
            <dd>{{ recorded(displayStoredAddress(clinic.address, clinic.country) || clinic.location) }}</dd>
          </div>
        </dl>
      </section>

      <section class="settings-card" aria-labelledby="clinic-children-heading">
        <header class="card-header">
          <div class="section-heading">
            <h2 id="clinic-children-heading">{{ t('clinics.detail.clients') }} <span class="count">{{ clinic.childCount }}</span></h2>
            <p class="section-desc">{{ childSentence }}</p>
          </div>
        </header>
        <EmptyState v-if="clinic.children.length === 0" icon="clients" :title="t('clinics.detail.clients')" :description="childSentence" />
        <AppTable
          v-else
          :caption="t('clinics.detail.clientsCaption', { name: clinic.name })"
          :columns="columns"
          :rows="rows"
          row-key="id"
          :page-size="10"
          :searchable="clinic.children.length > 10"
          density="compact"
        >
          <template #cell-name="{ row }">
            <RouterLink class="row-link" :to="`/clients/${row.id}`" dir="auto">{{ row.name }}</RouterLink>
          </template>
          <template #cell-status="{ row }">
            <StatusBadge :tone="row.active ? 'success' : 'neutral'" :label="String(row.status)" />
          </template>
        </AppTable>
      </section>
    </div>
  </PageContainer>
</template>

<style scoped>
.clinic-detail {
  display: grid;
  gap: var(--space-5);
}

.org-link {
  color: var(--color-text-muted);
  font-weight: 500;
  text-decoration: none;
}

.org-link:hover,
.org-link:focus-visible,
.row-link:hover,
.row-link:focus-visible {
  color: var(--color-primary-ink);
  text-decoration: underline;
}

.row-link {
  color: var(--color-ink);
  font-weight: 600;
  text-decoration: none;
}

.detail-list .is-wide {
  grid-column: 1 / -1;
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
</style>
