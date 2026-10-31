<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { INVITABLE_ROLES, PERMISSIONS, ROLE_LABELS, type InvitableRole, type TeamMember } from '@abapro/shared';
import { changeMemberRoleRequest, revokeMemberRequest, teamDirectoryRequest } from '@/api/resources';
import OnboardingTabs from '@/components/onboarding/OnboardingTabs.vue';
import TeamMemberForm from '@/components/organization/TeamMemberForm.vue';
import ActionMenu from '@/components/therapist/ActionMenu.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppDialog from '@/components/ui/AppDialog.vue';
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
import { errorMessage, useLoader } from '@/lib/loader';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';

const PAGE_SIZE = 20;
// Parents are onboarded on the Parents tab, with their children.
const STAFF_ROLES = INVITABLE_ROLES.filter((role) => role !== 'parent');

const auth = useAuthStore();
const toast = useToastStore();
const members = ref<TeamMember[]>([]);
const search = ref('');
const role = ref('');
const status = ref('active');
const page = ref(1);

const timeZone = computed(() => auth.user?.organization?.timezone ?? 'UTC');
const canManage = computed(() => auth.can(PERMISSIONS.teamMembershipManage));
// Creating accounts follows the organisation's member onboarding: administrators only.
const canCreate = computed(() => Boolean(auth.user?.organization) && (auth.user?.platformAdmin === true || auth.user?.role === 'organization_admin'));

const { loading, error, load } = useLoader(async () => {
  members.value = (await teamDirectoryRequest()).members.filter((member) => member.role !== 'parent');
}, 'The team could not be loaded.');

const filtered = computed(() => {
  const query = search.value.trim().toLowerCase();
  return members.value.filter((member) =>
    (!query || `${member.name} ${member.email} ${member.roleLabel}`.toLowerCase().includes(query))
    && (!role.value || member.role === role.value)
    && (!status.value || member.status === status.value),
  );
});
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)));
const paged = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE));
const rangeStart = computed(() => (filtered.value.length === 0 ? 0 : (page.value - 1) * PAGE_SIZE + 1));
const rangeEnd = computed(() => Math.min(page.value * PAGE_SIZE, filtered.value.length));
watch([search, role, status], () => (page.value = 1));
watch(pageCount, (count) => {
  if (page.value > count) page.value = count;
});

const roleOptions = [{ value: '', label: 'Any role' }, ...STAFF_ROLES.map((value) => ({ value, label: ROLE_LABELS[value] }))];
const editableRoles = STAFF_ROLES.map((value) => ({ value, label: ROLE_LABELS[value] }));

// Create.
const creating = ref(false);
async function created(): Promise<void> {
  creating.value = false;
  await load();
}

// View and edit.
const viewing = ref<TeamMember | null>(null);
const editing = ref<TeamMember | null>(null);
const editRole = ref<InvitableRole>('therapist');
const saving = ref(false);

function startEdit(member: TeamMember): void {
  editing.value = member;
  editRole.value = member.role as InvitableRole;
}

async function saveRole(): Promise<void> {
  const member = editing.value;
  if (!member) return;
  saving.value = true;
  try {
    await changeMemberRoleRequest(member.membershipId, editRole.value);
    toast.push({ tone: 'success', title: 'Role updated', message: `${member.name} is now ${ROLE_LABELS[editRole.value]}.` });
    editing.value = null;
    await load();
  } catch (saveError) {
    toast.push({ tone: 'danger', title: 'Role not changed', message: errorMessage(saveError, 'Try again.') });
  } finally {
    saving.value = false;
  }
}

// Revoke.
const revoking = ref<TeamMember | null>(null);
async function revoke(): Promise<void> {
  const member = revoking.value;
  if (!member) return;
  revoking.value = null;
  try {
    await revokeMemberRequest(member.membershipId);
    toast.push({ tone: 'success', title: 'Access revoked', message: member.name });
    await load();
  } catch (revokeError) {
    toast.push({ tone: 'danger', title: 'Access not revoked', message: errorMessage(revokeError, 'Try again.') });
  }
}

function actions(member: TeamMember) {
  return member.status === 'active' && member.userId !== auth.user?.id ? [{ key: 'revoke', label: 'Revoke access' }] : [];
}

void load();
</script>

<template>
  <PageContainer>
    <OnboardingTabs />
    <PageHeader title="Teams" description="Everyone on the organisation’s team, their roles and the clients they work with.">
      <template #actions>
        <AppButton v-if="canCreate" @click="creating = true">Create Team</AppButton>
      </template>
    </PageHeader>

    <div class="filter-bar">
      <AppInput v-model="search" label="Search" placeholder="Name, email or role" />
      <AppSelect v-model="role" label="Role" :options="roleOptions" />
      <AppSelect v-model="status" label="Status" :options="[{ value: 'active', label: 'Active' }, { value: 'revoked', label: 'Revoked' }, { value: '', label: 'Any status' }]" />
    </div>

    <SkeletonBlock v-if="loading" height="240px" />
    <ErrorState v-else-if="error" title="Team unavailable" :description="error" @retry="load" />
    <EmptyState
      v-else-if="filtered.length === 0"
      :title="members.length ? 'No team members match' : 'No team members yet'"
      :description="members.length ? 'Adjust the search or filters.' : 'Create a team member to get started.'"
    />
    <div v-else class="table-wrap panel">
      <table>
        <caption>Team directory</caption>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Clients</th>
            <th>Status</th>
            <th>Last active</th>
            <th class="actions-col">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="member in paged" :key="member.membershipId">
            <td><strong>{{ member.name }}</strong></td>
            <td>{{ member.email }}</td>
            <td>{{ member.roleLabel }}</td>
            <td>{{ member.assignedClients.length }}</td>
            <td><StatusBadge :tone="member.status === 'active' ? 'success' : 'neutral'" :label="member.status === 'active' ? 'Active' : 'Revoked'" /></td>
            <td>{{ member.lastActiveAt ? formatDateTime(member.lastActiveAt, timeZone) : 'Never' }}</td>
            <td>
              <div class="row-actions">
                <AppButton size="sm" variant="secondary" :aria-label="`View ${member.name}`" @click="viewing = member">View</AppButton>
                <AppButton
                  v-if="canManage && member.status === 'active' && member.role !== 'platform_admin'"
                  size="sm"
                  variant="secondary"
                  :aria-label="`Edit ${member.name}`"
                  @click="startEdit(member)"
                >
                  Edit
                </AppButton>
                <ActionMenu
                  v-if="canManage && actions(member).length"
                  :label="`More actions for ${member.name}`"
                  :items="actions(member)"
                  @select="revoking = member"
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="!loading && !error && filtered.length > 0" class="pager">
      <span>Showing {{ rangeStart }}–{{ rangeEnd }} of {{ filtered.length }}</span>
      <AppButton variant="secondary" size="sm" :disabled="page <= 1" @click="page -= 1">Previous</AppButton>
      <span>Page {{ page }} of {{ pageCount }}</span>
      <AppButton variant="secondary" size="sm" :disabled="page >= pageCount" @click="page += 1">Next</AppButton>
    </div>

    <AppDialog :open="creating" title="Create team member" wide @close="creating = false">
      <TeamMemberForm v-if="auth.user?.organization" :organization-id="auth.user.organization.id" :exclude-roles="['parent']" heading="" @created="created">
        <template #actions>
          <AppButton type="button" variant="secondary" @click="creating = false">Cancel</AppButton>
        </template>
      </TeamMemberForm>
    </AppDialog>

    <AppDialog :open="viewing !== null" :title="viewing?.name ?? ''" @close="viewing = null">
      <dl v-if="viewing" class="details">
        <div><dt>Email</dt><dd>{{ viewing.email }}</dd></div>
        <div><dt>Role</dt><dd>{{ viewing.roleLabel }}</dd></div>
        <div><dt>Status</dt><dd>{{ viewing.status === 'active' ? 'Active' : 'Revoked' }}</dd></div>
        <div><dt>Last active</dt><dd>{{ viewing.lastActiveAt ? formatDateTime(viewing.lastActiveAt, timeZone) : 'Never' }}</dd></div>
        <div class="is-wide">
          <dt>Assigned clients</dt>
          <dd>
            <ul v-if="viewing.assignedClients.length" class="client-links">
              <li v-for="client in viewing.assignedClients" :key="client.id"><RouterLink :to="`/clients/${client.id}`">{{ client.name }}</RouterLink></li>
            </ul>
            <span v-else>None</span>
          </dd>
        </div>
      </dl>
      <template #footer>
        <AppButton variant="secondary" @click="viewing = null">Close</AppButton>
      </template>
    </AppDialog>

    <AppDialog :open="editing !== null" :title="`Edit ${editing?.name ?? ''}`" @close="editing = null">
      <AppSelect v-model="editRole" label="Role" :options="editableRoles" />
      <template #footer>
        <AppButton variant="secondary" @click="editing = null">Cancel</AppButton>
        <AppButton :loading="saving" :disabled="editRole === editing?.role" @click="saveRole">Save role</AppButton>
      </template>
    </AppDialog>

    <ConfirmDialog
      :open="revoking !== null"
      title="Revoke access"
      :message="`${revoking?.name ?? ''} will lose access to this organisation.`"
      confirm-label="Revoke access"
      tone="danger"
      @confirm="revoke"
      @cancel="revoking = null"
    />
  </PageContainer>
</template>

<style scoped>
.table-wrap {
  overflow-x: auto;
  padding: 12px;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  text-align: left;
  vertical-align: middle;
  padding: 10px 8px;
  border-bottom: 1px solid var(--color-border);
}

caption {
  text-align: left;
  font-weight: 700;
  margin-bottom: 8px;
}

.pager {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 12px;
  color: var(--color-text-muted);
}

.row-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.actions-col {
  width: 1%;
  white-space: nowrap;
}

.details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
  margin: 8px 0 0;
}

.details .is-wide {
  grid-column: 1 / -1;
}

.details dt {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--color-text-muted);
}

.details dd {
  margin: 2px 0 0;
  color: var(--color-ink);
}

.client-links {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
