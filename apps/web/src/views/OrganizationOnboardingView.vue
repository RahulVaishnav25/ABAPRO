<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { CreateOrganizationRequest } from '@abapro/shared';
import { createOrganizationRequest, createSignInAccountRequest } from '@/api/resources';
import { countryLabel, postalAddressLines, storedPostalAddress } from '@/components/address/postal-address';
import ClinicFormFields from '@/components/organization/ClinicFormFields.vue';
import { clinicDraftFrom, emptyClinicForm, emptyOrganizationForm, type ClinicFormValue } from '@/components/organization/form-values';
import OrganizationFormFields from '@/components/organization/OrganizationFormFields.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';

interface AccountForm {
  name: string;
  email: string;
  password: string;
}

const auth = useAuthStore();
const toast = useToastStore();
const router = useRouter();
const step = ref<1 | 2 | 3 | 4>(1);
const saving = ref(false);
const formError = ref('');
const profile = reactive(emptyOrganizationForm('US', auth.user?.email ?? ''));
const organization = reactive<CreateOrganizationRequest>({
  name: '',
  contactEmail: auth.user?.email ?? '',
  contactPhone: '',
  country: 'US',
  companyIdentificationNumber: '',
  taxNumber: '',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  locale: 'en-US',
  primaryColor: '#0e6b62',
  invites: [],
});
const clinics = ref<ClinicFormValue[]>([emptyClinic()]);
const accounts = ref<AccountForm[]>([]);
const accountName = ref('');
const accountEmail = ref('');
const accountPassword = ref('');
const organisationCreated = ref(false);
const createdAccountEmails = ref<string[]>([]);

function emptyClinic(): ClinicFormValue {
  return emptyClinicForm(profile.address.country || 'US');
}

function addClinic(): void {
  clinics.value.push(emptyClinic());
}

function removeClinic(index: number): void {
  if (clinics.value.length === 1) return;
  clinics.value.splice(index, 1);
}

function continueFromOrganisation(): void {
  formError.value = '';
  organization.country = profile.address.country;
  if (profile.name.trim().length < 2 || !profile.contactEmail.trim() || !profile.contactPhone.trim() || !profile.address.country) {
    formError.value = 'Enter the organisation name, contact email, contact phone, and country.';
    return;
  }
  step.value = 2;
}

function continueFromClinics(): void {
  formError.value = '';
  const ready = clinics.value.every((clinic) => clinic.name.trim().length >= 2);
  if (!ready) {
    formError.value = 'Each clinic needs a name.';
    return;
  }
  const names = new Set(clinics.value.map((clinic) => clinic.name.trim().toLowerCase()));
  if (names.size !== clinics.value.length) {
    formError.value = 'Each clinic needs a different name.';
    return;
  }
  step.value = 3;
}

function accountDraftStarted(): boolean {
  return Boolean(accountName.value.trim() || accountEmail.value.trim() || accountPassword.value);
}

function addAccount(requireDraft = true): boolean {
  formError.value = '';
  if (!accountDraftStarted()) {
    if (requireDraft) formError.value = 'Enter a name, email, and password before adding an account.';
    return !requireDraft;
  }
  const name = accountName.value.trim();
  const email = accountEmail.value.trim().toLowerCase();
  const password = accountPassword.value;
  if (name.length < 2 || !email.includes('@') || password.length < 10) {
    formError.value = 'Each sign-in account needs a name, an email, and a password of at least 10 characters.';
    return false;
  }
  if (accounts.value.some((account) => account.email === email)) {
    formError.value = 'Each sign-in account needs a different email.';
    return false;
  }
  accounts.value.push({ name, email, password });
  accountName.value = '';
  accountEmail.value = '';
  accountPassword.value = '';
  return true;
}

function removeAccount(email: string): void {
  accounts.value = accounts.value.filter((account) => account.email !== email);
}

function continueFromAccounts(): void {
  if (!addAccount(false)) return;
  step.value = 4;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function addressPreview(address: ClinicFormValue['address']): string {
  const lines = postalAddressLines(address);
  if (address.country.trim()) lines.push(countryLabel(address.country));
  return lines.join('\n');
}

async function confirm(): Promise<void> {
  formError.value = '';
  saving.value = true;
  try {
    if (!organisationCreated.value) {
      auth.user = await createOrganizationRequest({
        ...organization,
        name: profile.name.trim(),
        contactEmail: profile.contactEmail.trim(),
        contactPhone: profile.contactPhone.trim(),
        country: profile.address.country,
        address: storedPostalAddress(profile.address) || undefined,
        companyIdentificationNumber: profile.companyIdentificationNumber.trim() || undefined,
        taxNumber: profile.taxNumber.trim() || undefined,
        clinics: clinics.value.map((clinic) => clinicDraftFrom(clinic)),
      });
      organisationCreated.value = true;
    }
    for (const account of accounts.value) {
      if (createdAccountEmails.value.includes(account.email)) continue;
      await createSignInAccountRequest(account);
      createdAccountEmails.value.push(account.email);
    }
    toast.push({ tone: 'success', title: 'Organisation created', message: profile.name.trim() });
    await router.push('/organizations');
  } catch (error) {
    formError.value = organisationCreated.value
      ? error instanceof Error
        ? `The organisation was created, but a sign-in account could not be created. ${error.message}`
        : 'The organisation was created, but a sign-in account could not be created.'
      : error instanceof Error
        ? error.message
        : 'The organisation could not be created.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <PageContainer>
    <PageHeader title="Create organisation" description="Add the organisation and every clinic in one flow." />
    <ol class="steps">
      <li :class="{ current: step === 1 }">1. Organisation</li>
      <li :class="{ current: step === 2 }">2. Clinics</li>
      <li :class="{ current: step === 3 }">3. Sign-in accounts</li>
      <li :class="{ current: step === 4 }">4. Review</li>
    </ol>
    <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>

    <form v-if="step === 1" class="panel" @submit.prevent="continueFromOrganisation">
      <OrganizationFormFields v-model="profile" />
      <AppButton type="submit">Continue</AppButton>
    </form>

    <form v-else-if="step === 2" class="panel" @submit.prevent="continueFromClinics">
      <section v-for="(clinic, index) in clinics" :key="index" class="clinic">
        <header class="clinic-head">
          <h2>Clinic {{ index + 1 }}</h2>
          <AppButton v-if="clinics.length > 1" type="button" variant="ghost" @click="removeClinic(index)">Remove</AppButton>
        </header>
        <ClinicFormFields v-model="clinics[index]" />
      </section>
      <AppButton type="button" variant="secondary" block @click="addClinic">Add clinic</AppButton>
      <div class="actions">
        <AppButton type="button" variant="secondary" @click="step = 1">Back</AppButton>
        <AppButton type="submit">Continue</AppButton>
      </div>
    </form>

    <form v-else-if="step === 3" class="panel" @submit.prevent="continueFromAccounts">
      <h2>Sign-in accounts</h2>
      <p>Create the email and password a person will use on the sign-in page. You can skip this step.</p>
      <ul v-if="accounts.length" class="person-list">
        <li v-for="account in accounts" :key="account.email" class="person">
          <span class="avatar" aria-hidden="true">{{ initials(account.name) }}</span>
          <div>
            <strong>{{ account.name }}</strong>
            <span>{{ account.email }}</span>
          </div>
          <AppButton type="button" variant="ghost" @click="removeAccount(account.email)">Remove</AppButton>
        </li>
      </ul>
      <p v-else class="quiet">No accounts added yet.</p>
      <div class="account-form">
        <AppInput v-model="accountName" label="Name" />
        <AppInput v-model="accountEmail" label="Email" type="email" />
        <AppInput v-model="accountPassword" label="Password" type="password" hint="At least 10 characters." />
      </div>
      <AppButton type="button" variant="secondary" @click="addAccount()">Add account</AppButton>
      <div class="actions">
        <AppButton type="button" variant="secondary" @click="step = 2">Back</AppButton>
        <AppButton type="submit">Review</AppButton>
      </div>
    </form>

    <section v-else class="panel review">
      <article class="summary">
        <h2>Organisation</h2>
        <dl class="facts">
          <div>
            <dt>Name</dt>
            <dd>{{ profile.name }}</dd>
          </div>
          <div>
            <dt>Contact email</dt>
            <dd>{{ profile.contactEmail }}</dd>
          </div>
          <div>
            <dt>Contact phone</dt>
            <dd>{{ profile.contactPhone }}</dd>
          </div>
          <div>
            <dt>Country</dt>
            <dd>{{ countryLabel(profile.address.country) }}</dd>
          </div>
          <div v-if="profile.companyIdentificationNumber">
            <dt>Company identification number</dt>
            <dd>{{ profile.companyIdentificationNumber }}</dd>
          </div>
          <div v-if="profile.taxNumber">
            <dt>Tax number</dt>
            <dd>{{ profile.taxNumber }}</dd>
          </div>
        </dl>
        <p v-if="postalAddressLines(profile.address).length" class="postal">{{ addressPreview(profile.address) }}</p>
      </article>

      <article class="summary">
        <h2>Clinics</h2>
        <ul class="person-list">
          <li v-for="clinic in clinics" :key="clinic.name" class="clinic-card">
            <div>
              <strong>{{ clinic.name }}</strong>
            </div>
            <p v-if="clinic.contactEmail || clinic.contactPhone">{{ [clinic.contactEmail, clinic.contactPhone].filter(Boolean).join(' · ') }}</p>
            <p v-if="postalAddressLines(clinic.address).length" class="postal">{{ addressPreview(clinic.address) }}</p>
          </li>
        </ul>
      </article>

      <article class="summary">
        <h2>Sign-in accounts</h2>
        <ul v-if="accounts.length" class="person-list">
          <li v-for="account in accounts" :key="account.email" class="person">
            <span class="avatar" aria-hidden="true">{{ initials(account.name) }}</span>
            <div>
              <strong>{{ account.name }}</strong>
              <span>{{ account.email }}</span>
            </div>
          </li>
        </ul>
        <p v-else class="quiet">No sign-in accounts. People can be added later.</p>
      </article>

      <div class="actions">
        <AppButton type="button" variant="secondary" @click="step = 3">Back</AppButton>
        <AppButton type="button" :loading="saving" @click="confirm">Create organisation</AppButton>
      </div>
    </section>
  </PageContainer>
</template>

<style scoped>
.steps {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 16px;
  padding: 0;
  list-style: none;
}

.steps li {
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text-muted);
}

.current {
  border-color: transparent;
  background: var(--color-primary-soft);
  color: var(--color-primary-ink);
  font-weight: 700;
}

.panel {
  display: grid;
  gap: 16px;
  padding: 16px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.grid,
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.grid > * {
  flex: 1 1 220px;
}

.actions {
  justify-content: space-between;
}

.clinic {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.clinic-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.account-form {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.person-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.person,
.clinic-card {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
}

.clinic-card {
  grid-template-columns: 1fr;
  align-items: start;
}

.avatar {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border-radius: 50%;
  background: var(--color-primary-soft);
  color: var(--color-primary-ink);
  font-weight: 700;
}

.person strong,
.clinic-card strong {
  display: block;
  color: var(--color-ink);
}

.person span,
.clinic-card span,
.quiet {
  color: var(--color-text-muted);
}

.review {
  gap: 16px;
}

.summary {
  display: grid;
  gap: 12px;
}

.facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 20px;
  margin: 0;
}

.facts div {
  display: grid;
  gap: 2px;
}

dt {
  color: var(--color-text-subtle);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

dd {
  margin: 0;
  color: var(--color-ink);
}

.postal {
  margin: 0;
  color: var(--color-text);
  white-space: pre-line;
}

h2 {
  margin: 0;
  font-size: 1.05rem;
}

.form-error {
  color: var(--color-danger);
}

@media (max-width: 800px) {
  .account-form,
  .facts {
    grid-template-columns: 1fr;
  }
}
</style>
