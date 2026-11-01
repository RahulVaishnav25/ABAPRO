<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { PERMISSIONS } from '@abapro/shared';
import AppTabs from '@/components/ui/AppTabs.vue';
import { useAuthStore } from '@/stores/auth';

/** The Teams and Parents tabs, shown to whoever may open each. */
const auth = useAuthStore();
const { t } = useI18n();
const tabs = computed(() =>
  [
    { id: 'teams', to: '/onboarding/teams', label: t('onboarding.tabs.teams'), show: auth.can(PERMISSIONS.teamView) },
    { id: 'parents', to: '/onboarding/parents', label: t('onboarding.tabs.parents'), show: auth.can(PERMISSIONS.guardiansManage) },
  ].filter((tab) => tab.show),
);
</script>

<template>
  <AppTabs :tabs="tabs" :label="t('onboarding.tabsLabel')" />
</template>
