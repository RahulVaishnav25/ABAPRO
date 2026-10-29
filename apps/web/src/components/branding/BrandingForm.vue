<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { DEFAULT_ORGANIZATION_BRANDING } from '@abapro/shared';
import BrandingLivePreview from '@/components/branding/BrandingLivePreview.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import { errorMessage } from '@/lib/loader';
import { useAuthStore } from '@/stores/auth';
import { useBrandingStore } from '@/stores/branding';
import { useToastStore } from '@/stores/toast';

const props = defineProps<{ scope: 'platform' | 'organization' }>();

interface Draft {
  portalName: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  secondaryColor: string;
  loginHeadline?: string;
  loginSubtitle?: string;
}

const auth = useAuthStore();
const branding = useBrandingStore();
const toast = useToastStore();
const platform = props.scope === 'platform';

const copy = platform
  ? {
      idPrefix: 'platform',
      portalLabel: 'Portal Name',
      logoLabel: 'Logo',
      logoHint: 'Displays in the sidebar, mobile navigation, and login screen.',
      faviconLabel: 'Favicon',
      faviconHint: 'Browser tab icon (supports .ico, .png, .svg).',
      saveLabel: 'Save Platform Branding',
      saved: { title: 'Platform branding saved', message: 'Applied globally across the portal.' },
      saveFailed: 'Failed to save branding',
      reset: 'Platform branding reset to defaults.',
      resetFailed: 'Failed to reset branding',
      discarded: 'Platform branding changes discarded.',
    }
  : {
      idPrefix: 'org',
      portalLabel: 'Organisation Portal Name',
      logoLabel: 'Organisation Logo',
      logoHint: '',
      faviconLabel: 'Organisation Favicon',
      faviconHint: '',
      saveLabel: 'Save Organisation Branding',
      saved: { title: 'Organisation branding saved', message: 'Applied for your organisation after sign-in.' },
      saveFailed: 'Failed to save organisation branding',
      reset: 'Organisation branding reset to platform defaults.',
      resetFailed: 'Failed to reset organisation branding',
      discarded: 'Organisation branding changes discarded.',
    };

const images = [
  { key: 'logoUrl', label: copy.logoLabel, hint: copy.logoHint, accept: 'image/*', placeholder: 'Image URL or upload a file', clearTitle: 'Clear logo' },
  { key: 'faviconUrl', label: copy.faviconLabel, hint: copy.faviconHint, accept: 'image/*,.ico', placeholder: 'Favicon URL or upload a file', clearTitle: 'Clear favicon' },
] as const;

const colors = [
  { key: 'primaryColor', label: 'Primary Colour', placeholder: '#0e6b62' },
  { key: 'secondaryColor', label: 'Secondary Colour', placeholder: '#18794e' },
] as const;

/** The stored branding for this scope, in the shape the form edits. */
function stored(): Draft {
  if (platform) {
    const { portalName, logoUrl, faviconUrl, primaryColor, secondaryColor, loginHeadline, loginSubtitle } = branding.platformBranding;
    return { portalName, logoUrl, faviconUrl, primaryColor, secondaryColor, loginHeadline, loginSubtitle };
  }
  const current = branding.organizationBranding;
  return {
    portalName: current?.portalName || '',
    logoUrl: current?.logoUrl || '',
    faviconUrl: current?.faviconUrl || '',
    primaryColor: current?.primaryColor || DEFAULT_ORGANIZATION_BRANDING.primaryColor,
    secondaryColor: current?.secondaryColor || DEFAULT_ORGANIZATION_BRANDING.secondaryColor,
  };
}

const draft = reactive<Draft>(stored());
const saving = ref(false);
const dirty = computed(() => {
  const current = stored();
  return (Object.keys(current) as Array<keyof Draft>).some((key) => draft[key] !== current[key]);
});

function sync(): void {
  Object.assign(draft, stored());
}

watch(() => (platform ? branding.platformBranding : branding.organizationBranding), sync);

async function run(action: () => Promise<unknown>, success: { title: string; message?: string }, failureTitle: string): Promise<void> {
  saving.value = true;
  try {
    await action();
    toast.push({ tone: 'success', ...success });
  } catch (err) {
    toast.push({ tone: 'danger', title: failureTitle, message: errorMessage(err, 'Please try again.') });
  } finally {
    saving.value = false;
  }
}

async function save(): Promise<void> {
  const organizationId = auth.user?.organization?.id;
  if (!platform && !organizationId) return;
  await run(
    () => (platform ? branding.savePlatform({ ...draft }) : branding.saveOrganization(organizationId!, { ...draft })),
    copy.saved,
    copy.saveFailed,
  );
}

function cancel(): void {
  sync();
  toast.push({ tone: 'info', title: copy.discarded });
}

async function reset(): Promise<void> {
  const organizationId = auth.user?.organization?.id;
  if (!platform && !organizationId) return;
  await run(
    async () => {
      await (platform ? branding.resetPlatform() : branding.resetOrganization(organizationId!));
      sync();
    },
    { title: copy.reset },
    copy.resetFailed,
  );
}

function upload(event: Event, key: 'logoUrl' | 'faviconUrl'): void {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    draft[key] = reader.result as string;
  };
  reader.readAsDataURL(file);
}
</script>

<template>
  <div class="branding-form-grid">
    <div class="field-full">
      <AppInput
        v-if="platform"
        v-model="draft.portalName"
        :label="copy.portalLabel"
        required
      />
      <AppInput
        v-else
        v-model="draft.portalName"
        :label="copy.portalLabel"
        placeholder="e.g. Bright Steps ABA Portal"
      />
    </div>

    <div v-for="image in images" :key="image.key" class="field-upload">
      <label class="field-label">{{ image.label }}</label>
      <div class="upload-controls">
        <input
          v-model="draft[image.key]"
          type="text"
          class="control"
          :placeholder="image.placeholder"
        />
        <label class="btn-file-label">
          Upload
          <input type="file" :accept="image.accept" class="visually-hidden" @change="upload($event, image.key)" />
        </label>
        <button
          v-if="draft[image.key]"
          type="button"
          class="btn-clear"
          :title="image.clearTitle"
          @click="draft[image.key] = ''"
        >
          ✕
        </button>
      </div>
      <p v-if="image.hint" class="field-hint">{{ image.hint }}</p>
    </div>

    <div class="color-picker-pair">
      <div v-for="color in colors" :key="color.key" class="color-field">
        <label class="field-label" :for="`${copy.idPrefix}-${color.key === 'primaryColor' ? 'primary' : 'secondary'}`">{{ color.label }}</label>
        <div class="color-input-wrapper">
          <input
            :id="`${copy.idPrefix}-${color.key === 'primaryColor' ? 'primary' : 'secondary'}`"
            v-model="draft[color.key]"
            type="color"
            class="color-swatch-input"
          />
          <input
            v-model="draft[color.key]"
            type="text"
            class="control"
            :placeholder="color.placeholder"
          />
        </div>
      </div>
    </div>

    <template v-if="platform">
      <div class="field-full">
        <AppInput
          v-model="draft.loginHeadline"
          label="Login Page Headline"
          hint="Appears on the login showcase panel."
          required
        />
      </div>

      <div class="field-full">
        <AppInput
          v-model="draft.loginSubtitle"
          label="Login Page Subtitle"
          hint="Appears below the login headline."
          required
        />
      </div>
    </template>
  </div>

  <div class="form-actions-inline">
    <button
      type="button"
      class="btn-save-branding"
      :disabled="saving"
      @click="save"
    >
      <span v-if="saving" class="spinner" aria-hidden="true"></span>
      {{ copy.saveLabel }}
    </button>
    <AppButton
      type="button"
      variant="secondary"
      :disabled="!dirty"
      @click="cancel"
    >
      Cancel
    </AppButton>
    <AppButton
      type="button"
      variant="secondary"
      @click="reset"
    >
      Reset to Defaults
    </AppButton>
  </div>

  <BrandingLivePreview
    :draft="draft"
    :is-platform="platform"
    :is-dirty="dirty"
    :saving="saving"
    @save="save"
    @cancel="cancel"
    @reset="reset"
  />
</template>

<style scoped>
.branding-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.field-full {
  grid-column: 1 / -1;
}

.field-upload {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--color-ink);
}

.field-hint {
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.upload-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.upload-controls .control {
  flex: 1;
}

.control {
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-ink);
  font-size: 0.92rem;
  outline: none;
}

.control:focus {
  border-color: var(--color-primary);
  box-shadow: var(--focus);
}

.btn-file-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  padding: 0 14px;
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-ink);
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.15s;
}

.btn-file-label:hover {
  background: var(--color-border);
}

.btn-clear {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-danger);
  cursor: pointer;
}

.color-picker-pair {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.color-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.color-input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-swatch-input {
  width: 44px;
  height: 40px;
  padding: 2px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: #ffffff;
  cursor: pointer;
}

.color-input-wrapper .control {
  width: 140px;
}

.form-actions-inline {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 6px 0 12px;
}

.btn-save-branding {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 18px;
  background: #b42318;
  color: #ffffff;
  font-weight: 600;
  font-size: 0.88rem;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.btn-save-branding:hover:not(:disabled) {
  background: #912018;
}

.btn-save-branding:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 820px) {
  .branding-form-grid,
  .color-picker-pair {
    grid-template-columns: 1fr;
  }
}
</style>
