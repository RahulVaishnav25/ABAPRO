<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import CopyrightFooter from '@/components/CopyrightFooter.vue';
import AppBreadcrumbs from '@/components/navigation/AppBreadcrumbs.vue';
import SidebarNav from '@/components/navigation/SidebarNav.vue';
import TopBar from '@/components/navigation/TopBar.vue';
import { useAuthStore } from '@/stores/auth';

const STORAGE_KEY = 'abapro.sidebarCollapsed';
const auth = useAuthStore();
const route = useRoute();
const collapsed = ref(localStorage.getItem(STORAGE_KEY) === 'true');
const menuOpen = ref(false);
const viewKey = computed(() => `${auth.user?.organization?.id ?? 'none'}:${auth.user?.clinic?.id ?? 'none'}`);

function toggleCollapsed(): void {
  collapsed.value = !collapsed.value;
  localStorage.setItem(STORAGE_KEY, String(collapsed.value));
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') menuOpen.value = false;
}

watch(
  () => route.path,
  () => {
    menuOpen.value = false;
  },
);

onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="app-shell" :class="{ 'is-collapsed': collapsed }">
    <a class="skip-link" href="#main">Skip to content</a>
    <div id="primary-nav" class="sidebar-slot">
      <SidebarNav collapsible :collapsed="collapsed" @toggle="toggleCollapsed" />
    </div>
    <div class="content">
      <TopBar :menu-open="menuOpen" @toggle-menu="menuOpen = !menuOpen" />
      <main id="main" class="main-body" tabindex="-1">
        <AppBreadcrumbs />
        <RouterView :key="viewKey" />
      </main>
      <CopyrightFooter class="shell-footer" />
    </div>
    <div v-if="menuOpen" class="nav-layer">
      <button type="button" class="nav-backdrop" aria-label="Close menu" @click="menuOpen = false"></button>
      <div id="mobile-menu" class="nav-drawer" role="dialog" aria-modal="true" aria-label="Menu">
        <SidebarNav @navigate="menuOpen = false" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
}

.app-shell.is-collapsed {
  grid-template-columns: 84px minmax(0, 1fr);
}

.sidebar-slot {
  position: sticky;
  top: 0;
  height: 100vh;
}

.content {
  min-width: 0;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.main-body {
  flex: 1;
  padding: 20px 24px 32px;
}

.nav-layer {
  display: none;
}

@media (max-width: 959px) {
  .app-shell,
  .app-shell.is-collapsed {
    grid-template-columns: 1fr;
  }

  .sidebar-slot {
    display: none;
  }

  .main-body {
    padding: 16px 16px 24px;
  }

  .nav-layer {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 40;
  }

  .nav-backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    background: rgba(16, 24, 32, 0.4);
  }

  .nav-drawer {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: min(320px, 86vw);
    background: var(--color-sidebar);
    box-shadow: var(--shadow-md);
  }

  .nav-drawer :deep(.sidebar) {
    border-right: 0;
  }
}
</style>
