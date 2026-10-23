<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  INVITABLE_ROLES,
  LOCALES,
  ROLE_LABELS,
  type CreateOrganizationRequest,
  type InvitableRole,
} from '@abapro/shared';
import { createOrganizationRequest } from '@/api/resources';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import FileUpload from '@/components/ui/FileUpload.vue';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';

const DRAFT_KEY = 'abapro.onboarding';
const countries = [
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'AU', label: 'Australia' },
  { value: 'IE', label: 'Ireland' },
  { value: 'NZ', label: 'New Zealand' },
  { value: 'IN', label: 'India' },
  { value: 'MX', label: 'Mexico' },
  { value: 'ES', label: 'Spain' },
  { value: 'FR', label: 'France' },
];
const localeOptions = LOCALES.map((locale) => ({ value: locale, label: locale }));
const roleOptions = INVITABLE_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));
const timezones = (
  Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
).supportedValuesOf?.('timeZone') ?? ['UTC'];

const auth = useAuthStore();
const toast = useToastStore();
const router = useRouter();
const step = ref(1);
const formError = ref('');
const saving = ref(false);
const logoFiles = ref<File[]>([]);
const inviteEmail = ref('');
const inviteRole = ref<InvitableRole>('therapist');

const draft = reactive<CreateOrganizationRequest>({
  name: '',
  contactEmail: '',
  contactPhone: '',
  country: 'US',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  locale: 'en-US',
  primaryColor: '#0e6b62',
  invites: [],
});

const steps = [
  'Organization',
  'Region',
  'Administrator',
  'Branding',
  'Team',
  'Review',
];

const timezoneOptions = computed(() => timezones.map((zone) => ({ value: zone, label: zone })));

onMounted(() => {
  const saved = sessionStorage.getItem(DRAFT_KEY);
  if (!saved) {
    draft.contactEmail = auth.user?.email ?? '';
    return;
  }
  try {
    Object.assign(draft, JSON.parse(saved) as Partial<CreateOrganizationRequest>);
    draft.invites = Array.isArray(draft.invites) ? draft.invites : [];
  } catch {
    sessionStorage.removeItem(DRAFT_KEY);
  }
});

function persist(): void {
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function validateStep(): string {
  if (step.value === 1) {
    if (draft.name.trim().length < 2) return 'Enter the organization name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.contactEmail.trim())) return 'Enter a contact email.';
  }
  if (step.value === 2 && !draft.timezone) return 'Choose a time zone.';
  if (step.value === 4 && !/^#[0-9a-fA-F]{6}$/.test(draft.primaryColor)) return 'Use a hex color such as #0e6b62.';
  return '';
}

async function next(): Promise<void> {
  formError.value = validateStep();
  if (formError.value) return;
  if (step.value === 4) {
    const file = logoFiles.value[0];
    if (file) {
      const encoded = await readLogo(file);
      if (!encoded) {
        formError.value = 'Upload a PNG, JPEG, or WebP logo up to 512 KB.';
        return;
      }
      draft.logoContentType = encoded.contentType;
      draft.logoBase64 = encoded.base64;
    } else {
      draft.logoContentType = undefined;
      draft.logoBase64 = undefined;
    }
  }
  persist();
  step.value += 1;
}

function back(): void {
  formError.value = '';
  step.value = Math.max(1, step.value - 1);
}

function addInvite(): void {
  const email = inviteEmail.value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    formError.value = 'Enter a valid email address.';
    return;
  }
  if (draft.invites.some((invite) => invite.email === email)) {
    formError.value = 'Each invitation needs a different email address.';
    return;
  }
  draft.invites.push({ email, role: inviteRole.value });
  inviteEmail.value = '';
  formError.value = '';
  persist();
}

function removeInvite(email: string): void {
  draft.invites = draft.invites.filter((invite) => invite.email !== email);
  persist();
}

async function createOrganization(): Promise<void> {
  formError.value = '';
  saving.value = true;
  try {
    auth.user = await createOrganizationRequest({
      ...draft,
      name: draft.name.trim(),
      contactEmail: draft.contactEmail.trim(),
      contactPhone: draft.contactPhone?.trim() || undefined,
    });
    sessionStorage.removeItem(DRAFT_KEY);
    toast.push({ tone: 'success', title: 'Organization created', message: auth.user.organization?.name });
    await router.push('/');
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'The organization could not be created.';
  } finally {
    saving.value = false;
  }
}

function readLogo(file: File): Promise<{ contentType: string; base64: string } | null> {
  const contentType = file.type || (file.name.endsWith('.png') ? 'image/png' : file.name.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(contentType) || file.size > 512 * 1024) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve({ contentType, base64: result.split(',')[1] ?? '' });
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}
</script>

<template>
  <div class="wizard">
    <header>
      <p class="eyebrow">Organization setup</p>
      <h1>Create your therapy centre</h1>
      <ol>
        <li v-for="(label, index) in steps" :key="label" :class="{ current: step === index + 1 }">{{ label }}</li>
      </ol>
    </header>
    <form class="card" @submit.prevent="step === 6 ? createOrganization() : next()">
      <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
      <section v-if="step === 1">
        <h2>Organization name and contact</h2>
        <AppInput v-model="draft.name" label="Organization name" required autocomplete="organization" />
        <AppInput v-model="draft.contactEmail" label="Contact email" type="email" required autocomplete="email" />
        <AppInput v-model="draft.contactPhone" label="Contact phone" autocomplete="tel" hint="Optional" />
      </section>
      <section v-else-if="step === 2">
        <h2>Country, time zone, and locale</h2>
        <AppSelect v-model="draft.country" label="Country" :options="countries" required />
        <AppSelect v-model="draft.timezone" label="Time zone" :options="timezoneOptions" required />
        <AppSelect v-model="draft.locale" label="Locale" :options="localeOptions" required />
      </section>
      <section v-else-if="step === 3">
        <h2>Administrator profile</h2>
        <p>You will be the first organization administrator. This identity comes from your sign-in and cannot be changed here.</p>
        <AppInput :model-value="auth.user?.name ?? ''" label="Name" disabled />
        <AppInput :model-value="auth.user?.email ?? ''" label="Email" disabled />
      </section>
      <section v-else-if="step === 4">
        <h2>Logo and branding</h2>
        <AppInput v-model="draft.primaryColor" label="Primary color" hint="Hex color, for example #0e6b62" required />
        <FileUpload v-model="logoFiles" label="Organization logo" accept="image/png,image/jpeg,image/webp" :max-size-mb="0.5" hint="PNG, JPEG, or WebP up to 512 KB. Optional." />
      </section>
      <section v-else-if="step === 5">
        <h2>Invite initial team members</h2>
        <p>Invitations expire after 7 days and can be used once. You can skip this step.</p>
        <div class="invite-row">
          <AppInput v-model="inviteEmail" label="Email" type="email" />
          <AppSelect v-model="inviteRole" label="Role" :options="roleOptions" />
          <AppButton type="button" variant="secondary" @click="addInvite">Add</AppButton>
        </div>
        <ul v-if="draft.invites.length">
          <li v-for="invite in draft.invites" :key="invite.email">
            <span>{{ invite.email }} · {{ ROLE_LABELS[invite.role] }}</span>
            <AppButton type="button" variant="ghost" @click="removeInvite(invite.email)">Remove</AppButton>
          </li>
        </ul>
      </section>
      <section v-else>
        <h2>Review and create</h2>
        <dl>
          <div><dt>Name</dt><dd>{{ draft.name }}</dd></div>
          <div><dt>Contact</dt><dd>{{ draft.contactEmail }}</dd></div>
          <div><dt>Region</dt><dd>{{ draft.country }} · {{ draft.timezone }} · {{ draft.locale }}</dd></div>
          <div><dt>Administrator</dt><dd>{{ auth.user?.name }} · {{ auth.user?.email }}</dd></div>
          <div><dt>Color</dt><dd>{{ draft.primaryColor }}</dd></div>
          <div><dt>Logo</dt><dd>{{ draft.logoBase64 ? 'Ready to upload' : 'None' }}</dd></div>
          <div><dt>Invitations</dt><dd>{{ draft.invites.length ? draft.invites.map((invite) => invite.email).join(', ') : 'None' }}</dd></div>
        </dl>
      </section>
      <div class="actions">
        <AppButton v-if="step > 1" type="button" variant="secondary" @click="back">Back</AppButton>
        <AppButton v-if="step < 6" type="submit">Continue</AppButton>
        <AppButton v-else type="submit" :loading="saving">Create organization</AppButton>
      </div>
    </form>
  </div>
</template>

<style scoped>
.wizard {
  min-height: 100%;
  padding: 32px 16px 48px;
  display: grid;
  gap: 20px;
  align-content: start;
  justify-items: center;
}

header, .card {
  width: min(720px, 100%);
}

.eyebrow {
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 0.78rem;
  color: var(--color-accent, #0e6b62);
}

ol {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

li {
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--color-surface-muted, #eef3f1);
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

li.current {
  background: #0e6b62;
  color: white;
}

.card {
  display: grid;
  gap: 14px;
  padding: 24px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.form-error { color: var(--color-danger); }
.invite-row { display: grid; grid-template-columns: 1fr 1fr auto; gap: 12px; align-items: end; }
ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
ul li { display: flex; justify-content: space-between; align-items: center; background: transparent; color: inherit; padding: 0; }
dl { display: grid; gap: 10px; margin: 0; }
dl div { display: grid; grid-template-columns: 140px 1fr; gap: 12px; }
dt { color: var(--color-text-muted); }
dd { margin: 0; }
.actions { display: flex; justify-content: flex-end; gap: 8px; }

@media (max-width: 700px) {
  .invite-row, dl div { grid-template-columns: 1fr; }
}
</style>
