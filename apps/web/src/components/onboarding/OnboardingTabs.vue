<script setup lang="ts">
import { computed } from 'vue';
import { PERMISSIONS } from '@abapro/shared';
import { useAuthStore } from '@/stores/auth';

/** The Teams and Parents tabs, shown to whoever may open each. */
const auth = useAuthStore();
const tabs = computed(() =>
  [
    { to: '/onboarding/teams', label: 'Teams', show: auth.can(PERMISSIONS.teamView) },
    { to: '/onboarding/parents', label: 'Parents', show: auth.can(PERMISSIONS.guardiansManage) },
  ].filter((tab) => tab.show),
);
</script>

<template>
  <nav class="onboarding-tabs" aria-label="Onboarding">
    <RouterLink v-for="tab in tabs" :key="tab.to" :to="tab.to" class="onboarding-tab" active-class="is-active">
      {{ tab.label }}
    </RouterLink>
  </nav>
</template>

<style scoped>
.onboarding-tabs {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 20px;
}

.onboarding-tab {
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

.onboarding-tab:hover {
  color: var(--color-ink);
}

.onboarding-tab.is-active {
  color: var(--color-primary-ink);
  border-bottom-color: var(--color-primary);
}
</style>
