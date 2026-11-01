<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { DATE_FORMATS, LOCALES, TIME_FORMATS, type RegionalSettings } from '@abapro/shared';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';

/**
 * Language, timezone and formats for one level: a user, an organisation or the platform. Values left blank fall
 * through to the level below, named in `inherited`.
 */
const model = defineModel<RegionalSettings>({ required: true });
const props = defineProps<{
  /** What each blank value uses instead, with its source, for the "Use ..." option. */
  inherited?: { locale?: string; timezone?: string; dateFormat?: string; timeFormat?: string; level: 'organization' | 'platform' | 'default' };
  /** Organisation language and timezone are required, so they offer no "Use ..." option. */
  required?: boolean;
  showCurrency?: boolean;
  currencyError?: string;
}>();

const { t, locale: uiLocale } = useI18n();

function languageName(code: string): string {
  try {
    return new Intl.DisplayNames([uiLocale.value], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** "Use the organisation's setting (24-hour)": examples in brackets are dropped from the inherited value. */
const inheritLabel = (value: string | undefined) =>
  props.inherited
    ? t('regional.inherit', { level: t(`regional.levels.${props.inherited.level}`), value: (value ?? '').replace(/\s*\([^)]*\)\s*$/, '') })
    : t('common.useDefault');

const localeOptions = computed(() => [
  ...(props.required ? [] : [{ value: '', label: inheritLabel(props.inherited?.locale ? languageName(props.inherited.locale) : undefined) }]),
  ...LOCALES.map((code) => ({ value: code, label: languageName(code) })),
]);

const zones = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf(key: string): string[] }).supportedValuesOf('timeZone');
  } catch {
    return ['UTC'];
  }
})();
const timezoneOptions = computed(() => [
  ...(props.required ? [] : [{ value: '', label: inheritLabel(props.inherited?.timezone) }]),
  ...zones.map((zone) => ({ value: zone, label: zone.replace(/_/g, ' ') })),
]);

const dateOptions = computed(() => [
  ...(props.inherited ? [{ value: '', label: inheritLabel(props.inherited.dateFormat === 'auto' || !props.inherited.dateFormat ? t('regional.auto') : t(`regional.dateFormats.${props.inherited.dateFormat}`)) }] : []),
  ...DATE_FORMATS.map((format) => ({ value: format, label: format === 'auto' ? t('regional.auto') : t(`regional.dateFormats.${format}`) })),
]);
const timeOptions = computed(() => [
  ...(props.inherited ? [{ value: '', label: inheritLabel(props.inherited.timeFormat === 'auto' || !props.inherited.timeFormat ? t('regional.auto') : t(`regional.timeFormats.${props.inherited.timeFormat}`)) }] : []),
  ...TIME_FORMATS.map((format) => ({ value: format, label: format === 'auto' ? t('regional.auto') : t(`regional.timeFormats.${format}`) })),
]);

function field<K extends keyof RegionalSettings>(key: K) {
  return computed({
    get: () => (model.value[key] ?? '') as string,
    set: (value: string) => {
      model.value = { ...model.value, [key]: value || undefined };
    },
  });
}
const locale = field('locale');
const timezone = field('timezone');
const dateFormat = field('dateFormat');
const timeFormat = field('timeFormat');
const currency = field('currency');

/** How a moment looks with these choices, falling back to what each blank value inherits. */
const preview = computed(() => {
  const chosenLocale = locale.value || props.inherited?.locale || 'en';
  const chosenZone = timezone.value || props.inherited?.timezone || 'UTC';
  const chosenTime = timeFormat.value || props.inherited?.timeFormat || 'auto';
  const now = new Date();
  try {
    return new Intl.DateTimeFormat(chosenLocale, {
      timeZone: chosenZone,
      dateStyle: 'full',
      timeStyle: 'short',
      hour12: chosenTime === '12h' ? true : chosenTime === '24h' ? false : undefined,
    }).format(now);
  } catch {
    return '';
  }
});
</script>

<template>
  <div class="regional-form">
    <div class="regional-grid">
      <AppSelect v-model="locale" :label="t('regional.language')" :options="localeOptions" :hint="t('regional.languageHint')" />
      <AppSelect v-model="timezone" :label="t('regional.timezone')" :options="timezoneOptions" :hint="t('regional.timezoneHint')" />
      <AppSelect v-model="dateFormat" :label="t('regional.dateFormat')" :options="dateOptions" />
      <AppSelect v-model="timeFormat" :label="t('regional.timeFormat')" :options="timeOptions" />
      <AppInput
        v-if="showCurrency"
        v-model="currency"
        :label="t('regional.currency')"
        :hint="t('regional.currencyHint')"
        :error="currencyError"
        autocomplete="off"
      />
    </div>
    <p v-if="preview" class="regional-preview">
      <span class="regional-preview-label">{{ t('regional.preview') }}</span>
      <span>{{ preview }}</span>
    </p>
  </div>
</template>

<style scoped>
.regional-form {
  display: grid;
  gap: var(--space-4);
}

.regional-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

@media (max-width: 720px) {
  .regional-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.regional-preview {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
  color: var(--color-ink);
}

.regional-preview-label {
  color: var(--color-text-muted);
  font-weight: 600;
}
</style>
