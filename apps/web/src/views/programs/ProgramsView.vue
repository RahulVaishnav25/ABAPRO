<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { CARE_STATUSES, type ClientDirectoryItem, type ProgramSummary } from '@abapro/shared';
import { clientDirectoryRequest } from '@/api/clients';
import { programsRequest } from '@/api/programs';
import SessionHistoryDialog from '@/components/programs/SessionHistoryDialog.vue';
import ActionMenu, { type ActionMenuItem } from '@/components/ui/ActionMenu.vue';
import ProgramModuleTabs from '@/components/programs/ProgramModuleTabs.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTable from '@/components/ui/AppTable.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { careStatusTone, formatDate } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import { useLoader } from '@/lib/loader';

const auth = useAuthStore();
const router = useRouter();
const { t, te } = useI18n();

const programs = ref<ProgramSummary[]>([]);
const clients = ref<ClientDirectoryItem[]>([]);
const search = ref('');
const status = ref('');
const clientId = ref('');

const canEdit = computed(() => auth.can('programs.edit'));
// Organisation administrators, and super admins acting as one, see recording activity. The API enforces this too.
const canViewSessionHistory = computed(() => auth.user?.role === 'organization_admin');
const historyProgram = ref<ProgramSummary | null>(null);

const statusOptions = computed(() => [
  { value: '', label: t('programs.anyStatus') },
  ...CARE_STATUSES.map((value) => ({ value, label: t(`status.${value}`) })),
]);
const clientOptions = computed(() => [
  { value: '', label: t('programs.anyClient') },
  ...clients.value.map((c) => ({ value: c.id, label: c.displayName })),
]);
const columns = computed(() => [
  { key: 'title', label: t('programs.columns.title'), sortable: true },
  { key: 'client', label: t('programs.columns.client'), sortable: true },
  { key: 'domain', label: t('programs.columns.domain'), sortable: true },
  { key: 'procedure', label: t('programs.columns.procedure'), sortable: true },
  { key: 'targets', label: t('programs.columns.targets'), sortable: true, align: 'end' as const },
  { key: 'status', label: t('programs.columns.status'), sortable: true },
  { key: 'implemented', label: t('programs.columns.implemented'), sortable: true },
  { key: 'mastered', label: t('programs.columns.mastered'), sortable: true },
  { key: 'actions', label: t('programs.columns.actions') },
]);

/** Saved procedure names are translated when they are one of the standard ones. */
function procedureName(program: ProgramSummary): string {
  const procedure = program.measurementProcedure;
  if (procedure) return te(`programs.form.procedures.${procedure}`) ? t(`programs.form.procedures.${procedure}`) : procedure;
  return t(`programs.measurement.${program.measurementType}`);
}

const rows = computed(() => {
  const q = search.value.trim().toLowerCase();
  return programs.value
    .filter((p) => {
      if (status.value && p.status !== status.value) return false;
      if (clientId.value && p.clientId !== clientId.value) return false;
      if (!q) return true;
      return [p.title, p.clientName, p.domain, p.measurementProcedure || p.measurementType].some((value) => (value || '').toLowerCase().includes(q));
    })
    .sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    .map((p) => ({
      id: p.id,
      title: p.title,
      client: p.clientName || '',
      domain: p.domain || '',
      procedure: procedureName(p),
      targets: p.targetCount ?? 0,
      status: t(`status.${p.status}`),
      implemented: p.dateImplemented || '',
      mastered: p.dateMastered || '',
      program: p,
    }));
});

const programOf = (row: Record<string, unknown>) => row.program as ProgramSummary;

function rowActions(): ActionMenuItem[] {
  const items: ActionMenuItem[] = [{ key: 'view', label: t('programs.actions.view') }];
  if (canEdit.value) items.push({ key: 'edit', label: t('programs.actions.edit') });
  if (canViewSessionHistory.value) items.push({ key: 'history', label: t('programs.actions.history') });
  return items;
}

function onAction(program: ProgramSummary, key: string): void {
  if (key === 'view') void router.push(`/programs/${program.id}`);
  else if (key === 'edit') void router.push(`/programs/${program.id}/edit`);
  else if (key === 'history') historyProgram.value = program;
}

const { loading, error, load } = useLoader(async () => {
  programs.value = await programsRequest();

  try {
    const clientsData = await clientDirectoryRequest({ pageSize: 50 });
    clients.value = clientsData.items;
  } catch {
    clients.value = [];
  }
}, t('programs.error'));

onMounted(() => void load());
</script>

<template>
  <PageContainer>
    <ProgramModuleTabs />

    <PageHeader :title="t('programs.title')" :description="t('programs.description')">
      <template #actions>
        <AppButton v-if="canEdit" icon="plus" @click="router.push('/programs/new')">{{ t('programs.newProgram') }}</AppButton>
      </template>
    </PageHeader>

    <div class="filter-bar">
      <AppInput v-model="search" type="search" :label="t('programs.search')" :placeholder="t('programs.searchPlaceholder')" />
      <AppSelect v-model="status" :label="t('programs.status')" :options="statusOptions" />
      <AppSelect v-model="clientId" :label="t('programs.client')" :options="clientOptions" />
    </div>

    <ErrorState v-if="error" :title="t('programs.unavailable')" :description="error" @retry="load" />
    <AppTable
      v-else
      :caption="t('programs.caption')"
      :columns="columns"
      :rows="rows"
      row-key="id"
      :page-size="20"
      :searchable="false"
      :loading="loading"
    >
      <template #cell-title="{ row }">
        <RouterLink class="row-link" :to="`/programs/${row.id}`">{{ row.title }}</RouterLink>
      </template>
      <template #cell-client="{ row }">
        <RouterLink v-if="programOf(row).clientId" class="muted-link" :to="`/clients/${programOf(row).clientId}`">
          {{ row.client || t('programs.unknownClient') }}
        </RouterLink>
        <span v-else>{{ row.client || '—' }}</span>
      </template>
      <template #cell-domain="{ row }">{{ row.domain || '—' }}</template>
      <template #cell-status="{ row }">
        <StatusBadge :tone="careStatusTone(programOf(row).status)" :label="String(row.status)" />
      </template>
      <template #cell-implemented="{ row }">{{ formatDate(String(row.implemented)) }}</template>
      <template #cell-mastered="{ row }">{{ formatDate(String(row.mastered)) }}</template>
      <template #cell-actions="{ row }">
        <ActionMenu
          :label="t('programs.moreActions', { name: row.title })"
          :items="rowActions()"
          @select="onAction(programOf(row), $event)"
        />
      </template>
      <template #empty>
        <EmptyState icon="programs" :title="t('programs.empty')" :description="t('programs.emptyHint')" />
      </template>
    </AppTable>

    <SessionHistoryDialog
      :open="historyProgram !== null"
      :program-id="historyProgram?.id ?? null"
      :program-title="historyProgram?.title ?? ''"
      @close="historyProgram = null"
    />
  </PageContainer>
</template>

<style scoped>
.row-link {
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
</style>
