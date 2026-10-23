<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import AppButton from '@/components/ui/AppButton.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
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

const clinicOptions = computed(() =>
  (auth.user?.clinics ?? []).map((clinic) => ({
    value: clinic.id,
    label: `${clinic.name} · ${clinic.location}`,
  })),
);
const contextLabel = computed(() => {
  const organization = auth.user?.organization?.name;
  const clinic = auth.user?.clinic;
  if (!organization) return auth.user?.platformAdmin ? '' : 'No organisation';
  if (!clinic) return organization;
  return `${organization} · ${clinic.name}, ${clinic.location}`;
});

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

async function onClinicChange(clinicId: string): Promise<void> {
  if (!clinicId || clinicId === auth.user?.clinic?.id) {
    return;
  }
  try {
    await auth.switchClinic(clinicId);
    toast.push({
      tone: 'success',
      title: 'Clinic updated',
      message: auth.user?.clinic ? `${auth.user.clinic.name}, ${auth.user.clinic.location}` : undefined,
    });
  } catch (error) {
    toast.push({
      tone: 'danger',
      title: 'Could not switch clinic',
      message: error instanceof Error ? error.message : 'Try again.',
    });
  }
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
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path v-if="menuOpen" d="M6 6l12 12M18 6L6 18" />
        <path v-else d="M4 7h16M4 12h16M4 17h16" />
      </svg>
    </button>
    <div class="topbar-start">
      <p v-if="clinicOptions.length > 1" class="org-name">{{ auth.user?.organization?.name }}</p>
      <AppSelect
        v-if="clinicOptions.length > 1"
        :model-value="auth.user?.clinic?.id ?? ''"
        label="Clinic"
        :options="clinicOptions"
        :disabled="auth.switching"
        @update:model-value="onClinicChange"
      />
      <p v-else-if="contextLabel" class="org-name">{{ contextLabel }}</p>
    </div>
    <div class="topbar-end">
      <div ref="notificationsRef" class="menu">
        <button
          type="button"
          class="icon-button"
          aria-haspopup="dialog"
          :aria-expanded="notificationsOpen"
          @click="notificationsOpen = !notificationsOpen"
        >
          Notifications
        </button>
        <div v-if="notificationsOpen" class="dropdown" role="dialog" aria-label="Notifications">
          <strong>Notifications</strong>
          <p>Notifications are not connected yet. Alerts will appear here when clinical events are available.</p>
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
          <span class="avatar" aria-hidden="true">{{ auth.user?.name.slice(0, 1) }}</span>
          <span class="user-copy">
            <span>{{ auth.user?.name }}</span>
            <span>{{ auth.user?.roleLabel ?? 'Account' }}</span>
          </span>
        </button>
        <div v-if="userOpen" class="dropdown" role="menu">
          <p>{{ auth.user?.email }}</p>
          <AppButton variant="secondary" block @click="confirmOpen = true">Sign out</AppButton>
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
  gap: 16px;
  padding: 0 16px;
  background: rgba(255, 255, 255, 0.94);
  border-bottom: 1px solid var(--color-border);
  backdrop-filter: blur(8px);
}

.topbar-start,
.topbar-end,
.menu,
.user-button,
.user-copy {
  display: flex;
  align-items: center;
}

.topbar-start,
.topbar-end {
  gap: 12px;
  min-width: 0;
}

.topbar-end {
  margin-left: auto;
}

.menu-button {
  display: none;
  width: 40px;
  height: 40px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text);
}

.menu-button svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
}

.topbar-start :deep(.field) {
  width: min(280px, 46vw);
}

.org-name {
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.menu {
  position: relative;
}

.icon-button,
.user-button {
  min-height: 40px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  border-radius: 8px;
}

.icon-button {
  display: inline-flex;
  padding: 0 12px;
  font-weight: 700;
}

.user-button {
  gap: 8px;
  padding: 4px 10px 4px 4px;
  text-align: left;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: var(--color-primary-soft);
  color: var(--color-primary-ink);
  font-weight: 700;
}

.user-copy {
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.2;
}

.user-copy span:last-child {
  color: var(--color-text-muted);
  font-size: 0.8rem;
}

.dropdown {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  width: min(320px, 80vw);
  padding: 14px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  z-index: 40;
}

.dropdown p {
  margin: 6px 0 12px;
  color: var(--color-text-muted);
}

@media (max-width: 959px) {
  .menu-button {
    display: inline-flex;
  }

  .user-copy {
    display: none;
  }
}
</style>
