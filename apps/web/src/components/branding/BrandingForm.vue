<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { DEFAULT_ORGANIZATION_BRANDING } from '@abapro/shared';
import BrandingLivePreview from '@/components/branding/BrandingLivePreview.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import AppIcon from '@/components/navigation/AppIcon.vue';
import { hexToRgb } from '@/lib/theme';
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
const { t } = useI18n();
const platform = props.scope === 'platform';
const idPrefix = platform ? 'platform' : 'org';

const images = computed(() => [
  { key: 'logoUrl' as const, label: t('branding.logo'), hint: t('branding.logoHint'), accept: 'image/*', clear: t('branding.clearLogo') },
  { key: 'faviconUrl' as const, label: t('branding.favicon'), hint: t('branding.faviconHint'), accept: 'image/*,.ico', clear: t('branding.clearFavicon') },
]);

const colors = computed(() => [
  { key: 'primaryColor' as const, label: t('branding.primary'), placeholder: '#0e6b62' },
  { key: 'secondaryColor' as const, label: t('branding.secondary'), placeholder: '#18794e' },
]);

/** WCAG contrast of white text on a colour, so admins can see when buttons would be hard to read. */
function contrastWithWhite(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
  return Math.round((1.05 / (luminance + 0.05)) * 10) / 10;
}

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
    toast.push({ tone: 'danger', title: failureTitle, message: errorMessage(err, t('errors.generic')) });
  } finally {
    saving.value = false;
  }
}

async function save(): Promise<void> {
  const organizationId = auth.user?.organization?.id;
  if (!platform && !organizationId) return;
  await run(
    () => (platform ? branding.savePlatform({ ...draft }) : branding.saveOrganization(organizationId!, { ...draft })),
    platform
      ? { title: t('branding.savedPlatform'), message: t('branding.savedPlatformMessage') }
      : { title: t('branding.savedOrg'), message: t('branding.savedOrgMessage') },
    t('branding.saveFailed'),
  );
}

function cancel(): void {
  sync();
  toast.push({ tone: 'info', title: t('branding.discarded') });
}

const confirmingReset = ref(false);

async function reset(): Promise<void> {
  confirmingReset.value = false;
  const organizationId = auth.user?.organization?.id;
  if (!platform && !organizationId) return;
  await run(
    async () => {
      await (platform ? branding.resetPlatform() : branding.resetOrganization(organizationId!));
      sync();
    },
    { title: t('branding.resetDone') },
    t('branding.resetFailed'),
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
  <div class="branding-layout">
    <div class="branding-fields">
      <fieldset class="branding-group">
        <legend>{{ t('branding.identity') }}</legend>
        <AppInput v-if="platform" v-model="draft.portalName" :label="t('branding.portalName')" required />
        <AppInput v-else v-model="draft.portalName" :label="t('branding.orgPortalName')" :placeholder="t('branding.orgPortalPlaceholder')" />
        <div v-for="image in images" :key="image.key" class="field">
          <label class="field-label" :for="`${idPrefix}-${image.key}`">{{ image.label }}</label>
          <div class="image-row">
            <span class="image-thumb" aria-hidden="true">
              <img v-if="draft[image.key]" :src="draft[image.key]" alt="" />
              <AppIcon v-else name="file" :size="18" />
            </span>
            <input
              :id="`${idPrefix}-${image.key}`"
              v-model="draft[image.key]"
              type="text"
              class="control"
              :placeholder="t('branding.imagePlaceholder')"
              :aria-describedby="`${idPrefix}-${image.key}-hint`"
            />
            <label class="btn btn-secondary btn-sm upload-button">
              <AppIcon name="upload" :size="16" />
              {{ t('branding.upload') }}
              <input type="file" :accept="image.accept" class="visually-hidden" @change="upload($event, image.key)" />
            </label>
            <button v-if="draft[image.key]" type="button" class="btn btn-ghost btn-sm btn-icon" :aria-label="image.clear" :title="image.clear" @click="draft[image.key] = ''">
              <AppIcon name="close" :size="16" />
            </button>
          </div>
          <p :id="`${idPrefix}-${image.key}-hint`" class="field-hint">{{ image.hint }}</p>
        </div>
      </fieldset>

      <fieldset class="branding-group">
        <legend>{{ t('branding.colours') }}</legend>
        <div class="form-grid">
          <div v-for="color in colors" :key="color.key" class="field">
            <label class="field-label" :for="`${idPrefix}-${color.key === 'primaryColor' ? 'primary' : 'secondary'}`">{{ color.label }}</label>
            <div class="color-row">
              <input
                :id="`${idPrefix}-${color.key === 'primaryColor' ? 'primary' : 'secondary'}`"
                v-model="draft[color.key]"
                type="color"
                class="color-swatch"
              />
              <input v-model="draft[color.key]" type="text" class="control color-text" :placeholder="color.placeholder" :aria-label="color.label" dir="ltr" />
            </div>
            <p
              v-if="contrastWithWhite(draft[color.key]) !== null"
              class="field-hint contrast"
              :class="{ 'is-low': (contrastWithWhite(draft[color.key]) ?? 0) < 4.5 }"
            >
              <AppIcon :name="(contrastWithWhite(draft[color.key]) ?? 0) < 4.5 ? 'alert' : 'check'" :size="14" />
              {{ (contrastWithWhite(draft[color.key]) ?? 0) < 4.5 ? t('branding.contrastLow') : t('branding.contrast', { ratio: contrastWithWhite(draft[color.key]) }) }}
            </p>
          </div>
        </div>
      </fieldset>

      <fieldset v-if="platform" class="branding-group">
        <legend>{{ t('branding.signIn') }}</legend>
        <AppInput v-model="draft.loginHeadline" :label="t('branding.headline')" :hint="t('branding.headlineHint')" required />
        <AppInput v-model="draft.loginSubtitle" :label="t('branding.subtitle')" :hint="t('branding.subtitleHint')" required />
      </fieldset>
    </div>

    <div class="branding-preview">
      <BrandingLivePreview :draft="draft" :is-platform="platform" />
    </div>
  </div>

  <!-- One save bar for the section; it shows whether the preview differs from what is saved. -->
  <div class="branding-actions" :class="{ 'is-dirty': dirty }">
    <span class="branding-status" aria-live="polite">
      <AppIcon :name="dirty ? 'info' : 'check'" :size="16" />
      {{ dirty ? t('branding.unsaved') : t('branding.synced') }}
    </span>
    <div class="branding-buttons">
      <AppButton type="button" variant="ghost" @click="confirmingReset = true">{{ t('branding.reset') }}</AppButton>
      <AppButton type="button" variant="secondary" :disabled="!dirty" @click="cancel">{{ t('branding.cancel') }}</AppButton>
      <AppButton type="button" :loading="saving" @click="save">{{ t('branding.save') }}</AppButton>
    </div>
  </div>

  <ConfirmDialog
    :open="confirmingReset"
    :title="t('branding.resetTitle')"
    :message="platform ? t('branding.resetPlatform') : t('branding.resetOrg')"
    :confirm-label="t('branding.reset')"
    tone="danger"
    @confirm="reset"
    @cancel="confirmingReset = false"
  />
</template>

<style scoped>
.branding-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
  gap: var(--space-6);
  align-items: start;
}

.branding-fields {
  display: grid;
  gap: var(--space-5);
}

.branding-group {
  display: grid;
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  border: 0;
}

.branding-group legend {
  margin-bottom: var(--space-3);
  padding: 0;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: 600;
}

.branding-group + .branding-group {
  padding-top: var(--space-5);
  border-top: 1px solid var(--color-border);
}

.image-row,
.color-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.image-row .control {
  flex: 1;
  min-width: 0;
}

.image-thumb {
  display: grid;
  place-items: center;
  flex: none;
  width: 40px;
  height: 40px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-muted);
  color: var(--color-text-subtle);
}

.image-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.upload-button {
  position: relative;
  flex: none;
  cursor: pointer;
}

.upload-button:has(input:focus-visible) {
  box-shadow: var(--focus);
}

.color-swatch {
  flex: none;
  width: 44px;
  height: 40px;
  padding: 3px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  cursor: pointer;
}

.color-text {
  max-width: 140px;
  font-variant-numeric: tabular-nums;
}

.contrast {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--color-success);
}

.contrast.is-low {
  color: var(--color-warning);
}

.branding-preview {
  position: sticky;
  top: calc(var(--topbar-height) + var(--space-4));
  min-width: 0;
}

.branding-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-top: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
}

.branding-actions.is-dirty {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}

.branding-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: 500;
}

.is-dirty .branding-status {
  color: var(--color-primary-ink);
}

.branding-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

@media (max-width: 1100px) {
  .branding-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .branding-preview {
    position: static;
  }
}
</style>
