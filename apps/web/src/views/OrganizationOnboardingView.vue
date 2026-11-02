<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import type { CreateOrganizationRequest } from '@abapro/shared';
import { createOrganizationRequest, createSignInAccountRequest } from '@/api/resources';
import { countryLabel, postalAddressLines, storedPostalAddress } from '@/components/address/postal-address';
import ClinicFormFields from '@/components/organization/ClinicFormFields.vue';
import { clinicDraftFrom, emptyClinicForm, emptyOrganizationForm, type ClinicFormValue } from '@/components/organization/form-values';
import OrganizationFormFields from '@/components/organization/OrganizationFormFields.vue';
import AppIcon from '@/components/navigation/AppIcon.vue';
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
const { t } = useI18n();
const STEP_KEYS = ['organisation', 'clinics', 'accounts', 'review'] as const;
const stepLabels = computed(() => STEP_KEYS.map((key) => t(`orgs.onboarding.steps.${key}`)));
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
    formError.value = t('orgs.onboarding.errors.organisation');
    return;
  }
  step.value = 2;
}

function continueFromClinics(): void {
  formError.value = '';
  const ready = clinics.value.every((clinic) => clinic.name.trim().length >= 2);
  if (!ready) {
    formError.value = t('orgs.onboarding.errors.clinicName');
    return;
  }
  const names = new Set(clinics.value.map((clinic) => clinic.name.trim().toLowerCase()));
  if (names.size !== clinics.value.length) {
    formError.value = t('orgs.onboarding.errors.clinicUnique');
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
    if (requireDraft) formError.value = t('orgs.onboarding.errors.accountDraft');
    return !requireDraft;
  }
  const name = accountName.value.trim();
  const email = accountEmail.value.trim().toLowerCase();
  const password = accountPassword.value;
  if (name.length < 2 || !email.includes('@') || password.length < 10) {
    formError.value = t('orgs.onboarding.errors.account');
    return false;
  }
  if (accounts.value.some((account) => account.email === email)) {
    formError.value = t('orgs.onboarding.errors.accountUnique');
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
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = (word?: string) => Array.from(word ?? '')[0] ?? '';
  return (words.length > 1 ? first(words[0]) + first(words[words.length - 1]) : first(words[0])).toLocaleUpperCase();
}

/** Earlier steps can be revisited from the progress bar; later ones need Continue, which checks each step. */
function goToStep(index: number): void {
  if (index + 1 >= step.value) return;
  formError.value = '';
  step.value = (index + 1) as 1 | 2 | 3 | 4;
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
    toast.push({ tone: 'success', title: t('orgs.onboarding.created'), message: profile.name.trim() });
    await router.push('/organizations');
  } catch (error) {
    formError.value = organisationCreated.value
      ? error instanceof Error
        ? `${t('orgs.onboarding.errors.created')} ${error.message}`
        : t('orgs.onboarding.errors.created')
      : error instanceof Error
        ? error.message
        : t('orgs.onboarding.errors.failed');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <PageContainer>
    <PageHeader :title="t('orgs.onboarding.title')" :description="t('orgs.onboarding.description')" back-to="/organizations" :back-label="t('orgs.title')" />
    <div class="wizard">
      <nav class="stepper" :aria-label="t('orgs.onboarding.stepsLabel')">
        <ol>
          <li v-for="(label, index) in stepLabels" :key="label" :class="{ 'is-current': index + 1 === step, 'is-done': index + 1 < step }" :aria-current="index + 1 === step ? 'step' : undefined">
            <button type="button" class="step" :disabled="index + 1 >= step" @click="goToStep(index)">
              <span class="step-number" aria-hidden="true">
                <AppIcon v-if="index + 1 < step" name="check" :size="14" />
                <template v-else>{{ index + 1 }}</template>
              </span>
              <span>{{ label }}</span>
            </button>
          </li>
        </ol>
      </nav>

      <div class="settings-card">
        <p class="step-count">{{ t('orgs.onboarding.stepOf', { n: step, total: 4 }) }}</p>
        <p v-if="formError" class="form-alert" role="alert"><AppIcon name="alert" :size="16" />{{ formError }}</p>

        <form v-if="step === 1" class="form-stack" novalidate @submit.prevent="continueFromOrganisation">
          <h2>{{ t('orgs.onboarding.steps.organisation') }}</h2>
          <OrganizationFormFields v-model="profile" />
          <div class="wizard-nav">
            <AppButton type="submit" icon-end="arrow-right">{{ t('orgs.onboarding.continue') }}</AppButton>
          </div>
        </form>

        <form v-else-if="step === 2" class="form-stack" novalidate @submit.prevent="continueFromClinics">
          <h2>{{ t('orgs.onboarding.steps.clinics') }}</h2>
          <section v-for="(_, index) in clinics" :key="index" class="record-card">
            <header class="card-header">
              <h3>{{ t('orgs.onboarding.clinicN', { n: index + 1 }) }}</h3>
              <AppButton v-if="clinics.length > 1" type="button" variant="ghost" size="sm" icon="close" @click="removeClinic(index)">{{ t('orgs.onboarding.remove') }}</AppButton>
            </header>
            <ClinicFormFields v-model="clinics[index]" />
          </section>
          <AppButton type="button" variant="secondary" icon="plus" @click="addClinic">{{ t('orgs.onboarding.addClinic') }}</AppButton>
          <div class="wizard-nav">
            <AppButton type="button" variant="secondary" icon="arrow-left" @click="step = 1">{{ t('orgs.onboarding.back') }}</AppButton>
            <AppButton type="submit" icon-end="arrow-right">{{ t('orgs.onboarding.continue') }}</AppButton>
          </div>
        </form>

        <form v-else-if="step === 3" class="form-stack" novalidate @submit.prevent="continueFromAccounts">
          <div class="section-heading">
            <h2>{{ t('orgs.onboarding.accountsTitle') }}</h2>
            <p class="section-desc">{{ t('orgs.onboarding.accountsHint') }}</p>
          </div>
          <ul v-if="accounts.length" class="person-list">
            <li v-for="account in accounts" :key="account.email" class="person">
              <span class="avatar" aria-hidden="true">{{ initials(account.name) }}</span>
              <div class="person-text">
                <strong dir="auto">{{ account.name }}</strong>
                <span>{{ account.email }}</span>
              </div>
              <AppButton type="button" variant="ghost" size="sm" icon="close" @click="removeAccount(account.email)">{{ t('orgs.onboarding.remove') }}</AppButton>
            </li>
          </ul>
          <p v-else class="muted">{{ t('orgs.onboarding.noAccounts') }}</p>
          <div class="record-card">
            <div class="form-grid">
              <AppInput v-model="accountName" :label="t('orgs.onboarding.name')" />
              <AppInput v-model="accountEmail" :label="t('orgs.onboarding.email')" type="email" />
              <AppInput v-model="accountPassword" :label="t('orgs.onboarding.password')" type="password" :hint="t('orgs.onboarding.passwordHint')" />
            </div>
            <div class="form-actions">
              <AppButton type="button" variant="secondary" icon="plus" @click="addAccount()">{{ t('orgs.onboarding.addAccount') }}</AppButton>
            </div>
          </div>
          <div class="wizard-nav">
            <AppButton type="button" variant="secondary" icon="arrow-left" @click="step = 2">{{ t('orgs.onboarding.back') }}</AppButton>
            <AppButton type="submit" icon-end="arrow-right">{{ t('orgs.onboarding.review') }}</AppButton>
          </div>
        </form>

        <section v-else class="form-stack review">
          <h2>{{ t('orgs.onboarding.steps.review') }}</h2>
          <article class="record-card">
            <h3>{{ t('orgs.onboarding.organisation') }}</h3>
            <dl class="detail-list">
              <div>
                <dt>{{ t('orgs.fields.name') }}</dt>
                <dd>{{ profile.name }}</dd>
              </div>
              <div>
                <dt>{{ t('orgs.fields.contactEmail') }}</dt>
                <dd>{{ profile.contactEmail }}</dd>
              </div>
              <div>
                <dt>{{ t('orgs.fields.contactPhone') }}</dt>
                <dd>{{ profile.contactPhone }}</dd>
              </div>
              <div>
                <dt>{{ t('address.country') }}</dt>
                <dd>{{ countryLabel(profile.address.country) }}</dd>
              </div>
              <div v-if="profile.companyIdentificationNumber">
                <dt>{{ t('orgs.fields.companyId') }}</dt>
                <dd>{{ profile.companyIdentificationNumber }}</dd>
              </div>
              <div v-if="profile.taxNumber">
                <dt>{{ t('orgs.fields.taxNumber') }}</dt>
                <dd>{{ profile.taxNumber }}</dd>
              </div>
            </dl>
            <p v-if="postalAddressLines(profile.address).length" class="postal">{{ addressPreview(profile.address) }}</p>
          </article>

          <article class="record-card">
            <h3>{{ t('orgs.onboarding.clinics') }} <span class="count">{{ clinics.length }}</span></h3>
            <ul class="person-list">
              <li v-for="clinic in clinics" :key="clinic.name" class="clinic-row">
                <strong dir="auto">{{ clinic.name }}</strong>
                <span v-if="clinic.contactEmail || clinic.contactPhone" class="muted">{{ [clinic.contactEmail, clinic.contactPhone].filter(Boolean).join(' · ') }}</span>
                <span v-if="postalAddressLines(clinic.address).length" class="postal">{{ addressPreview(clinic.address) }}</span>
              </li>
            </ul>
          </article>

          <article class="record-card">
            <h3>{{ t('orgs.onboarding.accountsTitle') }} <span class="count">{{ accounts.length }}</span></h3>
            <ul v-if="accounts.length" class="person-list">
              <li v-for="account in accounts" :key="account.email" class="person">
                <span class="avatar" aria-hidden="true">{{ initials(account.name) }}</span>
                <div class="person-text">
                  <strong dir="auto">{{ account.name }}</strong>
                  <span>{{ account.email }}</span>
                </div>
              </li>
            </ul>
            <p v-else class="muted">{{ t('orgs.onboarding.noAccountsReview') }}</p>
          </article>

          <div class="wizard-nav">
            <AppButton type="button" variant="secondary" icon="arrow-left" @click="step = 3">{{ t('orgs.onboarding.back') }}</AppButton>
            <AppButton type="button" icon="check" :loading="saving" @click="confirm">{{ t('orgs.onboarding.createButton') }}</AppButton>
          </div>
        </section>
      </div>
    </div>
  </PageContainer>
</template>

<style scoped>
.wizard {
  display: grid;
  gap: var(--space-5);
  max-width: 920px;
}

.stepper ol {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.step {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 36px;
  padding: 0 var(--space-3) 0 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: 500;
}

.step:disabled {
  cursor: default;
}

.step-number {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--color-surface-sunken);
  font-size: var(--text-xs);
  font-weight: 700;
}

.is-current .step {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary-ink);
  font-weight: 600;
}

.is-current .step-number,
.is-done .step-number {
  background: var(--color-primary);
  color: #ffffff;
}

.is-done .step {
  color: var(--color-ink);
}

.is-done .step:hover {
  border-color: var(--color-primary);
}

.step-count {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: 500;
}

h2 {
  font-size: var(--text-lg);
}

h3 {
  font-size: var(--text-base);
}

.wizard-nav {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}

.wizard-nav > :only-child {
  margin-inline-start: auto;
}

.person-list {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.person {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.person-text {
  display: grid;
  flex: 1;
  min-width: 0;
}

.person-text span,
.muted {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.avatar {
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

.clinic-row {
  display: grid;
  gap: 2px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.postal {
  color: var(--color-text);
  font-size: var(--text-sm);
  white-space: pre-line;
}

.count {
  margin-inline-start: 6px;
  padding: 1px 8px;
  border-radius: var(--radius-full);
  background: var(--color-surface-sunken);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-weight: 600;
}
</style>
