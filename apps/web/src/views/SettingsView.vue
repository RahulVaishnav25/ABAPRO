<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  INVITABLE_ROLES,
  PERMISSION_CATALOG,
  type InvitableRole,
  type OrganizationSettingsView,
  type Permission,
  type RolePermissionState,
  type SignInAccount,
} from '@abapro/shared';
import {
  createSignInAccountRequest,
  organizationSettingsRequest,
  platformRolesRequest,
  signInAccountsRequest,
  updatePlatformRoleRequest,
} from '@/api/resources';
import BrandingForm from '@/components/branding/BrandingForm.vue';
import RegionalSettingsSection from '@/components/settings/RegionalSettingsSection.vue';
import AppIcon from '@/components/navigation/AppIcon.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppCheckbox from '@/components/ui/AppCheckbox.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import { useAuthStore } from '@/stores/auth';
import { useBrandingStore } from '@/stores/branding';
import { useToastStore } from '@/stores/toast';
import { roleName } from '@/i18n';
import { errorMessage, useLoader } from '@/lib/loader';

const auth = useAuthStore();
const branding = useBrandingStore();
const toast = useToastStore();
const { t, te } = useI18n();

const settings = ref<OrganizationSettingsView | null>(null);

// Super Admin Management
const platformAdmins = ref<SignInAccount[]>([]);
const adminName = ref('');
const adminEmail = ref('');
const adminPassword = ref('');
const adminError = ref('');
const adminSaving = ref(false);

// Role Rules
const roleRules = ref<RolePermissionState[]>([]);
const selectedRole = ref<InvitableRole>('therapist');
const selectedPermissions = ref<Permission[]>([]);
const roleSaving = ref(false);
const roleError = ref('');
const roleOptions = computed(() => INVITABLE_ROLES.map((value) => ({ value, label: roleName(value) })));
const permissionLabel = (key: string, fallback: string) => {
  const id = `permissions.items.${key.replace(/[.]/g, '_')}`;
  return te(id) ? t(id) : fallback;
};
const groupLabel = (group: string) => (te(`permissions.groups.${group}`) ? t(`permissions.groups.${group}`) : group);
const selectedRule = computed(() => roleRules.value.find((item) => item.role === selectedRole.value) ?? null);
const catalogGroups = computed(() => {
  const ceiling = new Set(selectedRule.value?.ceiling ?? []);
  const groups = new Map<string, Array<{ key: Permission; label: string }>>();
  for (const item of PERMISSION_CATALOG) {
    if (!ceiling.has(item.key)) continue;
    const list = groups.get(item.group) ?? [];
    list.push({ key: item.key, label: permissionLabel(item.key, item.label) });
    groups.set(item.group, list);
  }
  return [...groups.entries()];
});

// Check if user is an authorised Organisation Admin
const canManageOrgBranding = computed(() => {
  if (!auth.user?.organization) return false;
  return auth.user.role === 'organization_admin' || auth.can('settings.manage');
});

const { loading, error, load } = useLoader(async () => {
  settings.value = await organizationSettingsRequest();
}, t('settings.error'));

async function loadPlatform(): Promise<void> {
  const [accounts, roles] = await Promise.all([signInAccountsRequest(), platformRolesRequest()]);
  platformAdmins.value = accounts.filter((account) => account.platformAdmin);
  roleRules.value = roles;
  chooseRole(selectedRole.value);
}

function chooseRole(role: InvitableRole): void {
  selectedRole.value = role;
  const current = roleRules.value.find((item) => item.role === role);
  selectedPermissions.value = current ? [...current.granted] : [];
}

function togglePermission(permission: Permission, checked: boolean): void {
  selectedPermissions.value = checked
    ? [...selectedPermissions.value, permission]
    : selectedPermissions.value.filter((item) => item !== permission);
}

async function addSuperAdmin(): Promise<void> {
  adminError.value = '';
  if (!adminName.value.trim()) {
    adminError.value = t('settings.admins.errors.name');
    return;
  }
  if (!adminEmail.value.trim().includes('@')) {
    adminError.value = t('settings.admins.errors.email');
    return;
  }
  if (adminPassword.value.length < 10) {
    adminError.value = t('settings.admins.errors.password');
    return;
  }

  adminSaving.value = true;
  try {
    await createSignInAccountRequest({
      name: adminName.value.trim(),
      email: adminEmail.value.trim(),
      password: adminPassword.value,
      platformAdmin: true,
    });
    adminName.value = '';
    adminEmail.value = '';
    adminPassword.value = '';
    toast.push({ tone: 'success', title: t('settings.admins.created') });
    await loadPlatform();
  } catch (createError) {
    adminError.value = errorMessage(createError, t('settings.admins.error'));
  } finally {
    adminSaving.value = false;
  }
}

async function saveRole(): Promise<void> {
  roleError.value = '';
  roleSaving.value = true;
  try {
    await updatePlatformRoleRequest(selectedRole.value, [...selectedPermissions.value]);
    toast.push({ tone: 'success', title: t('settings.roles.saved'), message: roleName(selectedRole.value) });
    await loadPlatform();
  } catch (saveError) {
    roleError.value = errorMessage(saveError, t('settings.roles.error'));
  } finally {
    roleSaving.value = false;
  }
}

/** The sections this person can open, in page order, for the section list. */
const sections = computed(() =>
  [
    { id: 'admins', show: auth.user?.platformAdmin === true },
    { id: 'platformBranding', show: auth.user?.platformAdmin === true },
    { id: 'orgBranding', show: canManageOrgBranding.value },
    { id: 'platformRegion', show: auth.user?.platformAdmin === true },
    { id: 'orgRegion', show: canManageOrgBranding.value },
    { id: 'roles', show: auth.user?.platformAdmin === true },
  ]
    .filter((section) => section.show)
    .map((section) => ({ id: section.id, label: t(`settings.nav.${section.id}`) })),
);
const activeSection = ref('');

function goTo(id: string): void {
  activeSection.value = id;
  document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = (word?: string) => Array.from(word ?? '')[0] ?? '';
  return (words.length > 1 ? first(words[0]) + first(words[words.length - 1]) : first(words[0])).toLocaleUpperCase();
}

onMounted(async () => {
  await branding.initialize();

  const tasks: Promise<void>[] = [];
  if (auth.user?.platformAdmin) tasks.push(loadPlatform());
  if (auth.user?.organization && auth.can('settings.view')) tasks.push(load());
  else loading.value = false;

  void Promise.all(tasks).catch((loadError: unknown) => {
    error.value = errorMessage(loadError, t('settings.error'));
    loading.value = false;
  });
});
</script>

<template>
  <PageContainer>
    <PageHeader :title="t('settings.title')" :description="auth.user?.platformAdmin ? t('settings.descriptionPlatform') : t('settings.descriptionOrg')" />

    <div class="settings-layout" :class="{ 'has-nav': sections.length > 1 }">
      <nav v-if="sections.length > 1" class="settings-nav" :aria-label="t('settings.sectionsLabel')">
        <a
          v-for="section in sections"
          :key="section.id"
          :href="`#settings-${section.id}`"
          class="settings-nav-link"
          :class="{ 'is-active': activeSection === section.id }"
          :aria-current="activeSection === section.id ? 'true' : undefined"
          @click.prevent="goTo(section.id)"
        >
          {{ section.label }}
        </a>
      </nav>

      <div class="settings-stack">
        <SkeletonBlock v-if="loading" height="160px" />
        <ErrorState v-else-if="error" :title="t('settings.unavailable')" :description="error" @retry="load" />

        <!-- Super admins -->
        <section v-if="auth.user?.platformAdmin" id="settings-admins" class="settings-card">
          <div class="section-heading">
            <h2>{{ t('settings.admins.title') }}</h2>
            <p class="section-desc">{{ t('settings.admins.description') }}</p>
          </div>
          <ul v-if="platformAdmins.length" class="admin-list" :aria-label="t('settings.admins.existing')">
            <li v-for="account in platformAdmins" :key="account.id" class="admin-item">
              <span class="admin-avatar" aria-hidden="true">{{ initials(account.name) }}</span>
              <span class="admin-text">
                <strong dir="auto">{{ account.name }}</strong>
                <small dir="ltr">{{ account.email }}</small>
              </span>
              <span class="admin-badge">{{ t('settings.admins.badge') }}</span>
            </li>
          </ul>
          <form class="record-card admin-form" novalidate @submit.prevent="addSuperAdmin">
            <p v-if="adminError" class="form-alert" role="alert"><AppIcon name="alert" :size="16" />{{ adminError }}</p>
            <div class="form-grid">
              <AppInput v-model="adminName" :label="t('settings.admins.name')" required />
              <AppInput v-model="adminEmail" :label="t('settings.admins.email')" type="email" required autocomplete="off" />
              <AppInput v-model="adminPassword" :label="t('settings.admins.password')" type="password" :hint="t('settings.admins.passwordHint')" required autocomplete="new-password" />
            </div>
            <div class="form-actions">
              <AppButton type="submit" icon="plus" :loading="adminSaving">{{ t('settings.admins.create') }}</AppButton>
            </div>
          </form>
        </section>

        <!-- Platform branding -->
        <section v-if="auth.user?.platformAdmin" id="settings-platformBranding" class="settings-card">
          <div class="section-heading">
            <h2>{{ t('branding.platformTitle') }}</h2>
            <p class="section-desc">{{ t('branding.platformDescription') }}</p>
          </div>
          <BrandingForm scope="platform" />
        </section>

        <!-- Organisation branding -->
        <section v-if="canManageOrgBranding" id="settings-orgBranding" class="settings-card">
          <div class="section-heading">
            <h2>{{ t('branding.orgTitle') }}</h2>
            <p class="section-desc">{{ t('branding.orgDescription', { organisation: auth.user?.organization?.name ?? '' }) }}</p>
          </div>
          <BrandingForm scope="organization" />
        </section>

        <!-- Language and region: platform defaults for super admins, organisation defaults for organisation admins. -->
        <div v-if="auth.user?.platformAdmin" id="settings-platformRegion" class="section-anchor">
          <RegionalSettingsSection scope="platform" />
        </div>
        <div v-if="canManageOrgBranding" id="settings-orgRegion" class="section-anchor">
          <RegionalSettingsSection scope="organization" />
        </div>

        <!-- Role rules -->
        <section v-if="auth.user?.platformAdmin" id="settings-roles" class="settings-card">
          <div class="section-heading">
            <h2>{{ t('settings.roles.title') }}</h2>
            <p class="section-desc">{{ t('settings.roles.description') }}</p>
          </div>
          <p v-if="roleError" class="form-alert" role="alert"><AppIcon name="alert" :size="16" />{{ roleError }}</p>
          <div class="role-bar">
            <AppSelect :model-value="selectedRole" :label="t('settings.roles.role')" :options="roleOptions" @update:model-value="chooseRole($event as InvitableRole)" />
            <span class="role-count">{{ t('settings.roles.count', { n: selectedPermissions.length, total: selectedRule?.ceiling.length ?? 0 }) }}</span>
          </div>
          <div class="permission-groups">
            <fieldset v-for="[group, items] in catalogGroups" :key="group" class="permission-group">
              <legend>{{ groupLabel(group) }}</legend>
              <AppCheckbox
                v-for="item in items"
                :key="item.key"
                :model-value="selectedPermissions.includes(item.key)"
                :label="item.label"
                @update:model-value="togglePermission(item.key, Boolean($event))"
              />
            </fieldset>
          </div>
          <div class="form-actions">
            <AppButton :loading="roleSaving" @click="saveRole">{{ t('settings.roles.save') }}</AppButton>
          </div>
        </section>
      </div>
    </div>
  </PageContainer>
</template>

<style scoped>
.settings-layout {
  display: grid;
  gap: var(--space-6);
}

.settings-layout.has-nav {
  grid-template-columns: 220px minmax(0, 1fr);
  align-items: start;
}

.settings-nav {
  position: sticky;
  top: calc(var(--topbar-height) + var(--space-4));
  display: grid;
  gap: 2px;
}

.settings-nav-link {
  display: block;
  padding: var(--space-2) var(--space-3);
  border-inline-start: 2px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: 500;
  text-decoration: none;
}

.settings-nav-link:hover {
  border-inline-start-color: var(--color-border-strong);
  color: var(--color-ink);
}

.settings-nav-link.is-active {
  border-inline-start-color: var(--color-primary);
  color: var(--color-primary-ink);
  font-weight: 600;
}

.settings-nav-link:focus-visible {
  outline: none;
  box-shadow: var(--focus);
}

.settings-stack {
  display: grid;
  gap: var(--space-5);
  min-width: 0;
}

.settings-card,
.section-anchor {
  scroll-margin-top: calc(var(--topbar-height) + var(--space-4));
}

.admin-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.admin-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
}

.admin-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--color-primary);
  color: #ffffff;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1;
}

.admin-text {
  display: grid;
  flex: 1;
  min-width: 0;
}

.admin-text strong,
.admin-text small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-text small {
  justify-self: start;
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}

.admin-badge {
  flex: none;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--color-primary-soft);
  color: var(--color-primary-ink);
  font-size: var(--text-xs);
  font-weight: 600;
}

.admin-form {
  gap: var(--space-4);
}

.role-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-3) var(--space-5);
}

.role-bar > :first-child {
  width: min(320px, 100%);
}

.role-count {
  padding-bottom: 10px;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: 500;
}

.permission-groups {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-4);
}

.permission-group {
  display: grid;
  align-content: start;
  gap: 4px;
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
}

.permission-group legend {
  padding: 0 4px;
  color: var(--color-ink);
  font-size: var(--text-sm);
  font-weight: 600;
}

@media (max-width: 960px) {
  .settings-layout.has-nav {
    grid-template-columns: minmax(0, 1fr);
  }

  .settings-nav {
    position: static;
    display: flex;
    gap: var(--space-2);
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .settings-nav-link {
    flex: none;
    padding: 6px var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: var(--color-surface);
  }

  .settings-nav-link.is-active {
    border-color: var(--color-primary);
    background: var(--color-primary-soft);
  }
}
</style>
