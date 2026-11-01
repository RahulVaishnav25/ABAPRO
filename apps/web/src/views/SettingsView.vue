<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  INVITABLE_ROLES,
  PERMISSION_CATALOG,
  ROLE_LABELS,
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
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import { useAuthStore } from '@/stores/auth';
import { useBrandingStore } from '@/stores/branding';
import { useToastStore } from '@/stores/toast';
import { errorMessage, useLoader } from '@/lib/loader';

const auth = useAuthStore();
const branding = useBrandingStore();
const toast = useToastStore();

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
const roleOptions = INVITABLE_ROLES.map((value) => ({ value, label: ROLE_LABELS[value] }));
const selectedRule = computed(() => roleRules.value.find((item) => item.role === selectedRole.value) ?? null);
const catalogGroups = computed(() => {
  const ceiling = new Set(selectedRule.value?.ceiling ?? []);
  const groups = new Map<string, Array<{ key: Permission; label: string }>>();
  for (const item of PERMISSION_CATALOG) {
    if (!ceiling.has(item.key)) continue;
    const list = groups.get(item.group) ?? [];
    list.push({ key: item.key, label: item.label });
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
}, 'Organization settings could not be loaded.');

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
    adminError.value = 'Full name is required.';
    return;
  }
  if (!adminEmail.value.trim()) {
    adminError.value = 'A valid email address is required.';
    return;
  }
  if (adminPassword.value.length < 10) {
    adminError.value = 'Password must be at least 10 characters.';
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
    toast.push({ tone: 'success', title: 'Super Admin created successfully.' });
    await loadPlatform();
  } catch (createError) {
    adminError.value = errorMessage(createError, 'The super admin could not be added.');
  } finally {
    adminSaving.value = false;
  }
}

async function saveRole(): Promise<void> {
  roleError.value = '';
  roleSaving.value = true;
  try {
    await updatePlatformRoleRequest(selectedRole.value, [...selectedPermissions.value]);
    toast.push({ tone: 'success', title: 'Role rules updated', message: ROLE_LABELS[selectedRole.value] });
    await loadPlatform();
  } catch (saveError) {
    roleError.value = errorMessage(saveError, 'The role rules could not be saved.');
  } finally {
    roleSaving.value = false;
  }
}

onMounted(async () => {
  await branding.initialize();

  const tasks: Promise<void>[] = [];
  if (auth.user?.platformAdmin) tasks.push(loadPlatform());
  if (auth.user?.organization && auth.can('settings.view')) tasks.push(load());
  else loading.value = false;

  void Promise.all(tasks).catch((loadError: unknown) => {
    error.value = errorMessage(loadError, 'Settings could not be loaded.');
    loading.value = false;
  });
});
</script>

<template>
  <PageContainer>
    <PageHeader
      title="Settings"
      :description="auth.user?.platformAdmin ? 'Super admin management, platform & organisation branding, and system roles.' : 'Organisation branding, clinic profile, and preferences.'"
    />

    <div class="settings-stack">
      <!-- 1. SUPER ADMIN MANAGEMENT (Super Admins Only) -->
      <section v-if="auth.user?.platformAdmin" class="settings-card">
        <div class="section-heading">
          <h2>Super Admin Management</h2>
          <p class="section-desc">Create and oversee platform super administrators with full platform control.</p>
        </div>

        <p v-if="adminError" class="form-error" role="alert">{{ adminError }}</p>

        <form class="super-admin-form" @submit.prevent="addSuperAdmin">
          <AppInput v-model="adminName" label="Full Name" placeholder="e.g. Eleanor Vance" required />
          <AppInput v-model="adminEmail" label="Email Address" type="email" placeholder="admin@example.com" required />
          <AppInput
            v-model="adminPassword"
            label="Temporary Password"
            type="password"
            hint="Minimum 10 characters."
            required
          />
          <div class="form-action-row">
            <AppButton type="submit" :loading="adminSaving">Create Super Admin</AppButton>
          </div>
        </form>

        <div class="super-admins-list">
          <h3 class="subsection-title">Existing Super Admins</h3>
          <div class="admins-grid">
            <div v-for="account in platformAdmins" :key="account.id" class="admin-pill">
              <span class="admin-avatar">{{ account.name.slice(0, 1) }}</span>
              <div class="admin-details">
                <strong class="admin-name">{{ account.name }}</strong>
                <span class="admin-email">{{ account.email }}</span>
              </div>
              <span class="super-admin-badge">Super Admin</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 2. PLATFORM BRANDING (Super Admins Only) -->
      <section v-if="auth.user?.platformAdmin" class="settings-card">
        <div class="section-heading">
          <h2>Platform Branding</h2>
          <p class="section-desc">
            Global branding applied platform-wide and on the unauthenticated login screen. Stored securely in Firestore.
          </p>
        </div>

        <BrandingForm scope="platform" />
      </section>

      <!-- 3. ORGANISATION BRANDING (Authorised Organisation Admins Only) -->
      <section v-if="canManageOrgBranding" class="settings-card">
        <div class="section-heading">
          <h2>Organisation Branding</h2>
          <p class="section-desc">
            Customise branding for <strong>{{ auth.user?.organization?.name }}</strong>. Overrides platform defaults for your team members after signing in.
          </p>
        </div>

        <BrandingForm scope="organization" />
      </section>

      <!-- Language and region: platform defaults for super admins, organisation defaults for organisation admins. -->
      <RegionalSettingsSection v-if="auth.user?.platformAdmin" scope="platform" />
      <RegionalSettingsSection v-if="canManageOrgBranding" scope="organization" />

      <!-- 4. ROLE RULES (Super Admins Only) -->
      <section v-if="auth.user?.platformAdmin" class="settings-card">
        <div class="section-heading">
          <h2>Role Rules</h2>
          <p class="section-desc">These rules apply throughout the portal. A role can only receive responsibilities inside its limit.</p>
        </div>

        <p v-if="roleError" class="form-error" role="alert">{{ roleError }}</p>
        <AppSelect
          :model-value="selectedRole"
          label="Role"
          :options="roleOptions"
          @update:model-value="chooseRole($event as InvitableRole)"
        />

        <div v-for="[group, items] in catalogGroups" :key="group" class="group">
          <h3>{{ group }}</h3>
          <label v-for="item in items" :key="item.key" class="choice">
            <input
              type="checkbox"
              :checked="selectedPermissions.includes(item.key)"
              @change="togglePermission(item.key, ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ item.label }}</span>
          </label>
        </div>
        <div>
          <AppButton :loading="roleSaving" @click="saveRole">Save role rules</AppButton>
        </div>
      </section>

      <SkeletonBlock v-if="loading" />
      <ErrorState v-else-if="error" title="Settings unavailable" :description="error" @retry="load" />
    </div>
  </PageContainer>
</template>

<style scoped>
.settings-stack {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.subsection-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-ink);
  margin: 12px 0 8px;
}

.super-admin-form {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  align-items: start;
}

.super-admin-form :deep(.field) {
  width: 100%;
}

.form-action-row {
  grid-column: 1 / -1;
}

.admins-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.admin-pill {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.admin-avatar {
  width: 32px;
  height: 32px;
  background: var(--color-primary);
  color: #ffffff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.85rem;
  flex-shrink: 0;
}

.admin-details {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.admin-name {
  font-size: 0.88rem;
  color: var(--color-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.admin-email {
  font-size: 0.76rem;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.super-admin-badge {
  font-size: 0.72rem;
  font-weight: 700;
  color: #b42318;
  background: #fdeceb;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
}

.group {
  display: grid;
  gap: 8px;
  margin-top: 8px;
}

.choice {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 0.92rem;
}

.form-error {
  color: var(--color-danger);
  font-size: 0.88rem;
  font-weight: 600;
}

@media (max-width: 820px) {
  .super-admin-form {
    grid-template-columns: 1fr;
  }
}
</style>
