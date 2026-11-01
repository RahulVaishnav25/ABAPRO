<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { LANGUAGES, type LanguageCode } from '@abapro/shared';
import AppIcon from './AppIcon.vue';
import { setLanguage } from '@/i18n';

/** Switches the interface language for this browser, for pages shown before sign-in. */
const { t, locale } = useI18n();

function choose(event: Event): void {
  void setLanguage((event.target as HTMLSelectElement).value as LanguageCode);
}
</script>

<template>
  <label class="language-picker">
    <AppIcon name="globe" :size="16" />
    <span class="visually-hidden">{{ t('regional.language') }}</span>
    <select :value="locale" @change="choose">
      <option v-for="language in LANGUAGES" :key="language.code" :value="language.code" :lang="language.code">{{ language.nativeName }}</option>
    </select>
  </label>
</template>

<style scoped>
.language-picker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--color-text-muted);
}

select {
  min-height: 32px;
  padding: 0 var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-ink);
  font-size: var(--text-sm);
}
</style>
