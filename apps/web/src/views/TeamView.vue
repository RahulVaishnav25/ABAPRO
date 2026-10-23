<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  INVITABLE_ROLES,
  ROLE_LABELS,
  type InvitableRole,
  type TeamDirectory,
} from '@abapro/shared';
import {
  changeMemberRoleRequest,
  createInvitationRequest,
  revokeInvitationRequest,
  revokeMemberRequest,
  teamDirectoryRequest,
} from '@/api/resources';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { formatDateTime } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';

const auth = useAuthStore();
const toast = useToastStore();
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const directory = ref<TeamDirectory | null>(null);
const inviteEmail = ref('');
const inviteRole = ref<InvitableRole>('therapist');
const inviteError = ref('');
const pendingRoles = ref<Record<string, InvitableRole>>({});
const confirm = ref<{ title: string; message: string; tone: 'primary' | 'danger'; action: () => Promise<void> } | null>(null);

const canManage = computed(() => auth.can('team.membership.manage'));
const roleOptions = INVITABLE_ROLES.map((value) => ({ value, label: ROLE_LABELS[value] }));
const timeZone = computed(() => auth.user?.organization?.timezone ?? 'UTC');

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    directory.value = await teamDirectoryRequest();
    pendingRoles.value = Object.fromEntries(
      directory.value.members
        .filter((member) => member.role !== 'platform_admin')
        .map((member) => [member.membershipId, member.role as InvitableRole]),
    );
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'The team directory could not be loaded.';
  } finally {
    loading.value = false;
  }
}

function ask(title: string, message: string, tone: 'primary' | 'danger', action: () => Promise<void>): void {
  confirm.value = { title, message, tone, action };
}

async function runConfirm(): Promise<void> {
  const pending = confirm.value;
  if (!pending) return;
  confirm.value = null;
  saving.value = true;
  try {
    await pending.action();
  } catch (actionError) {
    toast.push({
      tone: 'danger',
      title: 'Change not saved',
      message: actionError instanceof Error ? actionError.message : 'The change could not be saved.',
    });
  } finally {
    saving.value = false;
  }
}

function changeRole(membershipId: string, name: string): void {
  const role = pendingRoles.value[membershipId];
  if (!role) return;
  ask('Change organization role', `Change ${name} to ${ROLE_LABELS[role]}?`, 'primary', async () => {
    await changeMemberRoleRequest(membershipId, role);
    toast.push({ tone: 'success', title: 'Role updated', message: name });
    await load();
  });
}

function revokeMember(membershipId: string, name: string): void {
  ask('Revoke access', `${name} will lose access to this organization.`, 'danger', async () => {
    await revokeMemberRequest(membershipId);
    toast.push({ tone: 'success', title: 'Access revoked', message: name });
    await load();
  });
}

function revokeInvite(invitationId: string, email: string): void {
  ask('Revoke invitation', `Revoke the invitation for ${email}?`, 'danger', async () => {
    await revokeInvitationRequest(invitationId);
    toast.push({ tone: 'success', title: 'Invitation revoked', message: email });
    await load();
  });
}

async function invite(): Promise<void> {
  inviteError.value = '';
  saving.value = true;
  try {
    const result = await createInvitationRequest({ email: inviteEmail.value.trim(), role: inviteRole.value });
    inviteEmail.value = '';
    toast.push({
      tone: 'success',
      title: 'Invitation sent',
      message: result.delivery === 'development-mailbox' ? 'The link is in the development mailbox.' : 'Delivery is not configured.',
    });
    await load();
  } catch (inviteFailure) {
    inviteError.value = inviteFailure instanceof Error ? inviteFailure.message : 'The invitation could not be sent.';
  } finally {
    saving.value = false;
  }
}

function activity(value: string | null): string {
  return value ? formatDateTime(value, timeZone.value) : 'No activity yet';
}

onMounted(() => {
  void load();
});
</script>

<template>
  <PageContainer>
    <PageHeader
      title="Team"
      description="Membership, client assignments, and the permissions each role can use in this organization."
    />
    <SkeletonBlock v-if="loading" height="220px" />
    <ErrorState v-else-if="error" title="Team directory unavailable" :description="error" @retry="load" />
    <div v-else-if="directory" class="team">
      <section class="panel">
        <h2>Members</h2>
        <EmptyState v-if="directory.members.length === 0" title="No members" description="Invite a teammate to begin." />
        <div v-else class="table-wrap">
          <table>
            <caption>Organization members</caption>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Assigned clients</th>
                <th>Status</th>
                <th>Last activity</th>
                <th v-if="canManage">Access</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="member in directory.members" :key="member.membershipId">
                <td>{{ member.name }}</td>
                <td>{{ member.email }}</td>
                <td>
                  <AppSelect
                    v-if="canManage && member.role !== 'platform_admin' && member.userId !== auth.user?.id && member.status === 'active'"
                    :model-value="pendingRoles[member.membershipId] ?? member.role"
                    :label="`${member.name} role`"
                    :options="roleOptions"
                    @update:model-value="pendingRoles[member.membershipId] = $event as InvitableRole"
                  />
                  <span v-else>{{ member.roleLabel }}</span>
                </td>
                <td>{{ member.assignedClients.length ? member.assignedClients.map((client) => client.name).join(', ') : 'None' }}</td>
                <td>
                  <StatusBadge :tone="member.status === 'active' ? 'success' : 'danger'" :label="member.status === 'active' ? 'Active' : 'Revoked'" />
                </td>
                <td>{{ activity(member.lastActiveAt) }}</td>
                <td v-if="canManage" class="actions">
                  <template v-if="member.userId !== auth.user?.id && member.role !== 'platform_admin' && member.status === 'active'">
                    <AppButton size="sm" variant="secondary" :disabled="saving" @click="changeRole(member.membershipId, member.name)">
                      Update role
                    </AppButton>
                    <AppButton size="sm" variant="danger" :disabled="saving" @click="revokeMember(member.membershipId, member.name)">
                      Revoke
                    </AppButton>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <h2>Invitations</h2>
        <form v-if="canManage" class="invite" @submit.prevent="invite">
          <p v-if="inviteError" class="form-error" role="alert">{{ inviteError }}</p>
          <AppInput v-model="inviteEmail" label="Email" type="email" required />
          <AppSelect v-model="inviteRole" label="Role" :options="roleOptions" />
          <AppButton type="submit" :loading="saving">Send invitation</AppButton>
        </form>
        <EmptyState v-if="directory.invitations.length === 0" title="No invitations" description="Pending invitations appear here." />
        <ul v-else class="invites">
          <li v-for="invitation in directory.invitations" :key="invitation.id">
            <span>{{ invitation.email }} · {{ ROLE_LABELS[invitation.role] }}</span>
            <StatusBadge
              :tone="invitation.status === 'pending' ? 'info' : invitation.status === 'accepted' ? 'success' : 'neutral'"
              :label="invitation.status"
            />
            <AppButton
              v-if="canManage && invitation.status === 'pending'"
              size="sm"
              variant="ghost"
              @click="revokeInvite(invitation.id, invitation.email)"
            >
              Revoke
            </AppButton>
          </li>
        </ul>
      </section>

    </div>
    <ConfirmDialog
      :open="Boolean(confirm)"
      :title="confirm?.title ?? ''"
      :message="confirm?.message ?? ''"
      :tone="confirm?.tone ?? 'primary'"
      confirm-label="Confirm"
      @confirm="runConfirm"
      @cancel="confirm = null"
    />
  </PageContainer>
</template>

<style scoped>
.team {
  display: grid;
  gap: 16px;
}

.panel {
  display: grid;
  gap: 12px;
  padding: 16px;
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th, td {
  text-align: left;
  vertical-align: top;
  padding: 10px 8px;
  border-bottom: 1px solid var(--color-border);
}

caption {
  text-align: left;
  font-weight: 700;
  margin-bottom: 8px;
}

.actions, .invite, .invites, .group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: end;
}

.invites {
  list-style: none;
  padding: 0;
  margin: 0;
}

.invites li, .choice {
  display: flex;
  gap: 8px;
  align-items: center;
}

.group {
  display: grid;
  justify-items: start;
}

h2, h3 {
  margin: 0;
}

.form-error {
  color: var(--color-danger);
}
</style>
