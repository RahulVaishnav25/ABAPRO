<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import AppIcon from '@/components/navigation/AppIcon.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';

defineProps<{
  menuOpen?: boolean;
}>();

const emit = defineEmits<{
  'toggle-menu': [];
}>();

const auth = useAuthStore();
const toast = useToastStore();
const router = useRouter();
const notificationsOpen = ref(false);
const userOpen = ref(false);
const confirmOpen = ref(false);
const notificationsRef = ref<HTMLElement | null>(null);
const userRef = ref<HTMLElement | null>(null);

const isPlatformAdmin = computed(() => auth.user?.platformAdmin === true);
const initials = computed(() =>
  (auth.user?.name || auth.user?.email || 'A')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join(''),
);
const clinicOptions = computed(() => auth.user?.clinics ?? []);

async function chooseClinic(event: Event): Promise<void> {
  const clinicId = (event.target as HTMLSelectElement).value;
  if (!clinicId || clinicId === auth.user?.clinic?.id) return;
  try {
    await auth.switchClinic(clinicId);
  } catch {
    toast.push({ tone: 'danger', title: 'Clinic not changed', message: 'Try again.' });
  }
}

function onDocumentPointer(event: PointerEvent): void {
  const target = event.target;
  if (!(target instanceof Node)) {
    return;
  }
  if (notificationsOpen.value && notificationsRef.value && !notificationsRef.value.contains(target)) {
    notificationsOpen.value = false;
  }
  if (userOpen.value && userRef.value && !userRef.value.contains(target)) {
    userOpen.value = false;
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    notificationsOpen.value = false;
    userOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointer);
  document.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointer);
  document.removeEventListener('keydown', onKeydown);
});

async function openMyOrganisation(): Promise<void> {
  const organizationId = auth.user?.organization?.id;
  if (!organizationId) return;
  userOpen.value = false;
  await router.push(`/organizations/${organizationId}`);
}

async function signOut(): Promise<void> {
  confirmOpen.value = false;
  userOpen.value = false;
  const endSessionUrl = await auth.logout();
  toast.push({ tone: 'info', title: 'Signed out' });
  if (endSessionUrl) {
    window.location.assign(endSessionUrl);
    return;
  }
  await router.push({ name: 'login' });
}
</script>

<template>
  <header class="topbar">
    <button
      type="button"
      class="menu-button"
      :aria-expanded="menuOpen"
      aria-controls="mobile-menu"
      @click="emit('toggle-menu')"
    >
      <span class="visually-hidden">{{ menuOpen ? 'Close menu' : 'Open menu' }}</span>
      <AppIcon :name="menuOpen ? 'close' : 'menu'" :size="20" />
    </button>
    <div class="topbar-start">
      <!-- Where the user is working: the organisation, and the clinic when they can choose one. -->
      <template v-if="auth.user?.organization">
        <span class="context-org">{{ auth.user.organization.name }}</span>
        <template v-if="clinicOptions.length > 1">
          <span class="context-sep" aria-hidden="true">/</span>
          <label class="visually-hidden" for="clinic-switch">Clinic</label>
          <select id="clinic-switch" class="context-clinic" :value="auth.user.clinic?.id ?? ''" :disabled="auth.switching" @change="chooseClinic">
            <option v-for="clinic in clinicOptions" :key="clinic.id" :value="clinic.id">{{ clinic.name }}</option>
          </select>
        </template>
        <template v-else-if="auth.user.clinic">
          <span class="context-sep" aria-hidden="true">/</span>
          <span class="context-clinic-name">{{ auth.user.clinic.name }}</span>
        </template>
      </template>
    </div>
    <div class="topbar-end">
      <div ref="notificationsRef" class="menu">
        <button
          type="button"
          class="icon-button"
          aria-haspopup="dialog"
          :aria-expanded="notificationsOpen"
          aria-label="Notifications"
          title="Notifications"
          @click="notificationsOpen = !notificationsOpen"
        >
          <AppIcon name="notification" />
        </button>
        <div v-if="notificationsOpen" class="dropdown" role="dialog" aria-label="Notifications">
          <strong class="dropdown-title">Notifications</strong>
          <p class="dropdown-empty">You're all caught up. Alerts about clients and tasks will appear here.</p>
        </div>
      </div>
      <div ref="userRef" class="menu">
        <button
          type="button"
          class="user-button"
          aria-haspopup="menu"
          :aria-expanded="userOpen"
          :aria-label="auth.user ? `${auth.user.name}, ${auth.user.roleLabel ?? 'Account'}` : 'Account'"
          @click="userOpen = !userOpen"
        >
          <span class="avatar" aria-hidden="true">{{ initials }}</span>
          <span class="user-copy">
            <span class="user-name">{{ auth.user?.name }}</span>
            <span class="user-role">{{ auth.user?.roleLabel ?? 'Account' }}</span>
          </span>
          <AppIcon name="chevron-down" :size="16" class="user-chevron" />
        </button>
        <div v-if="userOpen" class="dropdown user-dropdown" role="menu" :aria-label="auth.user?.name ?? 'Account'">
          <div class="user-card">
            <span class="avatar avatar-lg" aria-hidden="true">{{ initials }}</span>
            <div>
              <strong>{{ auth.user?.name }}</strong>
              <span>{{ auth.user?.email }}</span>
              <span>{{ auth.user?.roleLabel }}</span>
            </div>
          </div>
          <div class="menu-items">
            <button
              v-if="!isPlatformAdmin && auth.user?.role !== 'therapist' && auth.user?.organization?.id"
              type="button"
              role="menuitem"
              class="menu-item"
              @click="openMyOrganisation"
            >
              <AppIcon name="organisations" :size="16" /> My Organisation
            </button>
            <button type="button" role="menuitem" class="menu-item" @click="confirmOpen = true">
              <AppIcon name="logout" :size="16" class="flip-rtl" /> Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
    <ConfirmDialog
      :open="confirmOpen"
      title="Sign out"
      message="You will need to sign in again to view organization records."
      confirm-label="Sign out"
      tone="danger"
      @confirm="signOut"
      @cancel="confirmOpen = false"
    />
  </header>
</template>

<style scoped>
.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  height: var(--topbar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: 0 var(--space-6);
  background: color-mix(in srgb, var(--color-bg) 88%, transparent);
  border-bottom: 1px solid var(--color-border);
  backdrop-filter: saturate(1.4) blur(10px);
}

.topbar-start,
.topbar-end,
.menu,
.user-button,
.user-copy {
  display: flex;
  align-items: center;
}

.topbar-start {
  gap: var(--space-2);
  min-width: 0;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.topbar-end {
  gap: var(--space-2);
  margin-inline-start: auto;
}

.context-org {
  color: var(--color-ink);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.context-sep {
  color: var(--color-border-strong);
}

.context-clinic-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.context-clinic {
  max-width: 220px;
  min-height: 30px;
  padding: 0 var(--space-6) 0 var(--space-2);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%235b6672' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 7.5 10 12.5 15 7.5'/%3E%3C/svg%3E") no-repeat right 6px center / 14px;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  appearance: none;
  cursor: pointer;
}

[dir='rtl'] .context-clinic {
  padding: 0 var(--space-2) 0 var(--space-6);
  background-position: left 6px center;
}

.context-clinic:hover {
  border-color: var(--color-border);
  background-color: var(--color-surface);
  color: var(--color-ink);
}

.menu-button {
  display: none;
  width: 40px;
  height: 40px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
}

.menu {
  position: relative;
}

.icon-button {
  display: inline-grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.icon-button:hover,
.icon-button[aria-expanded='true'] {
  background: var(--color-surface-sunken);
  color: var(--color-ink);
}

.user-button {
  gap: var(--space-2);
  min-height: 40px;
  padding: 3px var(--space-2) 3px 3px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  text-align: start;
}

[dir='rtl'] .user-button {
  padding: 3px 3px 3px var(--space-2);
}

.user-button:hover,
.user-button[aria-expanded='true'] {
  background: var(--color-surface-sunken);
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  flex: none;
  background: var(--color-primary);
  color: #fff;
  font-size: var(--text-xs);
  font-weight: 600;
}

.avatar-lg {
  width: 40px;
  height: 40px;
  font-size: var(--text-sm);
}

.user-copy {
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.25;
}

.user-name {
  color: var(--color-ink);
  font-size: var(--text-sm);
  font-weight: 600;
}

.user-role {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}

.user-chevron {
  color: var(--color-text-subtle);
}

.dropdown {
  position: absolute;
  inset-inline-end: 0;
  top: calc(100% + 8px);
  width: min(300px, 86vw);
  padding: var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  z-index: 40;
  animation: dialog-in 0.12s ease;
}

.dropdown-title {
  color: var(--color-ink);
}

.dropdown-empty {
  margin-top: 6px;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.user-dropdown {
  padding: var(--space-2);
}

.user-card {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-3) var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  margin-bottom: var(--space-2);
}

.user-card strong,
.user-card span {
  display: block;
  overflow-wrap: anywhere;
}

.user-card strong {
  color: var(--color-ink);
  font-size: var(--text-base);
}

.user-card span {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.menu-items {
  display: grid;
  gap: 2px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 36px;
  padding: 0 var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-ink);
  font-size: var(--text-base);
  text-align: start;
}

.menu-item:hover,
.menu-item:focus-visible {
  background: var(--color-surface-sunken);
  outline: none;
}

@media (max-width: 959px) {
  .topbar {
    padding: 0 var(--space-4);
  }

  .menu-button {
    display: inline-flex;
  }

  .user-copy,
  .user-chevron {
    display: none;
  }
}

@media (max-width: 560px) {
  .topbar-start {
    display: none;
  }
}
</style>
