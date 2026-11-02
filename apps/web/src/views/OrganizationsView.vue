<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { OrganizationDirectoryItem, OrganizationDirectoryPage } from '@abapro/shared';
import { apiRequest } from '@/api/client';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTable from '@/components/ui/AppTable.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import { countryLabel } from '@/components/address/postal-address';
import { useLoader } from '@/lib/loader';
import { useRouter } from 'vue-router';

const router = useRouter();
const { t } = useI18n();
const search = ref('');
const country = ref('');
const page = ref(1);
const pageSize = 8;
const total = ref(0);
const countries = ref<string[]>([]);
const items = ref<OrganizationDirectoryItem[]>([]);
let searchTimer = 0;

const countryOptions = computed(() => [
  { value: '', label: t('orgs.allCountries') },
  ...countries.value.map((code) => ({ value: code, label: countryLabel(code) })),
]);
const columns = computed(() => [
  { key: 'name', label: t('orgs.columns.name') },
  { key: 'contact', label: t('orgs.columns.contact') },
  { key: 'country', label: t('orgs.columns.country') },
  { key: 'clinics', label: t('orgs.columns.clinics') },
]);
const rows = computed(() => items.value.map((item) => ({ id: item.id, name: item.name, item })));
const itemOf = (row: Record<string, unknown>) => row.item as OrganizationDirectoryItem;

const { loading, error, load } = useLoader(async () => {
  const params = new URLSearchParams();
  if (search.value.trim()) params.set('q', search.value.trim());
  if (country.value) params.set('country', country.value);
  params.set('page', String(page.value));
  params.set('pageSize', String(pageSize));
  const directory = await apiRequest<OrganizationDirectoryPage>(`/organizations?${params.toString()}`);
  items.value = directory.items;
  total.value = directory.total;
  page.value = directory.page;
  countries.value = directory.countries;
}, t('orgs.error'));

function changePage(next: number): void {
  page.value = next;
  void load();
}

watch(search, () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    page.value = 1;
    void load();
  }, 250);
});

watch(country, () => {
  page.value = 1;
  void load();
});

onMounted(() => {
  void load();
});
</script>

<template>
  <PageContainer>
    <PageHeader :title="t('orgs.title')" :description="t('orgs.description')">
      <template #actions>
        <AppButton icon="plus" @click="router.push('/organizations/new')">{{ t('orgs.create') }}</AppButton>
      </template>
    </PageHeader>
    <div class="filter-bar">
      <AppInput v-model="search" type="search" :label="t('orgs.search')" :placeholder="t('orgs.searchPlaceholder')" />
      <AppSelect v-model="country" :label="t('orgs.country')" :options="countryOptions" />
    </div>
    <ErrorState v-if="error" :title="t('orgs.unavailable')" :description="error" @retry="load" />
    <AppTable
      v-else
      :caption="t('orgs.caption')"
      :columns="columns"
      :rows="rows"
      row-key="id"
      :loading="loading && items.length === 0"
      :total="total"
      :page="page"
      :page-size="pageSize"
      @update:page="changePage"
    >
      <template #cell-name="{ row }">
        <RouterLink class="org-link" :to="`/organizations/${row.id}`">
          <span class="org-mark" aria-hidden="true">{{ String(row.name).trim().charAt(0).toLocaleUpperCase() }}</span>
          <strong dir="auto">{{ row.name }}</strong>
        </RouterLink>
      </template>
      <template #cell-contact="{ row }">
        <span class="stack">
          <span dir="ltr">{{ itemOf(row).contactEmail }}</span>
          <small v-if="itemOf(row).contactPhone" dir="ltr">{{ itemOf(row).contactPhone }}</small>
        </span>
      </template>
      <template #cell-country="{ row }">{{ countryLabel(itemOf(row).country) }}</template>
      <template #cell-clinics="{ row }">
        <span class="stack">
          <span>{{ t('orgs.clinicCount', itemOf(row).clinics.length) }}</span>
          <small v-if="itemOf(row).clinics.length" class="clinic-names" :title="itemOf(row).clinics.map((clinic) => clinic.name).join(', ')">
            {{ itemOf(row).clinics.map((clinic) => clinic.name).join(', ') }}
          </small>
        </span>
      </template>
      <template #empty>
        <EmptyState icon="organisations" :title="t('orgs.empty')" :description="t('orgs.emptyHint')" />
      </template>
    </AppTable>
  </PageContainer>
</template>

<style scoped>
.org-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--color-ink);
  text-decoration: none;
}

.org-link:hover strong,
.org-link:focus-visible strong {
  color: var(--color-primary-ink);
  text-decoration: underline;
}

.org-mark {
  display: grid;
  place-items: center;
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-sm);
  background: var(--color-primary-soft);
  color: var(--color-primary-ink);
  font-weight: 700;
}

.stack {
  display: grid;
  min-width: 0;
}

.stack > * {
  justify-self: start;
}

.stack small {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.clinic-names {
  display: block;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
