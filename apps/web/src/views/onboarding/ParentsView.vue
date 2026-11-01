<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ParentAccountSummary } from '@abapro/shared';
import { createParentRequest, parentsRequest, setParentClientsRequest } from '@/api/parents';
import AppIcon from '@/components/navigation/AppIcon.vue';
import ClientMultiPicker from '@/components/onboarding/ClientMultiPicker.vue';
import OnboardingTabs from '@/components/onboarding/OnboardingTabs.vue';
import ActionMenu, { type ActionMenuItem } from '@/components/ui/ActionMenu.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppDialog from '@/components/ui/AppDialog.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTable from '@/components/ui/AppTable.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import type { BadgeTone } from '@/components/ui/types';
import { formatDateTime, formatDayOf } from '@/lib/format';
import { errorMessage, useLoader } from '@/lib/loader';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';

const auth = useAuthStore();
const toast = useToastStore();
const { t } = useI18n();
const parents = ref<ParentAccountSummary[]>([]);
const search = ref('');
const status = ref('');

// Creating accounts follows the organisation's member onboarding: administrators only.
const canCreate = computed(() => auth.user?.platformAdmin === true || auth.user?.role === 'organization_admin');

const { loading, error, load } = useLoader(async () => {
  parents.value = await parentsRequest();
}, t('onboarding.parents.error'));

const filtered = computed(() => {
  const query = search.value.trim().toLowerCase();
  return parents.value.filter((parent) =>
    (!query || [parent.name, parent.email, ...parent.linkedClients.flatMap((client) => [client.displayName, client.clientCode])].join(' ').toLowerCase().includes(query))
    && (!status.value || parent.portalStatus === status.value),
  );
});

const statusOptions = computed(() => [
  { value: '', label: t('onboarding.parents.any') },
  { value: 'active', label: t('onboarding.active') },
  { value: 'pending', label: t('onboarding.pending') },
]);
const columns = computed(() => [
  { key: 'name', label: t('onboarding.parents.columns.parent'), sortable: true },
  { key: 'clients', label: t('onboarding.parents.columns.clients') },
  { key: 'portal', label: t('onboarding.parents.columns.portal'), sortable: true },
  { key: 'added', label: t('onboarding.parents.columns.added'), sortable: true },
  { key: 'actions', label: t('onboarding.parents.columns.actions') },
]);

/** Portal access as a badge: revoked, active, or pending until a client is linked. */
function access(parent: ParentAccountSummary): { tone: BadgeTone; label: string } {
  if (parent.membershipStatus === 'revoked') return { tone: 'neutral', label: t('onboarding.revoked') };
  return parent.portalStatus === 'active' ? { tone: 'success', label: t('onboarding.active') } : { tone: 'warning', label: t('onboarding.pending') };
}

const rows = computed(() =>
  filtered.value.map((parent) => ({ id: parent.userId, name: parent.name, portal: access(parent).label, added: parent.createdAt, parent })),
);
const parentOf = (row: Record<string, unknown>) => row.parent as ParentAccountSummary;

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = (word?: string) => Array.from(word ?? '')[0] ?? '';
  return (words.length > 1 ? first(words[0]) + first(words[words.length - 1]) : first(words[0])).toLocaleUpperCase() || '?';
}

function actions(parent: ParentAccountSummary): ActionMenuItem[] {
  const items: ActionMenuItem[] = [{ key: 'view', label: t('onboarding.view') }];
  if (parent.membershipStatus === 'active') items.push({ key: 'manage', label: t('onboarding.parents.manage') });
  return items;
}

function onAction(parent: ParentAccountSummary, key: string): void {
  if (key === 'view') viewing.value = parent;
  else startLinking(parent);
}

function replace(updated: ParentAccountSummary): void {
  const index = parents.value.findIndex((parent) => parent.userId === updated.userId);
  if (index === -1) parents.value = [...parents.value, updated].sort((a, b) => a.name.localeCompare(b.name));
  else parents.value = parents.value.map((parent) => (parent.userId === updated.userId ? updated : parent));
}

// Onboard.
const onboarding = ref(false);
const saving = ref(false);
const form = reactive({ name: '', email: '', password: '', clientIds: [] as string[] });
const formError = ref('');

function startOnboarding(): void {
  Object.assign(form, { name: '', email: '', password: '', clientIds: [] });
  formError.value = '';
  onboarding.value = true;
}

async function onboard(): Promise<void> {
  formError.value = '';
  if (form.name.trim().length < 2 || !form.email.includes('@') || form.password.length < 10) {
    formError.value = t('onboarding.parents.invalid');
    return;
  }
  saving.value = true;
  try {
    const created = await createParentRequest({ name: form.name.trim(), email: form.email.trim(), password: form.password, clientIds: form.clientIds });
    replace(created);
    onboarding.value = false;
    toast.push(created.portalStatus === 'active'
      ? { tone: 'success', title: t('onboarding.parents.onboarded'), message: t('onboarding.parents.onboardedMessage', { name: created.name }) }
      : { tone: 'info', title: t('onboarding.parents.onboardedPending'), message: t('onboarding.parents.onboardedPendingMessage', { name: created.name }) });
  } catch (onboardError) {
    formError.value = errorMessage(onboardError, t('onboarding.parents.onboardError'));
  } finally {
    saving.value = false;
  }
}

// View and manage linked clients.
const viewing = ref<ParentAccountSummary | null>(null);
const linking = ref<ParentAccountSummary | null>(null);
const linkIds = ref<string[]>([]);

function startLinking(parent: ParentAccountSummary): void {
  viewing.value = null;
  linking.value = parent;
  linkIds.value = parent.linkedClients.map((client) => client.id);
}

async function saveLinks(): Promise<void> {
  const parent = linking.value;
  if (!parent) return;
  saving.value = true;
  try {
    const updated = await setParentClientsRequest(parent.userId, linkIds.value);
    replace(updated);
    linking.value = null;
    toast.push({
      tone: 'success',
      title: t('onboarding.parents.linksUpdated'),
      message: updated.portalStatus === 'active' ? t('onboarding.parents.canSignIn', { name: updated.name }) : t('onboarding.parents.pendingUntil', { name: updated.name }),
    });
  } catch (linkError) {
    toast.push({ tone: 'danger', title: t('onboarding.parents.linksNotSaved'), message: errorMessage(linkError, t('errors.generic')) });
  } finally {
    saving.value = false;
  }
}

void load();
</script>

<template>
  <PageContainer>
    <OnboardingTabs />
    <PageHeader :title="t('onboarding.parents.title')" :description="t('onboarding.parents.description')">
      <template #actions>
        <AppButton v-if="canCreate" icon="plus" @click="startOnboarding">{{ t('onboarding.parents.onboard') }}</AppButton>
      </template>
    </PageHeader>

    <div class="filter-bar">
      <AppInput v-model="search" type="search" :label="t('onboarding.search')" :placeholder="t('onboarding.parents.searchPlaceholder')" />
      <AppSelect v-model="status" :label="t('onboarding.parents.portal')" :options="statusOptions" />
    </div>

    <ErrorState v-if="error" :title="t('onboarding.parents.unavailable')" :description="error" @retry="load" />
    <AppTable
      v-else
      :caption="t('onboarding.parents.caption')"
      :columns="columns"
      :rows="rows"
      row-key="id"
      :page-size="20"
      :searchable="false"
      :loading="loading"
    >
      <template #cell-name="{ row }">
        <button type="button" class="person" :aria-label="t('onboarding.viewName', { name: row.name })" @click="viewing = parentOf(row)">
          <span class="person-avatar" aria-hidden="true">{{ initials(String(row.name)) }}</span>
          <span class="person-text">
            <strong dir="auto">{{ row.name }}</strong>
            <small>{{ parentOf(row).email }}</small>
          </span>
        </button>
      </template>
      <template #cell-clients="{ row }">
        <span v-if="parentOf(row).linkedClients.length === 0" class="muted">{{ t('onboarding.none') }}</span>
        <span v-else class="client-chips">
          <RouterLink v-for="client in parentOf(row).linkedClients" :key="client.id" class="client-chip" :to="`/clients/${client.id}`">
            <span dir="auto">{{ client.displayName }}</span>
            <span class="client-chip-code">{{ client.clientCode }}</span>
          </RouterLink>
        </span>
      </template>
      <template #cell-portal="{ row }">
        <StatusBadge
          :tone="access(parentOf(row)).tone"
          :label="access(parentOf(row)).label"
          :title="parentOf(row).portalStatus === 'pending' ? t('onboarding.parents.pendingHint') : undefined"
        />
      </template>
      <template #cell-added="{ row }">{{ formatDayOf(String(row.added)) }}</template>
      <template #cell-actions="{ row }">
        <ActionMenu :label="t('onboarding.actionsFor', { name: row.name })" :items="actions(parentOf(row))" @select="onAction(parentOf(row), $event)" />
      </template>
      <template #empty>
        <EmptyState
          icon="user"
          :title="parents.length ? t('onboarding.parents.noMatches') : t('onboarding.parents.empty')"
          :description="parents.length ? t('onboarding.parents.noMatchesHint') : t('onboarding.parents.emptyHint')"
        />
      </template>
    </AppTable>

    <AppDialog :open="onboarding" :title="t('onboarding.parents.onboardTitle')" size="lg" @close="onboarding = false">
      <form id="onboard-parent" class="form-stack" novalidate @submit.prevent="onboard">
        <p v-if="formError" class="form-alert" role="alert"><AppIcon name="alert" :size="16" />{{ formError }}</p>
        <div class="form-grid">
          <AppInput v-model="form.name" :label="t('onboarding.parents.name')" required />
          <AppInput v-model="form.email" :label="t('onboarding.parents.email')" type="email" required autocomplete="off" />
          <AppInput v-model="form.password" :label="t('onboarding.parents.password')" type="password" required autocomplete="new-password" :hint="t('onboarding.parents.passwordHint')" />
        </div>
        <ClientMultiPicker v-model="form.clientIds" :label="t('onboarding.parents.linkLabel')" :hint="t('onboarding.parents.linkHint')" />
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="onboarding = false">{{ t('common.cancel') }}</AppButton>
        <AppButton type="submit" form="onboard-parent" :loading="saving">
          {{ form.clientIds.length ? t('onboarding.parents.onboardLink') : t('onboarding.parents.onboardPending') }}
        </AppButton>
      </template>
    </AppDialog>

    <AppDialog :open="viewing !== null" :title="viewing?.name ?? ''" @close="viewing = null">
      <dl v-if="viewing" class="detail-list">
        <div><dt>{{ t('onboarding.parents.email') }}</dt><dd>{{ viewing.email }}</dd></div>
        <div>
          <dt>{{ t('onboarding.parents.portal') }}</dt>
          <dd>
            <StatusBadge :tone="access(viewing).tone" :label="access(viewing).label" />
            <p v-if="viewing.membershipStatus !== 'revoked' && viewing.portalStatus === 'pending'" class="muted pending-note">{{ t('onboarding.parents.pendingHint') }}</p>
          </dd>
        </div>
        <div><dt>{{ t('onboarding.parents.added') }}</dt><dd>{{ formatDateTime(viewing.createdAt) }}</dd></div>
        <div><dt>{{ t('onboarding.parents.lastActive') }}</dt><dd>{{ formatDateTime(viewing.lastActiveAt, t('onboarding.never')) }}</dd></div>
        <div class="is-wide">
          <dt>{{ t('onboarding.parents.linkedClients') }}</dt>
          <dd>
            <ul v-if="viewing.linkedClients.length" class="client-links">
              <li v-for="client in viewing.linkedClients" :key="client.id">
                <RouterLink :to="`/clients/${client.id}`">{{ client.displayName }}</RouterLink> · {{ client.clientCode }}
              </li>
            </ul>
            <span v-else>{{ t('onboarding.none') }}</span>
          </dd>
        </div>
      </dl>
      <template #footer>
        <AppButton variant="secondary" @click="viewing = null">{{ t('onboarding.close') }}</AppButton>
        <AppButton v-if="viewing?.membershipStatus === 'active'" @click="viewing && startLinking(viewing)">{{ t('onboarding.parents.manage') }}</AppButton>
      </template>
    </AppDialog>

    <AppDialog :open="linking !== null" :title="t('onboarding.parents.linksTitle', { name: linking?.name ?? '' })" size="lg" @close="linking = null">
      <ClientMultiPicker v-if="linking" v-model="linkIds" :label="t('onboarding.parents.linksLabel')" :hint="t('onboarding.parents.linksHint')" />
      <template #footer>
        <AppButton variant="secondary" @click="linking = null">{{ t('common.cancel') }}</AppButton>
        <AppButton :loading="saving" @click="saveLinks">{{ t('onboarding.parents.saveLinks') }}</AppButton>
      </template>
    </AppDialog>
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
  background: var(--color-warning-soft);
  color: var(--color-warning);
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

.muted {
  color: var(--color-text-muted);
}

.client-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.client-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-radius: var(--radius-full);
  background: var(--color-surface-sunken);
  color: var(--color-ink);
  font-size: var(--text-sm);
  text-decoration: none;
  white-space: nowrap;
}

.client-chip:hover {
  background: var(--color-primary-soft);
  color: var(--color-primary-ink);
}

.client-chip-code {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}

.pending-note {
  margin-top: 4px;
  font-size: var(--text-sm);
}

.detail-list .is-wide {
  grid-column: 1 / -1;
}

.client-links {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
