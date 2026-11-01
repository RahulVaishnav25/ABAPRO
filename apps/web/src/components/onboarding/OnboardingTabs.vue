<script setup lang="ts">
import { computed } from 'vue';
import { PERMISSIONS } from '@abapro/shared';
import AppTabs from '@/components/ui/AppTabs.vue';
import { useAuthStore } from '@/stores/auth';

/** The Teams and Parents tabs, shown to whoever may open each. */
const auth = useAuthStore();
const tabs = computed(() =>
  [
    { id: 'teams', to: '/onboarding/teams', label: 'Teams', show: auth.can(PERMISSIONS.teamView) },
    { id: 'parents', to: '/onboarding/parents', label: 'Parents', show: auth.can(PERMISSIONS.guardiansManage) },
  ].filter((tab) => tab.show),
);
</script>

<template>
  <AppTabs :tabs="tabs" label="Onboarding" />
</template>
