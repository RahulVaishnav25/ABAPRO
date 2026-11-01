<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { INVITABLE_ROLES, PERMISSIONS, type InvitableRole, type TeamMember } from '@abapro/shared';
import { changeMemberRoleRequest, revokeMemberRequest, teamDirectoryRequest } from '@/api/resources';
import OnboardingTabs from '@/components/onboarding/OnboardingTabs.vue';
import TeamMemberForm from '@/components/organization/TeamMemberForm.vue';
import ActionMenu, { type ActionMenuItem } from '@/components/ui/ActionMenu.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppDialog from '@/components/ui/AppDialog.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTable from '@/components/ui/AppTable.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { roleName } from '@/i18n';
import { formatDateTime } from '@/lib/format';
import { errorMessage, useLoader } from '@/lib/loader';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';

// Parents are onboarded on the Parents tab, with their children.
const STAFF_ROLES = INVITABLE_ROLES.filter((role) => role !== 'parent');

const auth = useAuthStore();
const toast = useToastStore();
const { t } = useI18n();
const members = ref<TeamMember[]>([]);
const search = ref('');
const role = ref('');
const status = ref('active');

const canManage = computed(() => auth.can(PERMISSIONS.teamMembershipManage));
// Creating accounts follows the organisation's member onboarding: administrators only.
const canCreate = computed(() => Boolean(auth.user?.organization) && (auth.user?.platformAdmin === true || auth.user?.role === 'organization_admin'));

const { loading, error, load } = useLoader(async () => {
  members.value = (await teamDirectoryRequest()).members.filter((member) => member.role !== 'parent');
}, t('onboarding.teams.error'));

const memberRole = (member: TeamMember) => roleName(member.role, member.roleLabel);

const filtered = computed(() => {
  const query = search.value.trim().toLowerCase();
  return members.value.filter((member) =>
    (!query || `${member.name} ${member.email} ${member.roleLabel} ${memberRole(member)}`.toLowerCase().includes(query))
    && (!role.value || member.role === role.value)
    && (!status.value || member.status === status.value),
  );
});

const roleOptions = computed(() => [{ value: '', label: t('onboarding.anyRole') }, ...STAFF_ROLES.map((value) => ({ value, label: roleName(value) }))]);
const statusOptions = computed(() => [
  { value: 'active', label: t('onboarding.active') },
  { value: 'revoked', label: t('onboarding.revoked') },
  { value: '', label: t('onboarding.anyStatus') },
]);
const editableRoles = computed(() => STAFF_ROLES.map((value) => ({ value, label: roleName(value) })));
const columns = computed(() => [
  { key: 'name', label: t('onboarding.teams.columns.member'), sortable: true },
  { key: 'role', label: t('onboarding.teams.columns.role'), sortable: true },
  { key: 'clients', label: t('onboarding.teams.columns.clients'), sortable: true, align: 'end' as const },
  { key: 'status', label: t('onboarding.teams.columns.status'), sortable: true },
  { key: 'lastActive', label: t('onboarding.teams.columns.lastActive'), sortable: true },
  { key: 'actions', label: t('onboarding.teams.columns.actions') },
]);
const rows = computed(() =>
  filtered.value.map((member) => ({
    id: member.membershipId,
    name: member.name,
    role: memberRole(member),
    clients: member.assignedClients.length,
    status: member.status === 'active' ? t('onboarding.active') : t('onboarding.revoked'),
    lastActive: member.lastActiveAt ?? '',
    member,
  })),
);
const memberOf = (row: Record<string, unknown>) => row.member as TeamMember;

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = (word?: string) => Array.from(word ?? '')[0] ?? '';
  return (words.length > 1 ? first(words[0]) + first(words[words.length - 1]) : first(words[0])).toLocaleUpperCase() || '?';
}

function actions(member: TeamMember): ActionMenuItem[] {
  const items: ActionMenuItem[] = [{ key: 'view', label: t('onboarding.view') }];
  if (canManage.value && member.status === 'active' && member.role !== 'platform_admin') items.push({ key: 'edit', label: t('onboarding.teams.editRole') });
  if (canManage.value && member.status === 'active' && member.userId !== auth.user?.id) items.push({ key: 'revoke', label: t('onboarding.teams.revoke'), danger: true });
  return items;
}

function onAction(member: TeamMember, key: string): void {
  if (key === 'view') viewing.value = member;
  else if (key === 'edit') startEdit(member);
  else if (key === 'revoke') revoking.value = member;
}

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
    toast.push({ tone: 'success', title: t('onboarding.teams.roleUpdated'), message: t('onboarding.teams.roleUpdatedMessage', { name: member.name, role: roleName(editRole.value) }) });
    editing.value = null;
    await load();
  } catch (saveError) {
    toast.push({ tone: 'danger', title: t('onboarding.teams.roleNotChanged'), message: errorMessage(saveError, t('errors.generic')) });
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
    toast.push({ tone: 'success', title: t('onboarding.teams.revoked'), message: member.name });
    await load();
  } catch (revokeError) {
    toast.push({ tone: 'danger', title: t('onboarding.teams.notRevoked'), message: errorMessage(revokeError, t('errors.generic')) });
  }
}

void load();
</script>

<template>
  <PageContainer>
    <OnboardingTabs />
    <PageHeader :title="t('onboarding.teams.title')" :description="t('onboarding.teams.description')">
      <template #actions>
        <AppButton v-if="canCreate" icon="plus" @click="creating = true">{{ t('onboarding.teams.create') }}</AppButton>
      </template>
    </PageHeader>

    <div class="filter-bar">
      <AppInput v-model="search" type="search" :label="t('onboarding.search')" :placeholder="t('onboarding.teams.searchPlaceholder')" />
      <AppSelect v-model="role" :label="t('onboarding.role')" :options="roleOptions" />
      <AppSelect v-model="status" :label="t('onboarding.status')" :options="statusOptions" />
    </div>

    <ErrorState v-if="error" :title="t('onboarding.teams.unavailable')" :description="error" @retry="load" />
    <AppTable
      v-else
      :caption="t('onboarding.teams.caption')"
      :columns="columns"
      :rows="rows"
      row-key="id"
      :page-size="20"
      :searchable="false"
      :loading="loading"
    >
      <template #cell-name="{ row }">
        <button type="button" class="person" :aria-label="t('onboarding.viewName', { name: row.name })" @click="viewing = memberOf(row)">
          <span class="person-avatar" aria-hidden="true">{{ initials(String(row.name)) }}</span>
          <span class="person-text">
            <strong dir="auto">{{ row.name }}</strong>
            <small>{{ memberOf(row).email }}</small>
          </span>
        </button>
      </template>
      <template #cell-status="{ row }">
        <StatusBadge :tone="memberOf(row).status === 'active' ? 'success' : 'neutral'" :label="String(row.status)" />
      </template>
      <template #cell-lastActive="{ row }">{{ formatDateTime(String(row.lastActive), t('onboarding.never')) }}</template>
      <template #cell-actions="{ row }">
        <ActionMenu :label="t('onboarding.actionsFor', { name: row.name })" :items="actions(memberOf(row))" @select="onAction(memberOf(row), $event)" />
      </template>
      <template #empty>
        <EmptyState
          icon="team"
          :title="members.length ? t('onboarding.teams.noMatches') : t('onboarding.teams.empty')"
          :description="members.length ? t('onboarding.teams.noMatchesHint') : t('onboarding.teams.emptyHint')"
        />
      </template>
    </AppTable>

    <AppDialog :open="creating" :title="t('onboarding.teams.create')" size="lg" @close="creating = false">
      <TeamMemberForm v-if="auth.user?.organization" :organization-id="auth.user.organization.id" :exclude-roles="['parent']" heading="" @created="created">
        <template #actions>
          <AppButton type="button" variant="secondary" @click="creating = false">{{ t('common.cancel') }}</AppButton>
        </template>
      </TeamMemberForm>
    </AppDialog>

    <AppDialog :open="viewing !== null" :title="viewing?.name ?? ''" @close="viewing = null">
      <dl v-if="viewing" class="detail-list">
        <div><dt>{{ t('onboarding.teams.email') }}</dt><dd>{{ viewing.email }}</dd></div>
        <div><dt>{{ t('onboarding.role') }}</dt><dd>{{ memberRole(viewing) }}</dd></div>
        <div>
          <dt>{{ t('onboarding.status') }}</dt>
          <dd><StatusBadge :tone="viewing.status === 'active' ? 'success' : 'neutral'" :label="viewing.status === 'active' ? t('onboarding.active') : t('onboarding.revoked')" /></dd>
        </div>
        <div><dt>{{ t('onboarding.teams.columns.lastActive') }}</dt><dd>{{ formatDateTime(viewing.lastActiveAt, t('onboarding.never')) }}</dd></div>
        <div class="is-wide">
          <dt>{{ t('onboarding.teams.assignedClients') }}</dt>
          <dd>
            <ul v-if="viewing.assignedClients.length" class="client-links">
              <li v-for="client in viewing.assignedClients" :key="client.id"><RouterLink :to="`/clients/${client.id}`">{{ client.name }}</RouterLink></li>
            </ul>
            <span v-else>{{ t('onboarding.none') }}</span>
          </dd>
        </div>
      </dl>
      <template #footer>
        <AppButton variant="secondary" @click="viewing = null">{{ t('onboarding.close') }}</AppButton>
      </template>
    </AppDialog>

    <AppDialog :open="editing !== null" :title="t('onboarding.teams.editTitle', { name: editing?.name ?? '' })" size="sm" @close="editing = null">
      <AppSelect v-model="editRole" :label="t('onboarding.role')" :options="editableRoles" />
      <template #footer>
        <AppButton variant="secondary" @click="editing = null">{{ t('common.cancel') }}</AppButton>
        <AppButton :loading="saving" :disabled="editRole === editing?.role" @click="saveRole">{{ t('onboarding.teams.saveRole') }}</AppButton>
      </template>
    </AppDialog>

    <ConfirmDialog
      :open="revoking !== null"
      :title="t('onboarding.teams.revoke')"
      :message="t('onboarding.teams.revokeMessage', { name: revoking?.name ?? '' })"
      :confirm-label="t('onboarding.teams.revoke')"
      tone="danger"
      @confirm="revoke"
      @cancel="revoking = null"
    />
  </PageContainer>
</template>

<style scoped>
.person {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.person:hover strong,
.person:focus-visible strong {
  color: var(--color-primary-ink);
  text-decoration: underline;
}

.person-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--color-primary-soft);
  color: var(--color-primary-ink);
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1;
}

.person-text {
  display: grid;
  min-width: 0;
}

.person-text strong {
  color: var(--color-ink);
}

.person-text small {
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  text-overflow: ellipsis;
}

.detail-list .is-wide {
  grid-column: 1 / -1;
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
