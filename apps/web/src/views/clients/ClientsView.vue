<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { CARE_STATUSES, type ClientDirectoryItem, type StaffOption } from '@abapro/shared';
import { clientAssigneesRequest, clientDirectoryRequest, seedDemoClientsRequest } from '@/api/clients';
import ClientAvatar from '@/components/clients/ClientAvatar.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTable from '@/components/ui/AppTable.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { formatDayOf } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { errorMessage, useLoader } from '@/lib/loader';

const auth = useAuthStore();
const toast = useToastStore();
const router = useRouter();
const { t } = useI18n();
const items = ref<ClientDirectoryItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const search = ref('');
const status = ref('');
const therapistId = ref('');
const supervisorId = ref('');
const programStatus = ref('');
const sort = ref('name');
const direction = ref<'asc' | 'desc'>('asc');
const staff = ref<StaffOption[]>([]);
let searchTimer = 0;

const canCreate = computed(() => auth.can('clients.create'));
const statusOptions = computed(() => [
  { value: '', label: t('clients.anyStatus') },
  { value: 'active', label: t('clients.active') },
  { value: 'inactive', label: t('clients.inactive') },
]);
const programStatusOptions = computed(() => [
  { value: '', label: t('clients.anyProgramStatus') },
  ...CARE_STATUSES.map((value) => ({ value, label: t(`status.${value}`) })),
]);
const columns = computed(() => [
  { key: 'name', label: t('clients.columns.name'), sortable: true },
  { key: 'code', label: t('clients.columns.code'), sortable: true },
  { key: 'clinic', label: t('clients.columns.clinic') },
  { key: 'therapists', label: t('clients.columns.therapists') },
  { key: 'supervisors', label: t('clients.columns.supervisors') },
  { key: 'status', label: t('clients.columns.status'), sortable: true },
  { key: 'programs', label: t('clients.columns.programs'), sortable: true, align: 'end' as const },
  { key: 'created', label: t('clients.columns.created'), sortable: true },
]);
const rows = computed(() => items.value.map((client) => ({ ...client, key: client.id }) as unknown as Record<string, unknown>));
const therapistOptions = computed(() => [
  { value: '', label: t('clients.anyTherapist') },
  ...staff.value.filter((person) => person.role === 'therapist').map((person) => ({
    value: person.id,
    label: person.name,
  })),
]);
const supervisorOptions = computed(() => [
  { value: '', label: t('clients.anySupervisor') },
  ...staff.value.filter((person) => person.role === 'clinical_supervisor').map((person) => ({ value: person.id, label: person.name })),
]);

const { loading, error, load } = useLoader(async () => {
  const directory = await clientDirectoryRequest({
    q: search.value.trim(),
    status: status.value,
    therapistId: therapistId.value,
    supervisorId: supervisorId.value,
    programStatus: programStatus.value,
    sort: sort.value,
    direction: direction.value,
    page: page.value,
    pageSize,
  });
  items.value = directory.items;
  total.value = directory.total;
}, t('clients.error'));

function names(people: Array<{ name: string }>): string {
  return people.length ? people.map((person) => person.name).join(', ') : t('clients.none');
}

const client = (row: Record<string, unknown>) => row as unknown as ClientDirectoryItem;

function setPage(next: number): void {
  page.value = next;
  void load();
}

function toggleSort(key: string): void {
  if (sort.value === key) {
    direction.value = direction.value === 'asc' ? 'desc' : 'asc';
  } else {
    sort.value = key;
    direction.value = key === 'created' ? 'desc' : 'asc';
  }
  page.value = 1;
  void load();
}

async function addSamples(): Promise<void> {
  try {
    const result = await seedDemoClientsRequest();
    toast.push({
      tone: 'success',
      title: result.created ? t('clients.samplesAdded') : t('clients.samplesExist'),
      message: t('clients.samplesSynthetic'),
    });
    await load();
  } catch (seedError) {
    toast.push({
      tone: 'danger',
      title: t('clients.samplesNotAdded'),
      message: errorMessage(seedError, t('errors.generic')),
    });
  }
}

watch([status, therapistId, supervisorId, programStatus], () => {
  page.value = 1;
  void load();
});

watch(search, () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    page.value = 1;
    void load();
  }, 250);
});

onMounted(async () => {
  try {
    staff.value = await clientAssigneesRequest();
  } catch {
    staff.value = [];
  }
  await load();
});
</script>

<template>
  <PageContainer>
    <PageHeader :title="t('clients.title')" :description="t('clients.description')">
      <template #actions>
        <AppButton v-if="canCreate" variant="secondary" @click="addSamples">{{ t('clients.addSamples') }}</AppButton>
        <AppButton v-if="canCreate" icon="plus" @click="router.push('/clients/new')">{{ t('clients.newClient') }}</AppButton>
      </template>
    </PageHeader>
    <div class="filter-bar">
      <AppInput v-model="search" type="search" :label="t('clients.search')" :placeholder="t('clients.searchPlaceholder')" />
      <AppSelect v-model="status" :label="t('clients.columns.status')" :options="statusOptions" />
      <AppSelect v-model="therapistId" :label="t('clients.therapist')" :options="therapistOptions" />
      <AppSelect v-model="supervisorId" :label="t('clients.supervisor')" :options="supervisorOptions" />
      <AppSelect v-model="programStatus" :label="t('clients.programStatus')" :options="programStatusOptions" />
    </div>
    <ErrorState v-if="error" :title="t('clients.unavailable')" :description="error" @retry="load" />
    <AppTable
      v-else
      :caption="t('clients.caption')"
      :columns="columns"
      :rows="rows"
      row-key="key"
      :loading="loading && items.length === 0"
      :total="total"
      :page="page"
      :page-size="pageSize"
      :sort="sort"
      :direction="direction"
      :class="{ 'is-refreshing': loading && items.length > 0 }"
      @update:page="setPage"
      @sort="toggleSort"
    >
      <template #cell-name="{ row }">
        <RouterLink class="person" :to="`/clients/${client(row).id}`">
          <ClientAvatar :client-id="client(row).id" :initials="client(row).initials" :has-avatar="client(row).hasAvatar" :name="client(row).displayName" />
          <span class="person-names">
            <strong>{{ client(row).preferredName || client(row).displayName }}</strong>
            <small v-if="client(row).preferredName">{{ client(row).displayName }}</small>
          </span>
        </RouterLink>
      </template>
      <template #cell-code="{ row }"><span class="code">{{ client(row).clientCode }}</span></template>
      <template #cell-clinic="{ row }">
        <span class="person-names">
          <span>{{ client(row).clinicName || t('clients.notRecorded') }}</span>
          <small v-if="client(row).organizationName !== client(row).clinicName">{{ client(row).organizationName }}</small>
        </span>
      </template>
      <template #cell-therapists="{ row }">{{ names(client(row).therapists) }}</template>
      <template #cell-supervisors="{ row }">{{ names(client(row).supervisors) }}</template>
      <template #cell-status="{ row }">
        <StatusBadge :tone="client(row).status === 'active' ? 'success' : 'neutral'" :label="client(row).status === 'active' ? t('clients.active') : t('clients.inactive')" />
      </template>
      <template #cell-programs="{ row }">{{ client(row).activeProgramCount }}</template>
      <template #cell-created="{ row }">{{ formatDayOf(client(row).createdAt) }}</template>
      <template #empty>
        <EmptyState icon="clients" :title="t('clients.empty')" :description="t('clients.emptyHint')" />
      </template>
    </AppTable>
  </PageContainer>
</template>

<style scoped>
.person {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--color-ink);
  text-decoration: none;
}

.person:hover strong,
.person:focus-visible strong {
  color: var(--color-primary-ink);
  text-decoration: underline;
}

.person-names {
  display: grid;
  min-width: 0;
}

.person-names small {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.code {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

.is-refreshing {
  opacity: 0.6;
  transition: opacity 0.15s;
}
</style>
