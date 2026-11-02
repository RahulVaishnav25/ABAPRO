<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ClinicDirectoryItem, ClinicDirectoryPage } from '@abapro/shared';
import { apiRequest } from '@/api/client';
import { countryLabel, displayStoredAddress } from '@/components/address/postal-address';
import AppIcon from '@/components/navigation/AppIcon.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTable from '@/components/ui/AppTable.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import { useLoader } from '@/lib/loader';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const { t } = useI18n();
const platformAdmin = computed(() => auth.user?.platformAdmin === true);
const search = ref('');
const organizationId = ref('');
const country = ref('');
const page = ref(1);
const pageSize = 8;
const total = ref(0);
const countries = ref<string[]>([]);
const organizations = ref<Array<{ id: string; name: string }>>([]);
const items = ref<ClinicDirectoryItem[]>([]);
let searchTimer = 0;

const organizationOptions = computed(() => [
  { value: '', label: t('clinics.allOrganisations') },
  ...organizations.value.map((organization) => ({ value: organization.id, label: organization.name })),
]);
const countryOptions = computed(() => [
  { value: '', label: t('clinics.allCountries') },
  ...countries.value.map((code) => ({ value: code, label: countryLabel(code) })),
]);
const filtered = computed(() => Boolean(search.value.trim() || organizationId.value || country.value));
const columns = computed(() => [
  { key: 'name', label: t('clinics.columns.name') },
  ...(platformAdmin.value ? [{ key: 'organisation', label: t('clinics.columns.organisation') }] : []),
  { key: 'location', label: t('clinics.columns.location') },
  { key: 'country', label: t('clinics.columns.country') },
  { key: 'clients', label: t('clinics.columns.clients'), align: 'end' as const },
]);
const rows = computed(() => items.value.map((item) => ({ id: item.id, name: item.name, item })));
const itemOf = (row: Record<string, unknown>) => row.item as ClinicDirectoryItem;

const { loading, error, load } = useLoader(async () => {
  const params = new URLSearchParams();
  if (search.value.trim()) params.set('q', search.value.trim());
  if (organizationId.value) params.set('organizationId', organizationId.value);
  if (country.value) params.set('country', country.value);
  params.set('page', String(page.value));
  params.set('pageSize', String(pageSize));
  const directory = await apiRequest<ClinicDirectoryPage>(`/clinics?${params.toString()}`);
  items.value = directory.items;
  total.value = directory.total;
  page.value = directory.page;
  countries.value = directory.countries;
  organizations.value = directory.organizations;
}, t('clinics.error'));

function locationLabel(item: ClinicDirectoryItem): string {
  return displayStoredAddress(item.address, item.country) || item.location;
}

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

watch([organizationId, country], () => {
  page.value = 1;
  void load();
});

onMounted(() => {
  void load();
});
</script>

<template>
  <PageContainer>
    <PageHeader :title="t('clinics.title')" :description="platformAdmin ? t('clinics.descriptionAll') : t('clinics.description')" />
    <div class="filter-bar">
      <AppInput v-model="search" type="search" :label="t('clinics.search')" :placeholder="t('clinics.searchPlaceholder')" />
      <AppSelect v-if="platformAdmin" v-model="organizationId" :label="t('clinics.organisation')" :options="organizationOptions" />
      <AppSelect v-if="platformAdmin" v-model="country" :label="t('clinics.country')" :options="countryOptions" />
    </div>
    <ErrorState v-if="error" :title="t('clinics.unavailable')" :description="error" @retry="load" />
    <AppTable
      v-else
      :caption="t('clinics.caption')"
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
        <RouterLink class="clinic-link" :to="`/clinics/${row.id}`">
          <span class="clinic-mark" aria-hidden="true"><AppIcon name="clinics" :size="16" /></span>
          <strong dir="auto">{{ row.name }}</strong>
        </RouterLink>
      </template>
      <template #cell-organisation="{ row }">
        <RouterLink class="muted-link" :to="`/organizations/${itemOf(row).organizationId}`">{{ itemOf(row).organizationName }}</RouterLink>
      </template>
      <template #cell-location="{ row }">
        <span class="location" :title="locationLabel(itemOf(row))">{{ locationLabel(itemOf(row)) || '—' }}</span>
      </template>
      <template #cell-country="{ row }">{{ countryLabel(itemOf(row).country) }}</template>
      <template #cell-clients="{ row }">{{ itemOf(row).childCount }}</template>
      <template #empty>
        <EmptyState
          icon="clinics"
          :title="filtered ? t('clinics.noMatches') : t('clinics.empty')"
          :description="filtered ? t('clinics.noMatchesHint') : t('clinics.emptyHint')"
        />
      </template>
    </AppTable>
  </PageContainer>
</template>

<style scoped>
.clinic-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--color-ink);
  text-decoration: none;
}

.clinic-link:hover strong,
.clinic-link:focus-visible strong,
.muted-link:hover,
.muted-link:focus-visible {
  color: var(--color-primary-ink);
  text-decoration: underline;
}

.clinic-mark {
  display: grid;
  place-items: center;
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-sm);
  background: var(--color-primary-soft);
  color: var(--color-primary-ink);
}

.muted-link {
  color: inherit;
  text-decoration: none;
}

.location {
  display: block;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
