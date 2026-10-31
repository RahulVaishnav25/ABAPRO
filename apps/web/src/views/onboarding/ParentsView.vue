<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { ParentAccountSummary } from '@abapro/shared';
import { createParentRequest, parentsRequest, setParentClientsRequest } from '@/api/parents';
import ClientMultiPicker from '@/components/onboarding/ClientMultiPicker.vue';
import OnboardingTabs from '@/components/onboarding/OnboardingTabs.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppDialog from '@/components/ui/AppDialog.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
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
const PENDING_HINT = 'Pending: cannot sign in until a client is linked.';

const auth = useAuthStore();
const toast = useToastStore();
const parents = ref<ParentAccountSummary[]>([]);
const search = ref('');
const status = ref('');
const page = ref(1);

const timeZone = computed(() => auth.user?.organization?.timezone ?? 'UTC');
// Creating accounts follows the organisation's member onboarding: administrators only.
const canCreate = computed(() => auth.user?.platformAdmin === true || auth.user?.role === 'organization_admin');

const { loading, error, load } = useLoader(async () => {
  parents.value = await parentsRequest();
}, 'Parent accounts could not be loaded.');

const filtered = computed(() => {
  const query = search.value.trim().toLowerCase();
  return parents.value.filter((parent) =>
    (!query || [parent.name, parent.email, ...parent.linkedClients.flatMap((client) => [client.displayName, client.clientCode])].join(' ').toLowerCase().includes(query))
    && (!status.value || parent.portalStatus === status.value),
  );
});
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)));
const paged = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE));
const rangeStart = computed(() => (filtered.value.length === 0 ? 0 : (page.value - 1) * PAGE_SIZE + 1));
const rangeEnd = computed(() => Math.min(page.value * PAGE_SIZE, filtered.value.length));
watch([search, status], () => (page.value = 1));
watch(pageCount, (count) => {
  if (page.value > count) page.value = count;
});

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
    formError.value = 'Enter a name, an email address, and a password of at least 10 characters.';
    return;
  }
  saving.value = true;
  try {
    const created = await createParentRequest({ name: form.name.trim(), email: form.email.trim(), password: form.password, clientIds: form.clientIds });
    replace(created);
    onboarding.value = false;
    toast.push(created.portalStatus === 'active'
      ? { tone: 'success', title: 'Parent onboarded', message: `${created.name} can sign in with this email and password.` }
      : { tone: 'info', title: 'Parent onboarded as pending', message: `${created.name} can sign in once a client is linked.` });
  } catch (onboardError) {
    formError.value = errorMessage(onboardError, 'The parent could not be onboarded.');
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
      title: 'Linked clients updated',
      message: updated.portalStatus === 'active' ? `${updated.name} can sign in.` : `${updated.name} is pending until a client is linked.`,
    });
  } catch (linkError) {
    toast.push({ tone: 'danger', title: 'Links not saved', message: errorMessage(linkError, 'Try again.') });
  } finally {
    saving.value = false;
  }
}

void load();
</script>

<template>
  <PageContainer>
    <OnboardingTabs />
    <PageHeader title="Parents" description="Parent accounts and the children each one can see in the parent portal.">
      <template #actions>
        <AppButton v-if="canCreate" @click="startOnboarding">Onboard parent</AppButton>
      </template>
    </PageHeader>

    <div class="filter-bar">
      <AppInput v-model="search" label="Search" placeholder="Parent, email, child or client code" />
      <AppSelect
        v-model="status"
        label="Portal access"
        :options="[{ value: '', label: 'Any' }, { value: 'active', label: 'Active' }, { value: 'pending', label: 'Pending' }]"
      />
    </div>

    <SkeletonBlock v-if="loading" height="240px" />
    <ErrorState v-else-if="error" title="Parents unavailable" :description="error" @retry="load" />
    <EmptyState
      v-else-if="filtered.length === 0"
      :title="parents.length ? 'No parents match' : 'No parent accounts yet'"
      :description="parents.length ? 'Adjust the search or filter.' : 'Onboard a parent and link their child to give them portal access.'"
    />
    <div v-else class="table-wrap panel">
      <table>
        <caption>Parent accounts</caption>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Linked clients</th>
            <th>Portal access</th>
            <th>Added</th>
            <th class="actions-col">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="parent in paged" :key="parent.userId">
            <td><strong>{{ parent.name }}</strong></td>
            <td>{{ parent.email }}</td>
            <td>
              <span v-if="parent.linkedClients.length === 0" class="muted">None</span>
              <span v-for="client in parent.linkedClients" v-else :key="client.id" class="client-chip">
                <RouterLink :to="`/clients/${client.id}`">{{ client.displayName }}</RouterLink> · {{ client.clientCode }}
              </span>
            </td>
            <td>
              <StatusBadge
                :tone="parent.membershipStatus === 'revoked' ? 'neutral' : parent.portalStatus === 'active' ? 'success' : 'warning'"
                :label="parent.membershipStatus === 'revoked' ? 'Revoked' : parent.portalStatus === 'active' ? 'Active' : 'Pending'"
                :title="parent.portalStatus === 'pending' ? PENDING_HINT : undefined"
              />
            </td>
            <td>{{ formatDateTime(parent.createdAt, timeZone) }}</td>
            <td>
              <div class="row-actions">
                <AppButton size="sm" variant="secondary" :aria-label="`View ${parent.name}`" @click="viewing = parent">View</AppButton>
                <AppButton
                  v-if="parent.membershipStatus === 'active'"
                  size="sm"
                  variant="secondary"
                  :aria-label="`Manage clients for ${parent.name}`"
                  @click="startLinking(parent)"
                >
                  Manage clients
                </AppButton>
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

    <AppDialog :open="onboarding" title="Onboard parent" wide @close="onboarding = false">
      <form class="onboard-form" @submit.prevent="onboard">
        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
        <div class="onboard-grid">
          <AppInput v-model="form.name" label="Name" required />
          <AppInput v-model="form.email" label="Email" type="email" required autocomplete="off" />
          <AppInput v-model="form.password" label="Password" type="password" required autocomplete="new-password" hint="At least 10 characters." />
        </div>
        <ClientMultiPicker
          v-model="form.clientIds"
          label="Link clients (optional)"
          hint="Without a linked client the account stays pending and the parent cannot sign in. You can link clients later."
        />
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="onboarding = false">Cancel</AppButton>
        <AppButton :loading="saving" @click="onboard">{{ form.clientIds.length ? 'Onboard and link' : 'Onboard as pending' }}</AppButton>
      </template>
    </AppDialog>

    <AppDialog :open="viewing !== null" :title="viewing?.name ?? ''" @close="viewing = null">
      <dl v-if="viewing" class="details">
        <div><dt>Email</dt><dd>{{ viewing.email }}</dd></div>
        <div>
          <dt>Portal access</dt>
          <dd>{{ viewing.membershipStatus === 'revoked' ? 'Revoked' : viewing.portalStatus === 'active' ? 'Active' : PENDING_HINT }}</dd>
        </div>
        <div><dt>Added</dt><dd>{{ formatDateTime(viewing.createdAt, timeZone) }}</dd></div>
        <div><dt>Last active</dt><dd>{{ viewing.lastActiveAt ? formatDateTime(viewing.lastActiveAt, timeZone) : 'Never' }}</dd></div>
        <div class="is-wide">
          <dt>Linked clients</dt>
          <dd>
            <ul v-if="viewing.linkedClients.length" class="client-links">
              <li v-for="client in viewing.linkedClients" :key="client.id">
                <RouterLink :to="`/clients/${client.id}`">{{ client.displayName }}</RouterLink> · {{ client.clientCode }}
              </li>
            </ul>
            <span v-else>None</span>
          </dd>
        </div>
      </dl>
      <template #footer>
        <AppButton variant="secondary" @click="viewing = null">Close</AppButton>
        <AppButton v-if="viewing?.membershipStatus === 'active'" @click="viewing && startLinking(viewing)">Manage clients</AppButton>
      </template>
    </AppDialog>

    <AppDialog :open="linking !== null" :title="`Linked clients · ${linking?.name ?? ''}`" wide @close="linking = null">
      <ClientMultiPicker
        v-if="linking"
        v-model="linkIds"
        label="Clients this parent can see"
        hint="Unlinking keeps the guardian contact on the client but removes portal access. With no linked client the parent cannot sign in."
      />
      <template #footer>
        <AppButton variant="secondary" @click="linking = null">Cancel</AppButton>
        <AppButton :loading="saving" @click="saveLinks">Save links</AppButton>
      </template>
    </AppDialog>
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

.muted {
  color: var(--color-text-muted);
}

.client-chip {
  display: inline-block;
  margin: 2px 6px 2px 0;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--color-surface-muted);
  font-size: 0.85rem;
  white-space: nowrap;
}

.onboard-form {
  display: grid;
  gap: 14px;
}

.onboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.form-error {
  margin: 0;
  color: var(--color-danger);
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
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
