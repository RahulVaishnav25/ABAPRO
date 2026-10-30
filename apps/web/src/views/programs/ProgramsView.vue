<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { careStatusLabel, type ClientDirectoryItem, type ProgramSummary } from '@abapro/shared';
import { clientDirectoryRequest } from '@/api/clients';
import { programsRequest } from '@/api/programs';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { careStatusTone, formatShortDate } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import { useLoader } from '@/lib/loader';

const auth = useAuthStore();
const router = useRouter();

const programs = ref<ProgramSummary[]>([]);
const clients = ref<ClientDirectoryItem[]>([]);

const page = ref(1);
const pageSize = 20;
const search = ref('');
const status = ref('');
const clientId = ref('');
const sort = ref('title');
const direction = ref<'asc' | 'desc'>('asc');
let searchTimer = 0;

const canEdit = computed(() => auth.can('programs.edit'));

const clientOptions = computed(() => [
  { value: '', label: 'Any client' },
  ...clients.value.map((c) => ({ value: c.id, label: c.displayName })),
]);

const filteredPrograms = computed(() => {
  const q = search.value.trim().toLowerCase();
  const st = status.value;
  const cid = clientId.value;

  return programs.value.filter((p) => {
    if (st && p.status !== st) return false;
    if (cid && p.clientId !== cid) return false;
    if (q) {
      const matchTitle = (p.title || '').toLowerCase().includes(q);
      const matchClient = (p.clientName || '').toLowerCase().includes(q);
      const matchDomain = (p.domain || '').toLowerCase().includes(q);
      const matchProcedure = (p.measurementProcedure || p.measurementType || '').toLowerCase().includes(q);
      if (!matchTitle && !matchClient && !matchDomain && !matchProcedure) return false;
    }
    return true;
  });
});

const sortedPrograms = computed(() => {
  const list = [...filteredPrograms.value];
  const dir = direction.value === 'asc' ? 1 : -1;
  const key = sort.value;

  list.sort((a, b) => {
    if (key === 'title') {
      return dir * (a.title || '').localeCompare(b.title || '');
    }
    if (key === 'client') {
      return dir * (a.clientName || '').localeCompare(b.clientName || '');
    }
    if (key === 'domain') {
      return dir * (a.domain || '').localeCompare(b.domain || '');
    }
    if (key === 'procedure') {
      const procA = a.measurementProcedure || a.measurementType || '';
      const procB = b.measurementProcedure || b.measurementType || '';
      return dir * procA.localeCompare(procB);
    }
    if (key === 'targets') {
      return dir * ((a.targetCount ?? 0) - (b.targetCount ?? 0));
    }
    if (key === 'status') {
      return dir * (a.status || '').localeCompare(b.status || '');
    }
    if (key === 'implemented') {
      const dateA = a.dateImplemented || '';
      const dateB = b.dateImplemented || '';
      return dir * dateA.localeCompare(dateB);
    }
    if (key === 'mastered') {
      return dir * (a.dateMastered || '').localeCompare(b.dateMastered || '');
    }
    return 0;
  });

  return list;
});

const total = computed(() => sortedPrograms.value.length);
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
const rangeStart = computed(() => (total.value === 0 ? 0 : (page.value - 1) * pageSize + 1));
const rangeEnd = computed(() => Math.min(page.value * pageSize, total.value));
const pagedItems = computed(() => {
  const start = (page.value - 1) * pageSize;
  return sortedPrograms.value.slice(start, start + pageSize);
});

function toggleSort(key: string): void {
  if (sort.value === key) {
    direction.value = direction.value === 'asc' ? 'desc' : 'asc';
  } else {
    sort.value = key;
    direction.value = key === 'implemented' || key === 'mastered' ? 'desc' : 'asc';
  }
  page.value = 1;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return formatShortDate(value);
  } catch {
    return value;
  }
}

const { loading, error, load } = useLoader(async () => {
  programs.value = await programsRequest();

  try {
    const clientsData = await clientDirectoryRequest({ pageSize: 50 });
    clients.value = clientsData.items;
  } catch {
    clients.value = [];
  }
}, 'Programs could not be loaded.');

watch([status, clientId], () => {
  page.value = 1;
});

watch(search, () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    page.value = 1;
  }, 250);
});

onMounted(() => void load());
</script>

<template>
  <PageContainer>
    <nav class="program-module-tabs" aria-label="Programs navigation">
      <RouterLink to="/programs" class="module-tab-link is-active">
        Programs
      </RouterLink>
      <RouterLink to="/programs/tasks" class="module-tab-link">
        Tasks
      </RouterLink>
    </nav>

    <PageHeader title="Programs" description="Search and manage clinical programs and task mastery.">
      <template #actions>
        <AppButton variant="secondary" @click="router.push('/programs/tasks')">View Tasks</AppButton>
        <AppButton v-if="canEdit" @click="router.push('/programs/new')">New program</AppButton>
      </template>
    </PageHeader>

    <div class="filter-bar">
      <AppInput v-model="search" label="Search" placeholder="Program name, client, or domain" />
      <AppSelect
        v-model="status"
        label="Status"
        :options="[
          { value: '', label: 'Any status' },
          { value: 'in_treatment', label: 'In Treatment' },
          { value: 'maintenance', label: 'Maintenance' },
          { value: 'on_hold', label: 'On Hold' },
          { value: 'mastered', label: 'Mastered' },
        ]"
      />
      <AppSelect v-model="clientId" label="Client" :options="clientOptions" />
    </div>

    <SkeletonBlock v-if="loading" height="240px" />
    <ErrorState v-else-if="error" title="Program directory unavailable" :description="error" @retry="load" />
    <EmptyState
      v-else-if="filteredPrograms.length === 0"
      title="No programs match"
      description="Create a program or adjust your filters."
    />
    <div v-else class="table-wrap panel">
      <table>
        <caption>Program directory</caption>
        <thead>
          <tr>
            <th><button type="button" @click="toggleSort('title')">Program name</button></th>
            <th><button type="button" @click="toggleSort('client')">Client</button></th>
            <th><button type="button" @click="toggleSort('domain')">Domain</button></th>
            <th><button type="button" @click="toggleSort('procedure')">Measurement procedure</button></th>
            <th><button type="button" @click="toggleSort('targets')">Tasks</button></th>
            <th><button type="button" @click="toggleSort('status')">Status</button></th>
            <th><button type="button" @click="toggleSort('implemented')">Date implemented</button></th>
            <th><button type="button" @click="toggleSort('mastered')">Date mastered</button></th>
            <th class="actions-col">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="program in pagedItems" :key="program.id">
            <td>
              <RouterLink class="program-link" :to="`/programs/${program.id}`">
                <strong>{{ program.title }}</strong>
              </RouterLink>
            </td>
            <td>
              <RouterLink v-if="program.clientId" class="client-link" :to="`/clients/${program.clientId}`">
                {{ program.clientName || 'Unknown client' }}
              </RouterLink>
              <span v-else>{{ program.clientName || '—' }}</span>
            </td>
            <td>{{ program.domain || '—' }}</td>
            <td>{{ program.measurementProcedure || program.measurementType || '—' }}</td>
            <td>{{ program.targetCount }}</td>
            <td>
              <StatusBadge :tone="careStatusTone(program.status)" :label="careStatusLabel(program.status)" />
            </td>
            <td>{{ formatDate(program.dateImplemented) }}</td>
            <td>{{ formatDate(program.dateMastered) }}</td>
            <td>
              <div class="row-actions">
                <AppButton size="sm" variant="secondary" @click="router.push(`/programs/${program.id}`)">View</AppButton>
                <AppButton v-if="canEdit" size="sm" variant="secondary" @click="router.push(`/programs/${program.id}/edit`)">Edit</AppButton>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="!loading && !error && filteredPrograms.length > 0" class="pager">
      <span>Showing {{ rangeStart }}–{{ rangeEnd }} of {{ total }}</span>
      <AppButton variant="secondary" size="sm" :disabled="page <= 1" @click="page -= 1">Previous</AppButton>
      <span>Page {{ page }} of {{ pageCount }}</span>
      <AppButton variant="secondary" size="sm" :disabled="page >= pageCount" @click="page += 1">Next</AppButton>
    </div>
  </PageContainer>
</template>

<style scoped>
.program-module-tabs {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 20px;
}

.module-tab-link {
  display: inline-flex;
  align-items: center;
  padding: 8px 16px;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-decoration: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}

.module-tab-link:hover {
  color: var(--color-ink);
}

.module-tab-link.is-active {
  color: var(--color-primary-ink);
  border-bottom-color: var(--color-primary);
}

.table-wrap {
  overflow-x: auto;
  padding: 12px;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  text-align: left;
  vertical-align: middle;
  padding: 10px 8px;
  border-bottom: 1px solid var(--color-border);
}

th button {
  border: 0;
  background: transparent;
  font-weight: 700;
  padding: 0;
  cursor: pointer;
  color: inherit;
}

caption {
  text-align: left;
  font-weight: 700;
  margin-bottom: 8px;
}

.program-link {
  text-decoration: none;
  color: inherit;
  display: inline-block;
}

.program-link:hover strong,
.client-link:hover {
  text-decoration: underline;
}

.client-link {
  text-decoration: none;
  color: var(--color-primary, inherit);
}

.pager {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  color: var(--color-text-muted);
}

.row-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.actions-col {
  width: 1%;
  white-space: nowrap;
}
</style>
