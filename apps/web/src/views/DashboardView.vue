<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { DashboardResponse, PlatformDashboard, SessionStatus } from '@abapro/shared';
import { dashboardRequest, platformDashboardRequest } from '@/api/resources';
import { clinicsByCountryOption, platformSessionTrendOption } from '@/charts/platform-dashboard';
import { sessionTrendOption } from '@/charts/session-trend';
import AppButton from '@/components/ui/AppButton.vue';
import AppCheckbox from '@/components/ui/AppCheckbox.vue';
import AppRadioGroup from '@/components/ui/AppRadioGroup.vue';
import AppTable from '@/components/ui/AppTable.vue';
import AppTabs from '@/components/ui/AppTabs.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import FilterBar from '@/components/ui/FilterBar.vue';
import GraphContainer from '@/components/ui/GraphContainer.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import type { TableColumn } from '@/components/ui/types';
import { formatDateTime, formatShortDate, formatTime, sessionStatusLabel, sessionStatusTone } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const route = useRoute();
const platformView = computed(() => route.name === 'platform-dashboard');
const dashboard = ref<DashboardResponse | null>(null);
const portal = ref<PlatformDashboard | null>(null);
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const loading = ref(true);
const error = ref('');
const statusFilter = ref('all');
const compactRows = ref(false);
const tab = ref('sessions');

const tabs = [
  { id: 'sessions', label: 'Recent sessions' },
  { id: 'activity', label: 'Recent activity' },
];

const statusOptions = [
  { value: 'all', label: 'All' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
];

const columns: TableColumn[] = [
  { key: 'clientCode', label: 'Client', sortable: true },
  { key: 'therapistName', label: 'Therapist', sortable: true },
  { key: 'service', label: 'Service', sortable: true },
  { key: 'startTime', label: 'Time', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
];

const filteredSessions = computed(() => {
  const sessions = dashboard.value?.recentSessions ?? [];
  if (statusFilter.value === 'all') {
    return sessions;
  }
  return sessions.filter((session) => session.status === statusFilter.value);
});

const tableRows = computed<Record<string, unknown>[]>(() =>
  filteredSessions.value.map((session) => ({
    id: session.id,
    clientCode: session.clientCode,
    therapistName: session.therapistName,
    service: session.service,
    startTime: session.startTime,
    status: session.status,
  })),
);

const chartOption = computed(() => (dashboard.value ? sessionTrendOption(dashboard.value.sessionTrend) : null));
const chartSummary = computed(() =>
  (dashboard.value?.sessionTrend ?? [])
    .map((point) => `${point.date}: ${point.completed} completed, ${point.scheduled} scheduled`)
    .join('. '),
);
const portalMetrics = computed(() => {
  if (!portal.value) return [];
  return [
    { key: 'organisations', label: 'Organisations', value: portal.value.organisations, detail: 'On this portal' },
    { key: 'clinics', label: 'Clinics', value: portal.value.clinics, detail: 'Across every organisation' },
    { key: 'clients', label: 'Clients', value: portal.value.clients, detail: `${portal.value.activeClients} active` },
  ];
});
const countryOption = computed(() =>
  portal.value ? clinicsByCountryOption(portal.value.clinicsByCountry, (code) => regionNames.of(code) ?? code) : null,
);
const countrySummary = computed(() =>
  (portal.value?.clinicsByCountry ?? []).map((point) => `${regionNames.of(point.country) ?? point.country}: ${point.clinics}`).join('. '),
);
const portalTrendOption = computed(() => (portal.value ? platformSessionTrendOption(portal.value.sessionTrend) : null));
const portalTrendSummary = computed(() =>
  (portal.value?.sessionTrend ?? [])
    .map((point) => `${formatShortDate(point.date)}: ${point.completed} completed, ${point.scheduled} scheduled, ${point.inProgress} in progress`)
    .join('. '),
);

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    if (platformView.value) {
      portal.value = await platformDashboardRequest();
      dashboard.value = null;
    } else {
      dashboard.value = await dashboardRequest();
      portal.value = null;
    }
  } catch (loadError) {
    dashboard.value = null;
    portal.value = null;
    error.value = loadError instanceof Error ? loadError.message : 'The dashboard could not be loaded.';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});

watch(platformView, () => {
  void load();
});

watch(
  () => auth.user?.organization?.id,
  (next, previous) => {
    if (!platformView.value && next && previous && next !== previous) {
      void load();
    }
  },
);

function isSessionStatus(value: unknown): value is SessionStatus {
  return value === 'scheduled' || value === 'in_progress' || value === 'completed';
}
</script>

<template>
  <PageContainer>
    <PageHeader
      title="Dashboard"
      :description="platformView ? 'Counts for every organisation, clinic, client, and session on this portal.' : 'Operational counts for the signed-in scope. Figures on this page are synthetic until clinical queries are connected.'"
    >
      <template #actions>
        <AppButton variant="secondary" :loading="loading" @click="load">Refresh</AppButton>
      </template>
    </PageHeader>

    <ErrorState v-if="error" title="Dashboard unavailable" :description="error" @retry="load" />

    <template v-else-if="platformView">
      <section class="metric-grid" aria-label="Portal counts">
        <template v-if="loading">
          <article v-for="index in 3" :key="index" class="metric-card">
            <SkeletonBlock width="70%" />
            <SkeletonBlock width="40%" height="32px" />
            <SkeletonBlock width="55%" />
          </article>
        </template>
        <article v-for="metric in portalMetrics" v-else :key="metric.key" class="metric-card">
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
          <small>{{ metric.detail }}</small>
        </article>
      </section>
      <GraphContainer
        title="Clinics by country"
        description="Each clinic is counted in its organisation's country."
        :option="countryOption"
        :summary="countrySummary"
        :loading="loading"
      />
      <GraphContainer
        title="Session trend"
        description="Sessions started over the last 14 days, counted in UTC."
        :option="portalTrendOption"
        :summary="portalTrendSummary"
        :loading="loading"
      />
    </template>

    <template v-else>
      <div v-if="dashboard" class="notice" role="status">
        <StatusBadge label="Synthetic data" tone="warning" />
        <div>
          <strong>{{ dashboard.scopeLabel }}</strong>
          <p>
            {{ dashboard.disclaimer }} Generated {{ formatDateTime(dashboard.generatedAt, dashboard.timezone) }} for
            {{ dashboard.organizationName }}.
          </p>
        </div>
      </div>

      <section class="metric-grid" aria-label="Summary counts">
        <template v-if="loading">
          <article v-for="index in 5" :key="index" class="metric-card">
            <SkeletonBlock width="70%" />
            <SkeletonBlock width="40%" height="32px" />
            <SkeletonBlock width="55%" />
          </article>
        </template>
        <template v-else>
          <article v-for="metric in dashboard?.metrics ?? []" :key="metric.key" class="metric-card">
            <span>{{ metric.label }}</span>
            <strong>{{ metric.value }}</strong>
            <small>{{ metric.detail }}</small>
          </article>
        </template>
      </section>

      <GraphContainer
        title="Session trend"
        description="Completed and scheduled sessions over the last seven days."
        :option="chartOption"
        :summary="chartSummary"
        :loading="loading"
        source-label="Synthetic development data"
      />

      <AppTabs v-model="tab" label="Dashboard detail" :tabs="tabs" />

      <div v-if="tab === 'sessions'" class="stack" role="tabpanel" aria-labelledby="tab-sessions">
        <FilterBar>
          <AppRadioGroup v-model="statusFilter" name="session-status" label="Status" :options="statusOptions" />
          <AppCheckbox v-model="compactRows" label="Compact rows" />
        </FilterBar>
        <AppTable
          :columns="columns"
          :rows="tableRows"
          row-key="id"
          caption="Recent sessions"
          search-placeholder="Search sessions"
          :density="compactRows ? 'compact' : 'comfortable'"
          :loading="loading"
        >
          <template #cell-startTime="{ value }">
            {{ formatTime(String(value), dashboard?.timezone ?? 'UTC') }}
          </template>
          <template #cell-status="{ value }">
            <StatusBadge
              v-if="isSessionStatus(value)"
              :label="sessionStatusLabel(value)"
              :tone="sessionStatusTone(value)"
            />
          </template>
        </AppTable>
      </div>

      <section v-else class="panel activity-panel" role="tabpanel" aria-labelledby="tab-activity">
        <h2 class="visually-hidden">Recent activity</h2>
        <ul v-if="dashboard" class="activity-list">
          <li v-for="item in dashboard.recentActivity" :key="item.id">
            <time :datetime="item.at">{{ formatDateTime(item.at, dashboard.timezone) }}</time>
            <div>
              <strong>{{ item.actor }}</strong>
              <p>{{ item.summary }}</p>
            </div>
          </li>
        </ul>
        <SkeletonBlock v-else height="120px" />
      </section>
    </template>
  </PageContainer>
</template>

<style scoped>
.activity-panel {
  padding: 8px 16px;
}

.metric-card :deep(.skeleton) {
  margin-top: 8px;
}
</style>
