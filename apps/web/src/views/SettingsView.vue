<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { INVITABLE_ROLES, PERMISSION_CATALOG, ROLE_LABELS, type InvitableRole, type OrganizationSettingsView, type Permission, type RolePermissionState, type SignInAccount } from '@abapro/shared';
import { createInvitationRequest, createSignInAccountRequest, invitationsRequest, organizationSettingsRequest, platformRolesRequest, signInAccountsRequest, updatePlatformRoleRequest } from '@/api/resources';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';

const auth = useAuthStore();
const toast = useToastStore();
const loading = ref(true);
const error = ref('');
const inviteError = ref('');
const settings = ref<OrganizationSettingsView | null>(null);
const invitations = ref<Array<{ id: string; email: string; role: string; expiresAt: string }>>([]);
const email = ref('');
const role = ref<InvitableRole>('therapist');
const sending = ref(false);
const roleOptions = INVITABLE_ROLES.map((value) => ({ value, label: ROLE_LABELS[value] }));
const logoUrl = '/api/v1/organization/branding/logo';
const platformAdmins = ref<SignInAccount[]>([]);
const adminName = ref('');
const adminEmail = ref('');
const adminPassword = ref('');
const adminError = ref('');
const adminSaving = ref(false);
const roleRules = ref<RolePermissionState[]>([]);
const selectedRole = ref<InvitableRole>('therapist');
const selectedPermissions = ref<Permission[]>([]);
const roleSaving = ref(false);
const roleError = ref('');
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

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const [nextSettings, nextInvitations] = await Promise.all([organizationSettingsRequest(), invitationsRequest()]);
    settings.value = nextSettings;
    invitations.value = nextInvitations;
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'Organization settings could not be loaded.';
  } finally {
    loading.value = false;
  }
}

async function invite(): Promise<void> {
  inviteError.value = '';
  sending.value = true;
  try {
    const result = await createInvitationRequest({ email: email.value.trim(), role: role.value });
    email.value = '';
    invitations.value = await invitationsRequest();
    toast.push({
      tone: 'success',
      title: 'Invitation sent',
      message: result.delivery === 'development-mailbox' ? 'The link is in the development mailbox.' : 'Delivery is not configured.',
    });
  } catch (inviteFailure) {
    inviteError.value = inviteFailure instanceof Error ? inviteFailure.message : 'The invitation could not be sent.';
  } finally {
    sending.value = false;
  }
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

async function loadPlatform(): Promise<void> {
  const [accounts, roles] = await Promise.all([signInAccountsRequest(), platformRolesRequest()]);
  platformAdmins.value = accounts.filter((account) => account.platformAdmin);
  roleRules.value = roles;
  chooseRole(selectedRole.value);
}

async function addPlatformAdmin(): Promise<void> {
  adminError.value = '';
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
    toast.push({ tone: 'success', title: 'Platform administrator added' });
    await loadPlatform();
  } catch (createError) {
    adminError.value = createError instanceof Error ? createError.message : 'The platform administrator could not be added.';
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
    roleError.value = saveError instanceof Error ? saveError.message : 'The role rules could not be saved.';
  } finally {
    roleSaving.value = false;
  }
}

onMounted(() => {
  const tasks: Promise<void>[] = [];
  if (auth.user?.platformAdmin) tasks.push(loadPlatform());
  if (auth.user?.organization && auth.can('settings.view')) tasks.push(load());
  else loading.value = false;
  void Promise.all(tasks).catch((loadError: unknown) => {
    error.value = loadError instanceof Error ? loadError.message : 'Settings could not be loaded.';
    loading.value = false;
  });
});
</script>

<template>
  <PageContainer>
    <PageHeader
      title="Settings"
      :description="auth.user?.platformAdmin ? 'Portal role rules, platform administrators, and clinic settings when a clinic is open.' : 'Clinic profile, staff, and the options that can wait until later.'"
    />
    <div class="settings">
      <template v-if="auth.user?.platformAdmin">
        <section>
          <h2>Platform administrators</h2>
          <p>Add another platform administrator. They can sign in with this email and password and do not belong to a clinic.</p>
          <p v-if="adminError" class="form-error" role="alert">{{ adminError }}</p>
          <form class="admin-form" @submit.prevent="addPlatformAdmin">
            <AppInput v-model="adminName" label="Name" required />
            <AppInput v-model="adminEmail" label="Email" type="email" required />
            <AppInput v-model="adminPassword" label="Password" type="password" hint="At least 10 characters." required />
            <div class="admin-actions">
              <AppButton type="submit" :loading="adminSaving">Add platform administrator</AppButton>
            </div>
          </form>
          <ul>
            <li v-for="account in platformAdmins" :key="account.id">{{ account.name }} · {{ account.email }}</li>
          </ul>
        </section>
        <section>
          <h2>Role rules</h2>
          <p>These rules apply throughout the portal. A role can only receive responsibilities inside its limit.</p>
          <p v-if="roleError" class="form-error" role="alert">{{ roleError }}</p>
          <AppSelect :model-value="selectedRole" label="Role" :options="roleOptions" @update:model-value="chooseRole($event as InvitableRole)" />
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
          <AppButton :loading="roleSaving" @click="saveRole">Save role rules</AppButton>
        </section>
      </template>
      <section v-if="auth.user?.organization && auth.can('team.view')">
        <h2>Team</h2>
        <p>Invite staff and review who can work with each client.</p>
        <RouterLink to="/team">Open team</RouterLink>
      </section>
      <SkeletonBlock v-if="loading" />
      <ErrorState v-else-if="error" title="Settings unavailable" :description="error" @retry="load" />
      <template v-else-if="settings">
      <section>
        <h2>Branding</h2>
        <p>{{ settings.displayName }}</p>
        <p>{{ settings.contactEmail }} · {{ settings.country }} · {{ settings.timezone }} · {{ settings.locale }}</p>
        <p>Primary color <span class="swatch" :style="{ background: settings.primaryColor }"></span> {{ settings.primaryColor }}</p>
        <img v-if="settings.hasLogo" :src="logoUrl" alt="Organization logo" />
      </section>
      <section>
        <h2>Invite a team member</h2>
        <p v-if="inviteError" class="form-error" role="alert">{{ inviteError }}</p>
        <form class="invite" @submit.prevent="invite">
          <AppInput v-model="email" label="Email" type="email" required />
          <AppSelect v-model="role" label="Role" :options="roleOptions" />
          <AppButton type="submit" :loading="sending">Send invitation</AppButton>
        </form>
        <ul>
          <li v-for="invitation in invitations" :key="invitation.id">
            {{ invitation.email }} · {{ ROLE_LABELS[invitation.role as InvitableRole] ?? invitation.role }}
          </li>
        </ul>
        <p v-if="invitations.length === 0">No pending invitations.</p>
      </section>
      <section>
        <h2>Not implemented yet</h2>
        <p>Billing, clinical configuration, and notification preferences are not available in this phase.</p>
      </section>
      </template>
    </div>
  </PageContainer>
</template>

<style scoped>
.settings { display: grid; gap: 16px; }
a { font-weight: 700; width: fit-content; }
section {
  display: grid;
  gap: 10px;
  padding: 20px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}
.invite { display: grid; grid-template-columns: 1fr 220px auto; gap: 12px; align-items: end; }
.admin-form {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  align-items: start;
}
.admin-form :deep(.field) {
  width: 100%;
}
.admin-actions {
  grid-column: 1 / -1;
}
.swatch { display: inline-block; width: 14px; height: 14px; border-radius: 4px; vertical-align: middle; border: 1px solid var(--color-border); }
img { width: 96px; height: 96px; object-fit: contain; border: 1px solid var(--color-border); border-radius: 8px; }
ul { margin: 0; padding-left: 18px; }
.form-error { color: var(--color-danger); }
.group { display: grid; gap: 8px; }
.choice { display: flex; gap: 8px; align-items: center; }
h3 { margin: 8px 0 0; font-size: 0.95rem; }
@media (max-width: 800px) {
  .invite,
  .admin-form { grid-template-columns: 1fr; }
}
</style>
