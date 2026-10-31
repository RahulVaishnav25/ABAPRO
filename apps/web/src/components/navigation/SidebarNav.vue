<script setup lang="ts">
import { computed } from 'vue';
import { navigationFor } from '@abapro/shared';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useBrandingStore } from '@/stores/branding';
import appIconUrl from '@/assets/brand/app-icon.png';
import AppIcon from './AppIcon.vue';

interface SidebarNavItem {
  key: string;
  title: string;
  route: string;
  icon: string;
  matches: readonly string[];
}

const THERAPY_NAV_ITEM: SidebarNavItem = {
  key: 'therapy',
  title: 'Therapy Workspace',
  route: '/therapy',
  icon: 'workspace',
  matches: ['/therapy'],
};

const TASKS_NAV_ITEM: SidebarNavItem = {
  key: 'tasks',
  title: 'Tasks',
  route: '/programs/tasks',
  icon: 'tasks',
  matches: ['/programs/tasks', '/tasks'],
};

/** Every role sees its items in this order; a role only shows the items it has access to. */
const NAV_ORDER = ['platform', 'home', 'therapy', 'organisations', 'clinics', 'children', 'programs', 'tasks', 'onboarding', 'settings'];

withDefaults(
  defineProps<{
    collapsed?: boolean;
    collapsible?: boolean;
  }>(),
  { collapsed: false, collapsible: false },
);

const emit = defineEmits<{
  toggle: [];
  navigate: [];
}>();

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const branding = useBrandingStore();

const brandName = computed(() => branding.effectiveBranding.portalName || 'ABAPro');
const brandLogo = computed(() => branding.effectiveBranding.logoUrl || appIconUrl);

const items = computed<SidebarNavItem[]>(() => {
  const isPlatformAdmin = Boolean(auth.user?.platformAdmin);

  // A super admin's menu comes from the platform role. Opening Programs or Tasks moves the session
  // into an organisation, and that organisation's permissions must not reshape the menu.
  // Only a super admin lists organisations here; everyone else opens theirs from My Organisation in the top bar.
  const navItems: SidebarNavItem[] = navigationFor(isPlatformAdmin ? [] : auth.user?.permissions ?? [], {
    platformAdmin: isPlatformAdmin,
    organizationId: auth.user?.organization?.id,
  })
    .filter((item) => item.key !== 'organisations' || isPlatformAdmin)
    // Therapists do not manage clinics.
    .filter((item) => item.key !== 'clinics' || auth.user?.role !== 'therapist');

  if (isPlatformAdmin && !navItems.some((item) => item.key === 'programs')) {
    navItems.push({
      key: 'programs',
      title: 'Programs',
      route: '/programs',
      icon: 'programs',
      matches: ['/programs'],
    });
  }

  if (navItems.some((item) => item.key === 'programs')) {
    navItems.push(TASKS_NAV_ITEM);
  }

  // Like Programs, opening Onboarding moves a super admin into an organisation.
  if (isPlatformAdmin && !navItems.some((item) => item.key === 'onboarding')) {
    navItems.push({ key: 'onboarding', title: 'Onboarding', route: '/onboarding/teams', icon: 'team', matches: ['/onboarding/teams', '/onboarding/parents'] });
  }

  if (auth.user?.role === 'therapist') {
    navItems.push(THERAPY_NAV_ITEM);
  }

  return navItems.sort((a, b) => NAV_ORDER.indexOf(a.key) - NAV_ORDER.indexOf(b.key));
});

function isItemActive(item: SidebarNavItem, path: string): boolean {
  if (item.key === 'home') return path === '/';
  if (item.key === 'platform') return path === '/platform';
  if (item.key === 'programs') {
    if (path === '/programs/tasks' || path.startsWith('/programs/tasks/') || path === '/tasks') {
      return false;
    }
  }
  if (item.key === 'organisations') {
    if (auth.user?.platformAdmin) {
      return path === '/organizations' || path === '/organizations/new' || path.startsWith('/organizations/');
    }
    return path === item.route || path.startsWith(`${item.route}/`);
  }
  return item.matches.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function follow(event: MouseEvent, path: string): void {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
    return;
  }
  event.preventDefault();
  void router.push(path);
  emit('navigate');
}
</script>

<template>
  <div class="sidebar" :class="{ 'is-collapsed': collapsed }">
    <div class="brand">
      <img :src="brandLogo" :alt="brandName" class="brand-mark-img" />
      <span v-if="!collapsed" class="brand-text">
        <span class="brand-name">{{ brandName }}</span>
        <span class="brand-sub">Therapy management</span>
      </span>
    </div>
    <nav aria-label="Primary">
      <ul>
        <li v-for="item in items" :key="item.key">
          <a
            :href="item.route"
            class="nav-link"
            :class="{ 'is-active': isItemActive(item, route.path) }"
            :aria-current="isItemActive(item, route.path) ? 'page' : undefined"
            :title="collapsed ? item.title : undefined"
            @click="follow($event, item.route)"
          >
            <AppIcon :name="item.icon" />
            <span :class="{ 'visually-hidden': collapsed }">{{ item.title }}</span>
          </a>
        </li>
      </ul>
    </nav>
    <button v-if="collapsible" type="button" class="collapse" :aria-expanded="!collapsed" @click="emit('toggle')">
      <span aria-hidden="true">{{ collapsed ? '›' : '‹' }}</span>
      <span :class="{ 'visually-hidden': collapsed }">{{ collapsed ? 'Expand menu' : 'Collapse menu' }}</span>
    </button>
  </div>
</template>

<style scoped>
.sidebar {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-sidebar);
  border-right: 1px solid var(--color-border);
  padding: 16px 12px;
  min-height: 0;
}

nav {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.brand {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 4px 8px 16px;
}

.brand-mark-img {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  object-fit: contain;
  flex-shrink: 0;
}

.brand-name,
.brand-sub {
  display: block;
}

.brand-name {
  font-weight: 700;
  letter-spacing: -0.02em;
}

.brand-sub {
  color: var(--color-text-muted);
  font-size: 0.82rem;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-link {
  display: flex;
  gap: 10px;
  align-items: center;
  min-height: 44px;
  padding: 8px 10px;
  border-radius: 8px;
  color: var(--color-text);
  text-decoration: none;
  font-weight: 600;
}

.nav-link:hover {
  background: var(--color-surface-muted);
}

.nav-link.is-active {
  background: var(--color-primary-soft);
  color: var(--color-primary-ink);
}

.is-collapsed .brand {
  justify-content: center;
  padding-inline: 0;
}

.is-collapsed .nav-link {
  justify-content: center;
  padding-inline: 0;
}

.collapse {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  margin-top: 8px;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-muted);
  font-weight: 700;
}

.collapse:hover {
  background: var(--color-surface-muted);
  color: var(--color-text);
}

.is-collapsed .collapse {
  justify-content: center;
  padding-inline: 0;
}
</style>
