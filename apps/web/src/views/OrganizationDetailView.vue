<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import type { OrganizationDirectoryItem } from '@abapro/shared';
import { apiRequest, encodedPath } from '@/api/client';
import { displayStoredAddress } from '@/components/address/postal-address';
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
import ErrorState from '@/components/ui/ErrorState.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { errorMessage, useLoader } from '@/lib/loader';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const toast = useToastStore();
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
  return value?.trim() ? value : 'Not recorded';
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
    editError.value = 'Enter the organisation name, contact email, contact phone, and country.';
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
    toast.push({ tone: 'success', title: 'Organisation updated' });
  } catch (saveError) {
    editError.value = errorMessage(saveError, 'The organisation could not be updated.');
  } finally {
    saving.value = false;
  }
}

const { loading, error, load } = useLoader(async () => {
  organization.value = await apiRequest<OrganizationDirectoryItem>(encodedPath`/organizations/${String(route.params.organizationId)}`);
}, 'This organisation could not be loaded.');

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
  toast.push({ tone: 'success', title: 'Clinic access granted' });
}

function openClinic(clinicId: string): void {
  void router.push(`/clinics/${clinicId}`);
}

async function addClinic(): Promise<void> {
  if (!organization.value) return;
  formError.value = '';
  adding.value = true;
  try {
    if (clinicForm.value.name.trim().length < 2) {
      formError.value = 'Each clinic needs a name.';
      return;
    }
    organization.value = await apiRequest<OrganizationDirectoryItem>(encodedPath`/organizations/${organization.value.id}/clinics`, {
      method: 'POST',
      body: clinicDraftFrom(clinicForm.value),
    });
    clinicForm.value = emptyClinicForm();
    toast.push({ tone: 'success', title: 'Clinic added' });
  } catch (addError) {
    formError.value = errorMessage(addError, 'The clinic could not be added.');
  } finally {
    adding.value = false;
  }
}

async function enterWorkspace(): Promise<void> {
  if (!organization.value) return;
  try {
    await auth.switchOrganization(organization.value.id);
    toast.push({ tone: 'success', title: `Entered ${organization.value.name}` });
    await router.push('/programs/tasks');
  } catch (err) {
    toast.push({ tone: 'danger', title: 'Could not enter workspace', message: errorMessage(err, 'Try again.') });
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <PageContainer>
    <SkeletonBlock v-if="loading" height="220px" />
    <ErrorState v-else-if="error || !organization" title="Organisation unavailable" :description="error || 'This organisation could not be loaded.'" @retry="load" />
    <template v-else>
      <PageHeader :title="organization.name">
        <template #actions>
          <AppButton type="button" @click="enterWorkspace">Enter Workspace</AppButton>
          <AppButton v-if="canManage && !editingOrganisation" type="button" variant="secondary" @click="startOrganisationEdit">Edit organisation</AppButton>
        </template>
      </PageHeader>
      <section class="panel">
        <h2>Organisation details</h2>
        <p v-if="editError" class="form-error" role="alert">{{ editError }}</p>
        <form v-if="editingOrganisation" class="edit-form" @submit.prevent="saveOrganisation">
          <OrganizationFormFields v-model="organisationDraft" />
          <div class="edit-actions">
            <AppButton type="button" variant="secondary" @click="editingOrganisation = false">Cancel</AppButton>
            <AppButton type="submit" :loading="saving">Save organisation</AppButton>
          </div>
        </form>
        <dl v-else class="details">
          <div>
            <dt>Contact email</dt>
            <dd>{{ organization.contactEmail }}</dd>
          </div>
          <div>
            <dt>Contact phone</dt>
            <dd>{{ recorded(organization.contactPhone) }}</dd>
          </div>
          <div>
            <dt>Address</dt>
            <dd>{{ recorded(displayStoredAddress(organization.address, organization.country)) }}</dd>
          </div>
          <div>
            <dt>Company identification number</dt>
            <dd>{{ recorded(organization.companyIdentificationNumber) }}</dd>
          </div>
          <div>
            <dt>Tax number</dt>
            <dd>{{ recorded(organization.taxNumber) }}</dd>
          </div>
        </dl>
      </section>
      <section v-for="clinic in organization.clinics" :key="clinic.id" class="panel">
        <div class="clinic-heading">
          <div>
            <h2><RouterLink :to="`/clinics/${clinic.id}`">{{ clinic.name }}</RouterLink></h2>
            <p>{{ displayStoredAddress(clinic.address, organization.country) || clinic.location }}</p>
            <p v-if="clinic.contactEmail || clinic.contactPhone">{{ clinic.contactEmail }} {{ clinic.contactPhone }}</p>
          </div>
          <div class="edit-actions">
            <AppButton type="button" @click="openClinic(clinic.id)">Open clinic</AppButton>
          </div>
        </div>
        <div class="columns">
          <div>
            <h3>Clients</h3>
            <p v-if="clinic.clients.length === 0">No clients at this clinic yet.</p>
            <ul v-else>
              <li v-for="client in clinic.clients" :key="client.id">{{ client.displayName }} · {{ client.clientCode }} · {{ client.status }}</li>
            </ul>
          </div>
          <div>
            <h3>People</h3>
            <p v-if="clinic.users.length === 0">No people are assigned to this clinic yet.</p>
            <ul v-else>
              <li v-for="person in clinic.users" :key="person.userId">{{ person.name }} · {{ person.roleLabel }} · {{ person.email }}</li>
            </ul>
            <form v-if="canManage && candidates(clinic.id).length" class="grant" @submit.prevent="grantAccess(clinic.id)">
              <label>
                Grant clinic access
                <select v-model="grantUserId[clinic.id]" class="control" required>
                  <option disabled value="">Choose a person</option>
                  <option v-for="member in candidates(clinic.id)" :key="member.userId" :value="member.userId">{{ member.name }} · {{ member.roleLabel }}</option>
                </select>
              </label>
              <AppButton type="submit" variant="secondary">Grant access</AppButton>
            </form>
          </div>
        </div>
      </section>
      <form v-if="canManage" class="panel" @submit.prevent="addClinic">
        <h2>Add a clinic</h2>
        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
        <ClinicFormFields v-model="clinicForm" />
        <AppButton type="submit" :loading="adding">Add clinic</AppButton>
      </form>
    </template>
  </PageContainer>
</template>

<style scoped>
.panel { display: grid; gap: 12px; margin-bottom: 16px; padding: 16px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); }
.clinic-heading, .columns { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
.columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
h2, h3 { margin: 0; }
h2 a { color: inherit; text-decoration: none; }
h2 a:hover { text-decoration: underline; }
h3 { font-size: 0.95rem; }
p, li { color: var(--color-text-muted); }
ul { margin: 8px 0 0; padding-left: 18px; }
.form-error { color: var(--color-danger); }
.details { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px 20px; margin: 0; }
dt { color: var(--color-text-muted); font-size: 0.82rem; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; }
dd { margin: 4px 0 0; }
.edit-form { display: grid; gap: 12px; }
.edit-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
</style>
