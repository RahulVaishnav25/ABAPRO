<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { DashboardMetric, DashboardResponse, PlatformDashboard } from '@abapro/shared';
import { dashboardRequest, platformDashboardRequest } from '@/api/resources';
import { clinicsByCountryOption } from '@/charts/platform-dashboard';
import { countryLabel } from '@/components/address/postal-address';
import AppIcon from '@/components/navigation/AppIcon.vue';
import AppButton from '@/components/ui/AppButton.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import GraphContainer from '@/components/ui/GraphContainer.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { formatDateTime, formatNumber } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import { errorMessage } from '@/lib/loader';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const { t, te } = useI18n();
const platformView = computed(() => route.name === 'platform-dashboard');
const dashboard = ref<DashboardResponse | null>(null);
const portal = ref<PlatformDashboard | null>(null);
const loading = ref(true);
const error = ref('');

const METRIC_ICONS: Record<string, string> = {
  organisations: 'organisations',
  clinics: 'clinics',
  clients: 'clients',
  activeClients: 'clients',
  activeTherapists: 'team',
  programsInProgress: 'programs',
};

const portalMetrics = computed(() => {
  if (!portal.value) return [];
  return [
    { key: 'organisations', label: t('dashboard.platform.organisations'), value: portal.value.organisations, detail: t('dashboard.platform.organisationsDetail'), to: '/organizations' },
    { key: 'clinics', label: t('dashboard.platform.clinics'), value: portal.value.clinics, detail: t('dashboard.platform.clinicsDetail'), to: '/clinics' },
    { key: 'clients', label: t('dashboard.platform.clients'), value: portal.value.clients, detail: t('dashboard.platform.clientsDetail', { n: formatNumber(portal.value.activeClients) }), to: '' },
  ];
});

/** Sample metrics arrive with English labels; known ones are shown in the user's language. */
function metricText(metric: DashboardMetric, part: 'label' | 'detail'): string {
  const key = `dashboard.metrics.${dashboard.value?.scope}.${metric.key}.${part}`;
  return te(key) ? t(key) : metric[part];
}

const scopeLabel = computed(() => {
  const scope = dashboard.value?.scope;
  return scope && te(`dashboard.scopes.${scope}`) ? t(`dashboard.scopes.${scope}`) : dashboard.value?.scopeLabel ?? '';
});

const countryOption = computed(() =>
  portal.value ? clinicsByCountryOption(portal.value.clinicsByCountry, (code) => countryLabel(code), t('dashboard.platform.clinics')) : null,
);
const countrySummary = computed(() =>
  (portal.value?.clinicsByCountry ?? []).map((point) => `${countryLabel(point.country)}: ${point.clinics}`).join('. '),
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
    error.value = errorMessage(loadError, t('dashboard.error'));
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
    <PageHeader :title="t('dashboard.title')" :description="platformView ? t('dashboard.descriptionPlatform') : t('dashboard.description')">
      <template #actions>
        <AppButton v-if="platformView" variant="secondary" @click="router.push('/programs/tasks')">{{ t('dashboard.openTasks') }}</AppButton>
        <AppButton variant="secondary" icon="history" :loading="loading" @click="load">{{ t('dashboard.refresh') }}</AppButton>
      </template>
    </PageHeader>

    <ErrorState v-if="error" :title="t('dashboard.unavailable')" :description="error" @retry="load" />

    <div v-else class="dashboard">
      <template v-if="platformView">
        <section class="metrics" :aria-label="t('dashboard.portalCounts')">
          <template v-if="loading">
            <div v-for="index in 3" :key="index" class="metric">
              <SkeletonBlock width="40%" />
              <SkeletonBlock width="30%" height="32px" />
            </div>
          </template>
          <template v-else>
            <component
              :is="metric.to ? 'RouterLink' : 'div'"
              v-for="metric in portalMetrics"
              :key="metric.key"
              :to="metric.to || undefined"
              class="metric"
              :class="{ 'is-link': metric.to }"
            >
              <span class="metric-icon" aria-hidden="true"><AppIcon :name="METRIC_ICONS[metric.key] ?? 'dashboard'" :size="20" /></span>
              <span class="metric-label">{{ metric.label }}</span>
              <strong class="metric-value">{{ formatNumber(metric.value) }}</strong>
              <span class="metric-detail">
                {{ metric.detail }}
                <AppIcon v-if="metric.to" name="arrow-right" :size="14" class="flip-rtl" />
              </span>
            </component>
          </template>
        </section>
        <GraphContainer
          :title="t('dashboard.byCountry')"
          :description="t('dashboard.byCountryHint')"
          :option="countryOption"
          :summary="countrySummary"
          :loading="loading"
        />
      </template>

      <template v-else>
        <div v-if="dashboard" class="notice sample-notice" role="status">
          <StatusBadge :label="t('dashboard.sample')" tone="warning" />
          <div>
            <strong>{{ scopeLabel }}</strong>
            <p>
              {{ t('dashboard.disclaimer') }}
              {{ t('dashboard.generated', { date: formatDateTime(dashboard.generatedAt), organisation: dashboard.organizationName }) }}
            </p>
          </div>
        </div>

        <section class="metrics" :aria-label="t('dashboard.summaryCounts')">
          <template v-if="loading">
            <div v-for="index in 3" :key="index" class="metric">
              <SkeletonBlock width="40%" />
              <SkeletonBlock width="30%" height="32px" />
            </div>
          </template>
          <div v-for="metric in dashboard?.metrics ?? []" v-else :key="metric.key" class="metric">
            <span class="metric-icon" aria-hidden="true"><AppIcon :name="METRIC_ICONS[metric.key] ?? 'dashboard'" :size="20" /></span>
            <span class="metric-label">{{ metricText(metric, 'label') }}</span>
            <strong class="metric-value">{{ formatNumber(metric.value) }}</strong>
            <span class="metric-detail">{{ metricText(metric, 'detail') }}</span>
          </div>
        </section>

        <section class="settings-card" aria-labelledby="recent-activity">
          <h2 id="recent-activity" class="activity-title">{{ t('dashboard.activity') }}</h2>
          <p v-if="dashboard && dashboard.recentActivity.length === 0" class="activity-empty">{{ t('dashboard.noActivity') }}</p>
          <ol v-else-if="dashboard" class="activity-list">
            <li v-for="item in dashboard.recentActivity" :key="item.id">
              <span class="activity-dot" aria-hidden="true"></span>
              <div>
                <p class="activity-summary"><strong>{{ item.actor }}</strong> <span dir="auto">{{ item.summary }}</span></p>
                <time class="activity-time" :datetime="item.at">{{ formatDateTime(item.at) }}</time>
              </div>
            </li>
          </ol>
          <SkeletonBlock v-else height="120px" />
        </section>
      </template>
    </div>
  </PageContainer>
</template>

<style scoped>
.dashboard {
  display: grid;
  gap: var(--space-5);
}

.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-4);
}

.metric {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-areas:
    'icon label'
    'icon value'
    'icon detail';
  column-gap: var(--space-4);
  align-items: center;
  padding: var(--space-5);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  color: inherit;
  text-decoration: none;
  transition: border-color var(--transition), box-shadow var(--transition);
}

.metric.is-link:hover {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-sm);
}

.metric.is-link:focus-visible {
  outline: none;
  box-shadow: var(--focus);
}

.metric-icon {
  grid-area: icon;
  display: grid;
  place-items: center;
  align-self: start;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  background: var(--color-primary-soft);
  color: var(--color-primary-ink);
}

.metric-label {
  grid-area: label;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: 500;
}

.metric-value {
  grid-area: value;
  color: var(--color-ink);
  font-size: var(--text-2xl);
  font-weight: 650;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.metric-detail {
  grid-area: detail;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}

.is-link .metric-detail {
  color: var(--color-primary-ink);
  font-weight: 600;
}

.sample-notice {
  align-items: center;
}

.activity-title {
  font-size: var(--text-md);
}

.activity-empty {
  color: var(--color-text-muted);
}

.activity-list {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.activity-list li {
  display: flex;
  gap: var(--space-3);
}

.activity-dot {
  flex: none;
  width: 10px;
  height: 10px;
  margin-top: 6px;
  border: 2px solid var(--color-primary);
  border-radius: 50%;
}

.activity-summary {
  color: var(--color-text);
}

.activity-time {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}
</style>
