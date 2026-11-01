<script setup lang="ts">
import AppTabs from '@/components/ui/AppTabs.vue';

/** Programs and Tasks are two lists of the same module. */
const tabs = [
  { id: 'programs', to: '/programs', label: 'Programs' },
  { id: 'tasks', to: '/programs/tasks', label: 'Tasks' },
];
</script>

<template>
  <AppTabs :tabs="tabs" label="Programs and tasks" />
</template>
