<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { ClientDirectoryItem, StaffOption } from '@abapro/shared';
import { clientAssigneesRequest, clientDirectoryRequest, seedDemoClientsRequest } from '@/api/clients';
import { ApiError } from '@/api/client';
import ClientAvatar from '@/components/clients/ClientAvatar.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { formatDateTime } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';

const auth = useAuthStore();
const toast = useToastStore();
const router = useRouter();
const loading = ref(true);
const error = ref('');
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

const timeZone = computed(() => auth.user?.organization?.timezone ?? 'UTC');
const canCreate = computed(() => auth.can('clients.create'));
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
const rangeStart = computed(() => (total.value === 0 ? 0 : (page.value - 1) * pageSize + 1));
const rangeEnd = computed(() => Math.min(page.value * pageSize, total.value));
const therapistOptions = computed(() => [
  { value: '', label: 'Any therapist' },
  ...staff.value.filter((person) => person.role === 'therapist' || person.role === 'clinical_supervisor').map((person) => ({
    value: person.id,
    label: person.name,
  })),
]);
const supervisorOptions = computed(() => [
  { value: '', label: 'Any supervisor' },
  ...staff.value.filter((person) => person.role === 'clinical_supervisor').map((person) => ({ value: person.id, label: person.name })),
]);

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
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
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'The client directory could not be loaded.';
  } finally {
    loading.value = false;
  }
}

function names(people: Array<{ name: string }>): string {
  return people.length ? people.map((person) => person.name).join(', ') : 'None';
}

function when(value: string | null): string {
  return value ? formatDateTime(value, timeZone.value) : 'None';
}

function toggleSort(key: string): void {
  if (sort.value === key) {
    direction.value = direction.value === 'asc' ? 'desc' : 'asc';
  } else {
    sort.value = key;
    direction.value = key === 'created' || key === 'session' ? 'desc' : 'asc';
  }
  page.value = 1;
  void load();
}

async function addSamples(): Promise<void> {
  try {
    const result = await seedDemoClientsRequest();
    toast.push({
      tone: 'success',
      title: result.created ? 'Sample clients added' : 'Sample clients already exist',
      message: 'These records are synthetic.',
    });
    await load();
  } catch (seedError) {
    toast.push({
      tone: 'danger',
      title: 'Samples were not added',
      message: seedError instanceof ApiError ? seedError.message : 'Try again.',
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
    <PageHeader title="Clients" description="Search the clients your role is allowed to open.">
      <template #actions>
        <AppButton v-if="canCreate" variant="secondary" @click="addSamples">Add sample clients</AppButton>
        <AppButton v-if="canCreate" @click="router.push('/clients/new')">New client</AppButton>
      </template>
    </PageHeader>
    <div class="filter-bar">
      <AppInput v-model="search" label="Search" placeholder="Name or client ID" />
      <AppSelect v-model="status" label="Status" :options="[{ value: '', label: 'Any status' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]" />
      <AppSelect v-model="therapistId" label="Therapist" :options="therapistOptions" />
      <AppSelect v-model="supervisorId" label="Supervisor" :options="supervisorOptions" />
      <AppSelect
        v-model="programStatus"
        label="Program status"
        :options="[
          { value: '', label: 'Any program status' },
          { value: 'active', label: 'Active program' },
          { value: 'paused', label: 'Paused program' },
          { value: 'completed', label: 'Completed program' },
          { value: 'discontinued', label: 'Discontinued program' },
        ]"
      />
    </div>
    <SkeletonBlock v-if="loading" height="240px" />
    <ErrorState v-else-if="error" title="Client directory unavailable" :description="error" @retry="load" />
    <EmptyState
      v-else-if="items.length === 0"
      title="No clients match"
      description="Create a client or add the synthetic sample records."
    />
    <div v-else class="table-wrap panel">
      <table>
        <caption>Client directory</caption>
        <thead>
          <tr>
            <th><button type="button" @click="toggleSort('name')">Name</button></th>
            <th><button type="button" @click="toggleSort('code')">Client ID</button></th>
            <th>Organisation</th>
            <th>Clinic</th>
            <th>Therapist</th>
            <th>Supervisor</th>
            <th><button type="button" @click="toggleSort('status')">Status</button></th>
            <th><button type="button" @click="toggleSort('programs')">Active programs</button></th>
            <th><button type="button" @click="toggleSort('session')">Latest session</button></th>
            <th><button type="button" @click="toggleSort('created')">Created</button></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="client in items" :key="client.id">
            <td>
              <RouterLink class="person" :to="`/clients/${client.id}`">
                <ClientAvatar :client-id="client.id" :initials="client.initials" :has-avatar="client.hasAvatar" :name="client.displayName" />
                <span>
                  <strong>{{ client.preferredName || client.displayName }}</strong>
                  <small v-if="client.preferredName">{{ client.displayName }}</small>
                </span>
              </RouterLink>
            </td>
            <td>{{ client.clientCode }}</td>
            <td>{{ client.organizationName }}</td>
            <td>{{ client.clinicName || 'Not recorded' }}</td>
            <td>{{ names(client.therapists) }}</td>
            <td>{{ client.supervisor?.name ?? 'None' }}</td>
            <td><StatusBadge :tone="client.status === 'active' ? 'success' : 'neutral'" :label="client.status === 'active' ? 'Active' : 'Inactive'" /></td>
            <td>{{ client.activeProgramCount }}</td>
            <td>{{ when(client.lastSessionAt) }}</td>
            <td>{{ when(client.createdAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="!loading && !error" class="pager">
      <span>Showing {{ rangeStart }}–{{ rangeEnd }} of {{ total }}</span>
      <AppButton variant="secondary" size="sm" :disabled="page <= 1" @click="page -= 1; load()">Previous</AppButton>
      <span>Page {{ page }} of {{ pageCount }}</span>
      <AppButton variant="secondary" size="sm" :disabled="page >= pageCount" @click="page += 1; load()">Next</AppButton>
    </div>
  </PageContainer>
</template>

<style scoped>
.table-wrap { overflow-x: auto; padding: 12px; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; vertical-align: top; padding: 10px 8px; border-bottom: 1px solid var(--color-border); }
th button { border: 0; background: transparent; font-weight: 700; padding: 0; }
caption { text-align: left; font-weight: 700; margin-bottom: 8px; }
.person { display: flex; gap: 10px; align-items: center; text-decoration: none; color: inherit; }
.person small, .pager { color: var(--color-text-muted); }
.person span { display: grid; }
.pager { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
</style>
