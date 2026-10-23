<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { RouterLink, useRouter } from 'vue-router';
import type { ClinicDirectoryItem, ClinicDirectoryPage } from '@abapro/shared';
import { apiRequest } from '@/api/client';
import { displayStoredAddress } from '@/components/address/postal-address';
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
const auth = useAuthStore();
const platformAdmin = computed(() => auth.user?.platformAdmin === true);
const loading = ref(true);
const error = ref('');
const search = ref('');
const organizationId = ref('');
const country = ref('');
const page = ref(1);
const pageSize = 8;
const total = ref(0);
const countries = ref<string[]>([]);
const organizations = ref<Array<{ id: string; name: string }>>([]);
const items = ref<ClinicDirectoryItem[]>([]);
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
let searchTimer = 0;

const organizationOptions = computed(() => [
  { value: '', label: 'All organisations' },
  ...organizations.value.map((organization) => ({ value: organization.id, label: organization.name })),
]);
const countryOptions = computed(() => [
  { value: '', label: 'All countries' },
  ...countries.value.map((code) => ({ value: code, label: regionNames.of(code) ?? code })),
]);
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
const rangeStart = computed(() => (total.value === 0 ? 0 : (page.value - 1) * pageSize + 1));
const rangeEnd = computed(() => Math.min(page.value * pageSize, total.value));
const filtered = computed(() => Boolean(search.value.trim() || organizationId.value || country.value));

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
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
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'Clinics could not be loaded.';
  } finally {
    loading.value = false;
  }
}

function childSummary(count: number): string {
  if (count === 0) return 'No clients';
  return `${count} ${count === 1 ? 'client' : 'clients'}`;
}

function locationLabel(item: ClinicDirectoryItem): string {
  return displayStoredAddress(item.address, item.country) || item.location;
}

function openClinic(id: string): void {
  void router.push(`/clinics/${id}`);
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
    <PageHeader
      title="Clinics"
      :description="platformAdmin ? 'Every clinic on this portal, with the organisation it belongs to. Open one to see its details and clients.' : 'Clinics in your organisation. Open one to see its details and clients.'"
    />
    <FilterBar>
      <AppInput v-model="search" class="clinic-search" label="Search" placeholder="Clinic, organisation, or location" />
      <AppSelect v-if="platformAdmin" v-model="organizationId" label="Organisation" :options="organizationOptions" />
      <AppSelect v-if="platformAdmin" v-model="country" label="Country" :options="countryOptions" />
    </FilterBar>
    <SkeletonBlock v-if="loading" height="220px" />
    <ErrorState v-else-if="error" title="Clinics unavailable" :description="error" @retry="load" />
    <template v-else>
      <EmptyState
        v-if="total === 0"
        :title="filtered ? 'No clinics match' : 'No clinics yet'"
        :description="filtered ? 'Change the search, organisation, or country filter.' : 'Clinics appear here after an organisation is created.'"
      />
      <div v-else class="table-card">
        <div class="table-scroll">
          <table class="data-table">
            <caption class="visually-hidden">Clinics</caption>
            <thead>
              <tr>
                <th scope="col">Clinic</th>
                <th scope="col">Organisation</th>
                <th scope="col">Location</th>
                <th scope="col">Country</th>
                <th scope="col">Clients</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in items" :key="item.id" class="clinic-row" @click="openClinic(item.id)">
                <th scope="row">
                  <RouterLink :to="`/clinics/${item.id}`" @click.stop>{{ item.name }}</RouterLink>
                </th>
                <td>
                  <RouterLink :to="`/organizations/${item.organizationId}`" @click.stop>{{ item.organizationName }}</RouterLink>
                </td>
                <td class="location-cell">
                  <span class="location-text" :title="locationLabel(item)">{{ locationLabel(item) }}</span>
                </td>
                <td>{{ regionNames.of(item.country) ?? item.country }}</td>
                <td class="children-cell">{{ childSummary(item.childCount) }}</td>
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

.clinic-row {
  cursor: pointer;
}

.clinic-row:hover {
  background: var(--color-surface-muted);
}

.clinic-row a {
  font-weight: 700;
  text-decoration: none;
}

.clinic-row a:hover {
  text-decoration: underline;
}

.location-cell {
  width: 28%;
  max-width: 0;
}

.location-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.children-cell {
  white-space: nowrap;
}

.clinic-search {
  flex: 1 1 420px;
  width: min(100%, 520px);
  min-width: min(100%, 420px);
}

.page-controls {
  align-items: center;
  justify-content: space-between;
  width: min(100%, 320px);
}

.page-controls > span {
  flex: 1;
  text-align: center;
  white-space: nowrap;
}

@media (max-width: 720px) {
  .clinic-search {
    flex: 0 1 auto;
    width: 100%;
    min-width: 0;
  }

  .page-controls {
    width: 100%;
  }
}
</style>
