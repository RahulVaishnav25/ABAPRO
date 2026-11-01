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
  if (route.path === '/organizations' || route.path.startsWith('/organizations/')) {
    if (auth.user?.platformAdmin) {
      const trail = [root, { label: 'Organisations', to: '/organizations' }];
      if (route.name !== 'organizations') trail.push({ label, to: route.path });
      return trail;
    }
  }
  if (route.path === '/team' || route.path.startsWith('/team/')) {
    return [root, { label: 'Settings', to: '/settings' }, { label, to: route.path }];
  }
  if (route.path === '/programs/tasks' || route.path.startsWith('/programs/tasks/')) {
    const trail = [root, { label: 'Programs', to: '/programs' }, { label: 'Tasks', to: '/programs/tasks' }];
    if (route.path !== '/programs/tasks') {
      trail.push({ label, to: route.path });
    }
    return trail;
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
.breadcrumbs {
  width: min(var(--content-max), 100%);
  margin: 0 auto var(--space-3);
}

ol {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

li:not(:last-child)::after {
  content: '/';
  margin-inline-start: 6px;
  color: var(--color-border-strong);
}

a {
  color: var(--color-text-muted);
  text-decoration: none;
}

a:hover {
  color: var(--color-ink);
  text-decoration: underline;
}

[aria-current='page'] {
  color: var(--color-ink);
  font-weight: 500;
}
</style>
