<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { OrganizationDirectoryItem } from '@abapro/shared';
import { apiRequest, encodedPath } from '@/api/client';
import { countryLabel, displayStoredAddress } from '@/components/address/postal-address';
import AppIcon from '@/components/navigation/AppIcon.vue';
import ClinicFormFields from '@/components/organization/ClinicFormFields.vue';
import {
  clinicDraftFrom,
  emptyClinicForm,
  emptyOrganizationForm,
  organizationFormFrom,
  organizationUpdateFrom,
  type ClinicFormValue,
  type OrganizationFormValue,
} from '@/components/organization/form-values';
import OrganizationFormFields from '@/components/organization/OrganizationFormFields.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { roleName } from '@/i18n';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { errorMessage, useLoader } from '@/lib/loader';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const toast = useToastStore();
const { t } = useI18n();
const addingOpen = ref(false);
const saving = ref(false);
const adding = ref(false);
const formError = ref('');
const editError = ref('');
const organization = ref<OrganizationDirectoryItem | null>(null);
const editingOrganisation = ref(false);
const organisationDraft = ref<OrganizationFormValue>(emptyOrganizationForm());
const clinicForm = ref<ClinicFormValue>(emptyClinicForm());
const grantUserId = ref<Record<string, string>>({});
const canManage = computed(() => auth.user?.platformAdmin === true || auth.user?.role === 'organization_admin');

function recorded(value: string | null | undefined): string {
  return value?.trim() ? value : t('orgs.notRecorded');
}

function startOrganisationEdit(): void {
  if (!organization.value) return;
  editError.value = '';
  organisationDraft.value = organizationFormFrom(organization.value);
  editingOrganisation.value = true;
}

async function saveOrganisation(): Promise<void> {
  if (!organization.value) return;
  editError.value = '';
  if (organisationDraft.value.name.trim().length < 2 || !organisationDraft.value.contactEmail.trim() || !organisationDraft.value.contactPhone.trim() || !organisationDraft.value.address.country) {
    editError.value = t('orgs.detail.required');
    return;
  }
  saving.value = true;
  try {
    organization.value = await apiRequest<OrganizationDirectoryItem>(encodedPath`/organizations/${organization.value.id}`, {
      method: 'PATCH',
      body: organizationUpdateFrom(organisationDraft.value, organization.value.address),
    });
    const activeOrganisation = auth.user?.organization;
    if (activeOrganisation && activeOrganisation.id === organization.value.id) {
      activeOrganisation.name = organization.value.name;
      const listed = auth.user?.organizations.find((item) => item.id === activeOrganisation.id);
      if (listed) listed.name = organization.value.name;
    }
    editingOrganisation.value = false;
    toast.push({ tone: 'success', title: t('orgs.detail.updated') });
  } catch (saveError) {
    editError.value = errorMessage(saveError, t('orgs.detail.updateError'));
  } finally {
    saving.value = false;
  }
}

const { loading, error, load } = useLoader(async () => {
  organization.value = await apiRequest<OrganizationDirectoryItem>(encodedPath`/organizations/${String(route.params.organizationId)}`);
}, t('orgs.detail.error'));

function candidates(clinicId: string) {
  return (organization.value?.members ?? []).filter((member) => member.role !== 'organization_admin' && !member.clinicIds.includes(clinicId));
}

async function grantAccess(clinicId: string): Promise<void> {
  if (!organization.value) return;
  const userId = grantUserId.value[clinicId];
  if (!userId) return;
  organization.value = await apiRequest<OrganizationDirectoryItem>(encodedPath`/organizations/${organization.value.id}/clinics/${clinicId}/access`, {
    method: 'POST',
    body: { userId },
  });
  grantUserId.value = { ...grantUserId.value, [clinicId]: '' };
  toast.push({ tone: 'success', title: t('orgs.detail.granted') });
}

const totals = computed(() => {
  const value = organization.value;
  if (!value) return { clients: 0, people: 0 };
  return { clients: value.clinics.reduce((sum, clinic) => sum + clinic.clientCount, 0), people: value.members.length };
});

function candidateOptions(clinicId: string) {
  return [
    { value: '', label: t('orgs.detail.choosePerson') },
    ...candidates(clinicId).map((member) => ({ value: member.userId, label: `${member.name} · ${roleName(member.role, member.roleLabel)}` })),
  ];
}

function openAddClinic(): void {
  formError.value = '';
  clinicForm.value = emptyClinicForm();
  addingOpen.value = true;
}

async function addClinic(): Promise<void> {
  if (!organization.value) return;
  formError.value = '';
  adding.value = true;
  try {
    if (clinicForm.value.name.trim().length < 2) {
      formError.value = t('orgs.detail.clinicName');
      return;
    }
    organization.value = await apiRequest<OrganizationDirectoryItem>(encodedPath`/organizations/${organization.value.id}/clinics`, {
      method: 'POST',
      body: clinicDraftFrom(clinicForm.value),
    });
    clinicForm.value = emptyClinicForm();
    addingOpen.value = false;
    toast.push({ tone: 'success', title: t('orgs.detail.added') });
  } catch (addError) {
    formError.value = errorMessage(addError, t('orgs.detail.addError'));
  } finally {
    adding.value = false;
  }
}

async function enterWorkspace(): Promise<void> {
  if (!organization.value) return;
  try {
    await auth.switchOrganization(organization.value.id);
    toast.push({ tone: 'success', title: t('orgs.detail.entered', { name: organization.value.name }) });
    await router.push('/programs/tasks');
  } catch (err) {
    toast.push({ tone: 'danger', title: t('orgs.detail.enterFailed'), message: errorMessage(err, t('errors.generic')) });
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <PageContainer>
    <SkeletonBlock v-if="loading" height="220px" />
    <ErrorState v-else-if="error || !organization" :title="t('orgs.detail.unavailable')" :description="error || t('orgs.detail.error')" @retry="load" />
    <div v-else class="org-detail">
      <PageHeader :title="organization.name" :back-to="auth.user?.platformAdmin ? '/organizations' : undefined" :back-label="t('orgs.title')">
        <template #actions>
          <AppButton v-if="canManage && !editingOrganisation" type="button" variant="secondary" icon="edit" @click="startOrganisationEdit">{{ t('orgs.detail.edit') }}</AppButton>
          <AppButton type="button" icon-end="arrow-right" @click="enterWorkspace">{{ t('orgs.detail.enter') }}</AppButton>
        </template>
      </PageHeader>

      <!-- Key facts -->
      <section class="summary" :aria-label="t('orgs.detail.details')">
        <span class="org-mark" aria-hidden="true">{{ organization.name.trim().charAt(0).toLocaleUpperCase() }}</span>
        <dl class="summary-facts">
          <div>
            <dt>{{ t('orgs.detail.facts.clinics') }}</dt>
            <dd>{{ organization.clinics.length }}</dd>
          </div>
          <div>
            <dt>{{ t('orgs.detail.facts.clients') }}</dt>
            <dd>{{ totals.clients }}</dd>
          </div>
          <div>
            <dt>{{ t('orgs.detail.facts.people') }}</dt>
            <dd>{{ totals.people }}</dd>
          </div>
          <div>
            <dt>{{ t('orgs.detail.facts.country') }}</dt>
            <dd>{{ countryLabel(organization.country) }}</dd>
          </div>
        </dl>
      </section>

      <section class="settings-card">
        <header class="card-header">
          <h2>{{ t('orgs.detail.details') }}</h2>
        </header>
        <form v-if="editingOrganisation" class="form-stack" novalidate @submit.prevent="saveOrganisation">
          <p v-if="editError" class="form-alert" role="alert"><AppIcon name="alert" :size="16" />{{ editError }}</p>
          <OrganizationFormFields v-model="organisationDraft" />
          <div class="form-actions">
            <AppButton type="button" variant="secondary" @click="editingOrganisation = false">{{ t('common.cancel') }}</AppButton>
            <AppButton type="submit" :loading="saving">{{ t('orgs.detail.save') }}</AppButton>
          </div>
        </form>
        <dl v-else class="detail-list">
          <div>
            <dt>{{ t('orgs.fields.contactEmail') }}</dt>
            <dd><span dir="ltr">{{ organization.contactEmail }}</span></dd>
          </div>
          <div>
            <dt>{{ t('orgs.fields.contactPhone') }}</dt>
            <dd><span dir="ltr">{{ recorded(organization.contactPhone) }}</span></dd>
          </div>
          <div class="is-wide">
            <dt>{{ t('orgs.detail.address') }}</dt>
            <dd>{{ recorded(displayStoredAddress(organization.address, organization.country)) }}</dd>
          </div>
          <div>
            <dt>{{ t('orgs.fields.companyId') }}</dt>
            <dd>{{ recorded(organization.companyIdentificationNumber) }}</dd>
          </div>
          <div>
            <dt>{{ t('orgs.fields.taxNumber') }}</dt>
            <dd>{{ recorded(organization.taxNumber) }}</dd>
          </div>
        </dl>
      </section>

      <section class="clinics-section">
        <header class="card-header">
          <div class="section-heading">
            <h2>{{ t('orgs.detail.clinics') }} <span class="count">{{ organization.clinics.length }}</span></h2>
            <p class="section-desc">{{ t('orgs.detail.clinicsHint') }}</p>
          </div>
          <AppButton v-if="canManage && !addingOpen" type="button" icon="plus" @click="openAddClinic">{{ t('orgs.detail.addClinic') }}</AppButton>
        </header>

        <form v-if="canManage && addingOpen" class="settings-card add-clinic" novalidate @submit.prevent="addClinic">
          <div class="section-heading">
            <h3>{{ t('orgs.detail.addClinic') }}</h3>
            <p class="section-desc">{{ t('orgs.detail.addClinicHint') }}</p>
          </div>
          <p v-if="formError" class="form-alert" role="alert"><AppIcon name="alert" :size="16" />{{ formError }}</p>
          <ClinicFormFields v-model="clinicForm" />
          <div class="form-actions">
            <AppButton type="button" variant="secondary" @click="addingOpen = false">{{ t('common.cancel') }}</AppButton>
            <AppButton type="submit" :loading="adding">{{ t('orgs.detail.addButton') }}</AppButton>
          </div>
        </form>

        <EmptyState v-if="organization.clinics.length === 0" icon="clinics" :title="t('clinics.empty')" :description="t('orgs.detail.addClinicHint')" />

        <article v-for="clinic in organization.clinics" :key="clinic.id" class="settings-card clinic-card">
          <header class="clinic-head">
            <span class="clinic-mark" aria-hidden="true"><AppIcon name="clinics" :size="18" /></span>
            <div class="clinic-title">
              <h3><RouterLink :to="`/clinics/${clinic.id}`" dir="auto">{{ clinic.name }}</RouterLink></h3>
              <p class="clinic-meta">
                <span v-if="displayStoredAddress(clinic.address, organization.country) || clinic.location">{{ displayStoredAddress(clinic.address, organization.country) || clinic.location }}</span>
                <span v-if="clinic.contactEmail" dir="ltr">{{ clinic.contactEmail }}</span>
                <span v-if="clinic.contactPhone" dir="ltr">{{ clinic.contactPhone }}</span>
              </p>
            </div>
            <AppButton type="button" variant="secondary" size="sm" icon-end="arrow-right" @click="router.push(`/clinics/${clinic.id}`)">{{ t('orgs.detail.openClinic') }}</AppButton>
          </header>
          <div class="clinic-columns">
            <div class="clinic-column">
              <h4>{{ t('orgs.detail.clients') }} <span class="count">{{ clinic.clients.length }}</span></h4>
              <p v-if="clinic.clients.length === 0" class="muted">{{ t('orgs.detail.noClients') }}</p>
              <ul v-else class="mini-list">
                <li v-for="client in clinic.clients" :key="client.id">
                  <RouterLink :to="`/clients/${client.id}`" dir="auto">{{ client.displayName }}</RouterLink>
                  <span class="muted">{{ client.clientCode }}</span>
                  <StatusBadge :tone="client.status === 'active' ? 'success' : 'neutral'" :label="client.status === 'active' ? t('clinics.detail.active') : t('clinics.detail.inactive')" />
                </li>
              </ul>
            </div>
            <div class="clinic-column">
              <h4>{{ t('orgs.detail.people') }} <span class="count">{{ clinic.users.length }}</span></h4>
              <p v-if="clinic.users.length === 0" class="muted">{{ t('orgs.detail.noPeople') }}</p>
              <ul v-else class="mini-list">
                <li v-for="person in clinic.users" :key="person.userId">
                  <strong dir="auto">{{ person.name }}</strong>
                  <span class="muted">{{ roleName(person.role, person.roleLabel) }}</span>
                </li>
              </ul>
              <form v-if="canManage && candidates(clinic.id).length" class="grant" @submit.prevent="grantAccess(clinic.id)">
                <AppSelect v-model="grantUserId[clinic.id]" :label="t('orgs.detail.grant')" :options="candidateOptions(clinic.id)" />
                <AppButton type="submit" variant="secondary" :disabled="!grantUserId[clinic.id]">{{ t('orgs.detail.grantButton') }}</AppButton>
              </form>
            </div>
          </div>
        </article>
      </section>
    </div>
  </PageContainer>
</template>

<style scoped>
.org-detail,
.clinics-section {
  display: grid;
  gap: var(--space-5);
}

.summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4) var(--space-8);
  padding: var(--space-5) var(--space-6);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
}

.org-mark {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: #ffffff;
  font-size: var(--text-lg);
  font-weight: 700;
}

.summary-facts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3) var(--space-8);
}

.summary-facts dt {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-weight: 500;
}

.summary-facts dd {
  margin: 2px 0 0;
  color: var(--color-ink);
  font-size: var(--text-lg);
  font-weight: 650;
}

.detail-list .is-wide {
  grid-column: 1 / -1;
}

.count {
  margin-inline-start: 6px;
  padding: 1px 8px;
  border-radius: var(--radius-full);
  background: var(--color-surface-sunken);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-weight: 600;
  vertical-align: middle;
}

.add-clinic {
  border-color: var(--color-primary);
}

.clinic-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--space-3);
}

.clinic-mark {
  display: grid;
  place-items: center;
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  background: var(--color-primary-soft);
  color: var(--color-primary-ink);
}

.clinic-title {
  flex: 1;
  min-width: 0;
}

.clinic-title h3 {
  font-size: var(--text-md);
}

.clinic-title a {
  color: var(--color-ink);
  text-decoration: none;
}

.clinic-title a:hover,
.clinic-title a:focus-visible {
  color: var(--color-primary-ink);
  text-decoration: underline;
}

.clinic-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 2px var(--space-3);
  margin-top: 2px;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.clinic-columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--space-4);
}

.clinic-column {
  display: grid;
  align-content: start;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
}

.clinic-column h4 {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: 600;
}

.mini-list {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.mini-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px var(--space-2);
}

.mini-list a,
.mini-list strong {
  color: var(--color-ink);
  font-weight: 600;
}

.mini-list a {
  text-decoration: none;
}

.mini-list a:hover {
  text-decoration: underline;
}

.muted {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.grant {
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-border);
}

.grant > :first-child {
  flex: 1;
  min-width: 0;
}

@media (max-width: 480px) {
  .grant {
    flex-direction: column;
    align-items: stretch;
  }

  .summary {
    padding: var(--space-4);
  }
}
</style>
