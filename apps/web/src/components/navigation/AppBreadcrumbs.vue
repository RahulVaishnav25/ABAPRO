<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const auth = useAuthStore();
const dashboard = computed(() => ({
  label: 'Dashboard',
  to: auth.user?.platformAdmin ? '/platform' : '/',
}));

const crumbs = computed(() => {
  const label = String(route.meta.breadcrumb ?? route.meta.title ?? 'Page');
  const root = dashboard.value;
  if (route.name === 'dashboard' || route.name === 'platform-dashboard') {
    return [root];
  }
  if (route.path === '/clinics' || route.path.startsWith('/clinics/')) {
    const trail = [root, { label: 'Clinics', to: '/clinics' }];
    if (route.name !== 'clinics') trail.push({ label, to: route.path });
    return trail;
  }
  if (route.path === '/team' || route.path.startsWith('/team/')) {
    return [root, { label: 'Settings', to: '/settings' }, { label, to: route.path }];
  }
  return [root, { label, to: route.path }];
});
</script>

<template>
  <nav class="breadcrumbs" aria-label="Breadcrumb">
    <ol>
      <li v-for="(crumb, index) in crumbs" :key="crumb.to">
        <RouterLink v-if="index < crumbs.length - 1" :to="crumb.to">{{ crumb.label }}</RouterLink>
        <span v-else aria-current="page">{{ crumb.label }}</span>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
ol {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  color: var(--color-text-muted);
  font-size: 0.92rem;
}

li:not(:last-child)::after {
  content: '/';
  margin-left: 8px;
  color: var(--color-text-subtle);
}

a {
  text-decoration: none;
  font-weight: 600;
}
</style>
