<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import type { OrganizationDirectoryItem, OrganizationDirectoryPage } from '@abapro/shared';
import { apiRequest } from '@/api/client';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import FilterBar from '@/components/ui/FilterBar.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';

const router = useRouter();
const loading = ref(true);
const error = ref('');
const search = ref('');
const country = ref('');
const page = ref(1);
const pageSize = 8;
const total = ref(0);
const countries = ref<string[]>([]);
const items = ref<OrganizationDirectoryItem[]>([]);
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
let searchTimer = 0;

const countryOptions = computed(() => [
  { value: '', label: 'All countries' },
  ...countries.value.map((code) => ({ value: code, label: regionNames.of(code) ?? code })),
]);
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
const rangeStart = computed(() => (total.value === 0 ? 0 : (page.value - 1) * pageSize + 1));
const rangeEnd = computed(() => Math.min(page.value * pageSize, total.value));

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
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
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'Organisations could not be loaded.';
  } finally {
    loading.value = false;
  }
}

function clinicSummary(item: OrganizationDirectoryItem): string {
  if (item.clinics.length === 0) return 'No clinics yet';
  const names = item.clinics.map((clinic) => `${clinic.name}, ${clinic.location}`).join(' · ');
  return `${item.clinics.length} ${item.clinics.length === 1 ? 'clinic' : 'clinics'} · ${names}`;
}

function openOrganisation(id: string): void {
  void router.push(`/organizations/${id}`);
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
    <PageHeader title="Organisations" description="Every organisation on this portal. Open one to see its clinics, clients, and people.">
      <template #actions>
        <RouterLink class="create-link" to="/organizations/new">Create organisation</RouterLink>
      </template>
    </PageHeader>
    <FilterBar>
      <AppInput v-model="search" class="organisation-search" label="Search" placeholder="Organisation, clinic, or location" />
      <AppSelect v-model="country" label="Country" :options="countryOptions" />
    </FilterBar>
    <SkeletonBlock v-if="loading" height="220px" />
    <ErrorState v-else-if="error" title="Organisations unavailable" :description="error" @retry="load" />
    <template v-else>
      <EmptyState v-if="total === 0" title="No organisations yet" description="Create an organisation and its clinics in one flow, or change the search and country filter." />
      <div v-else class="table-card">
        <div class="table-scroll">
          <table class="data-table">
            <caption class="visually-hidden">Organisations</caption>
            <thead>
              <tr>
                <th scope="col">Organisation</th>
                <th scope="col">Contact</th>
                <th scope="col">Country</th>
                <th scope="col">Clinics</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in items" :key="item.id" class="organisation-row" @click="openOrganisation(item.id)">
                <th scope="row">
                  <RouterLink :to="`/organizations/${item.id}`" @click.stop>{{ item.name }}</RouterLink>
                </th>
                <td>{{ item.contactEmail }}</td>
                <td>{{ regionNames.of(item.country) ?? item.country }}</td>
                <td class="clinics-cell">
                  <span class="clinics-text" :title="clinicSummary(item)">{{ clinicSummary(item) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="pager">
          <p>Showing {{ rangeStart }}–{{ rangeEnd }} of {{ total }}</p>
          <div class="pager-actions page-controls">
            <AppButton variant="secondary" size="sm" :disabled="page <= 1" @click="changePage(page - 1)">Previous</AppButton>
            <span>Page {{ page }} of {{ pageCount }}</span>
            <AppButton variant="secondary" size="sm" :disabled="page >= pageCount" @click="changePage(page + 1)">Next</AppButton>
          </div>
        </div>
      </div>
    </template>
  </PageContainer>
</template>

<style scoped>
.table-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.organisation-row {
  cursor: pointer;
}

.organisation-row:hover {
  background: var(--color-surface-muted);
}

.organisation-row a {
  font-weight: 700;
  text-decoration: none;
}

.organisation-row a:hover {
  text-decoration: underline;
}

.clinics-cell {
  width: 36%;
  max-width: 0;
}

.clinics-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.organisation-search {
  flex: 1 1 420px;
  width: min(100%, 520px);
  min-width: min(100%, 420px);
}

@media (max-width: 720px) {
  .organisation-search {
    flex: 0 1 auto;
    width: 100%;
    min-width: 0;
  }
}

.page-controls {
  align-items: center;
  justify-content: space-between;
  width: min(100%, 320px);
}

@media (max-width: 720px) {
  .page-controls {
    width: 100%;
  }
}

.page-controls > span {
  flex: 1;
  text-align: center;
  white-space: nowrap;
}

.create-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0 14px;
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: white;
  font-weight: 700;
  text-decoration: none;
}
</style>
