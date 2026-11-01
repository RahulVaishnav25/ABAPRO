<script setup lang="ts">
import { computed } from 'vue';
import { navigationFor } from '@abapro/shared';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
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

/** Labelled groups, in NAV_ORDER. Items without a group sit at the top. */
const NAV_GROUPS: Record<string, string> = {
  organisations: 'organisation',
  clinics: 'organisation',
  children: 'care',
  programs: 'care',
  tasks: 'care',
  onboarding: 'administration',
  settings: 'administration',
};

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
const { t } = useI18n();
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

/** The items split into consecutive groups for display. */
const sections = computed(() => {
  const result: Array<{ label: string; items: SidebarNavItem[] }> = [];
  for (const item of items.value) {
    const label = NAV_GROUPS[item.key] ?? '';
    const last = result[result.length - 1];
    if (last && last.label === label) last.items.push(item);
    else result.push({ label, items: [item] });
  }
  return result;
});

/** An organisation member's own organisation is "Organisation"; a super admin's list is "Organisations". */
function itemTitle(item: SidebarNavItem): string {
  if (item.key === 'organisations' && item.route !== '/organizations') return t('nav.items.organisation');
  return t(`nav.items.${item.key}`);
}

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
        <span class="brand-sub">{{ t('nav.brandSub') }}</span>
      </span>
    </div>
    <nav :aria-label="t('nav.primary')">
      <div v-for="section in sections" :key="section.label || 'main'" class="nav-section">
        <p v-if="section.label && !collapsed" class="nav-heading">{{ t(`nav.groups.${section.label}`) }}</p>
        <hr v-else-if="section.label" class="nav-divider" />
        <ul>
          <li v-for="item in section.items" :key="item.key">
            <a
              :href="item.route"
              class="nav-link"
              :class="{ 'is-active': isItemActive(item, route.path) }"
              :aria-current="isItemActive(item, route.path) ? 'page' : undefined"
              :title="collapsed ? itemTitle(item) : undefined"
              @click="follow($event, item.route)"
            >
              <AppIcon :name="item.icon" />
              <span :class="{ 'visually-hidden': collapsed }">{{ itemTitle(item) }}</span>
            </a>
          </li>
        </ul>
      </div>
    </nav>
    <button v-if="collapsible" type="button" class="collapse" :aria-expanded="!collapsed" @click="emit('toggle')">
      <AppIcon :name="collapsed ? 'chevron-right' : 'chevron-left'" class="flip-rtl" :size="16" />
      <span :class="{ 'visually-hidden': collapsed }">{{ collapsed ? t('nav.expand') : t('nav.collapse') }}</span>
    </button>
  </div>
</template>

<style scoped>
.sidebar {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-sidebar);
  border-inline-end: 1px solid var(--color-border);
  padding: var(--space-4) var(--space-3);
  min-height: 0;
}

nav {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.brand {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 2px var(--space-2) var(--space-5);
}

.brand-mark-img {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  object-fit: contain;
  flex-shrink: 0;
}

.brand-text {
  min-width: 0;
}

.brand-name,
.brand-sub {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.brand-name {
  color: var(--color-ink);
  font-weight: 650;
  letter-spacing: -0.01em;
}

.brand-sub {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}

.nav-heading {
  margin: 0 0 6px;
  padding: 0 var(--space-3);
  color: var(--color-text-subtle);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.02em;
}

.nav-divider {
  margin: 0 var(--space-2) var(--space-2);
  border: 0;
  border-top: 1px solid var(--color-border);
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
  min-height: 38px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  text-decoration: none;
  font-size: var(--text-base);
  font-weight: 500;
  transition: background-color var(--transition), color var(--transition);
}

.nav-link:hover {
  background: var(--color-surface-sunken);
  color: var(--color-ink);
}

.nav-link.is-active {
  background: var(--color-primary-soft);
  color: var(--color-primary-ink);
  font-weight: 600;
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
  gap: var(--space-2);
  min-height: 36px;
  margin-top: var(--space-2);
  padding: 0 var(--space-3);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: 500;
}

.collapse:hover {
  background: var(--color-surface-sunken);
  color: var(--color-ink);
}

.is-collapsed .collapse {
  justify-content: center;
  padding-inline: 0;
}
</style>
