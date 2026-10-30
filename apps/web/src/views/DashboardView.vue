<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { DashboardResponse, PlatformDashboard } from '@abapro/shared';
import { dashboardRequest, platformDashboardRequest } from '@/api/resources';
import { clinicsByCountryOption } from '@/charts/platform-dashboard';
import AppButton from '@/components/ui/AppButton.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import GraphContainer from '@/components/ui/GraphContainer.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { formatDateTime } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import { errorMessage } from '@/lib/loader';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const platformView = computed(() => route.name === 'platform-dashboard');
const dashboard = ref<DashboardResponse | null>(null);
const portal = ref<PlatformDashboard | null>(null);
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const loading = ref(true);
const error = ref('');
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
    error.value = errorMessage(loadError, 'The dashboard could not be loaded.');
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

</script>

<template>
  <PageContainer>
    <PageHeader
      title="Dashboard"
      :description="platformView ? 'Counts for every organisation, clinic, and client on this portal.' : 'Operational counts for the signed-in scope. Figures on this page are synthetic until clinical queries are connected.'"
    >
      <template #actions>
        <AppButton v-if="platformView" @click="router.push('/programs/tasks')">Open Tasks</AppButton>
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
        <article
          v-for="metric in portalMetrics"
          v-else
          :key="metric.key"
          class="metric-card"
          :class="{ 'is-clickable': metric.key === 'organisations' || metric.key === 'clinics' }"
          @click="metric.key === 'organisations' ? router.push('/organizations') : metric.key === 'clinics' ? router.push('/clinics') : null"
        >
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
          <article v-for="index in 3" :key="index" class="metric-card">
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

      <section class="panel activity-panel" aria-labelledby="recent-activity">
        <h2 id="recent-activity" class="activity-title">Recent activity</h2>
        <p v-if="dashboard && dashboard.recentActivity.length === 0" class="activity-empty">No recent activity.</p>
        <ul v-else-if="dashboard" class="activity-list">
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

.activity-title {
  margin: 8px 0;
  font-size: 1rem;
}

.activity-empty {
  margin: 0 0 8px;
  color: var(--color-text-muted);
}

.metric-card :deep(.skeleton) {
  margin-top: 8px;
}
</style>
