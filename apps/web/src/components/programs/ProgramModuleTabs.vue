<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import AppTabs from '@/components/ui/AppTabs.vue';

const { t } = useI18n();

/** Programs and Tasks are two lists of the same module. */
const tabs = computed(() => [
  { id: 'programs', to: '/programs', label: t('programs.title') },
  { id: 'tasks', to: '/programs/tasks', label: t('tasks.title') },
]);
</script>

<template>
  <AppTabs :tabs="tabs" :label="t('programs.tabsLabel')" />
</template>
