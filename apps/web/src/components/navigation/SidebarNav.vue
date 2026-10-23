<script setup lang="ts">
import { computed } from 'vue';
import { navigationFor, navigationItemIsActive } from '@abapro/shared';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import AppIcon from './AppIcon.vue';

const props = withDefaults(
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
const items = computed(() => navigationFor(auth.user?.permissions ?? [], {
  platformAdmin: auth.user?.platformAdmin,
  organizationId: auth.user?.platformAdmin ? undefined : auth.user?.organization?.id,
}));

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
      <span class="brand-mark" aria-hidden="true">A</span>
      <span v-if="!collapsed">
        <span class="brand-name">ABAPro</span>
        <span class="brand-sub">Therapy management</span>
      </span>
    </div>
    <nav aria-label="Primary">
      <ul>
        <li v-for="item in items" :key="item.key">
          <a
            :href="item.route"
            class="nav-link"
            :class="{ 'is-active': navigationItemIsActive(item, route.path) }"
            :aria-current="navigationItemIsActive(item, route.path) ? 'page' : undefined"
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

.brand-mark {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: var(--color-primary);
  color: white;
  font-weight: 700;
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
