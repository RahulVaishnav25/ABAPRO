<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { EffectivePreferences, UserPreferences } from '@abapro/shared';
import { myPreferencesRequest, saveMyPreferencesRequest } from '@/api/preferences';
import RegionalForm from '@/components/settings/RegionalForm.vue';
import AppButton from '@/components/ui/AppButton.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import { applyPreferences } from '@/i18n';
import { errorMessage, useLoader } from '@/lib/loader';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';

/** A user's own language, timezone and formats. Blank values follow the organisation. */
const { t } = useI18n();
const auth = useAuthStore();
const toast = useToastStore();
const form = ref<UserPreferences>({});
const effective = ref<EffectivePreferences | null>(null);
const saving = ref(false);

const { loading, error, load } = useLoader(async () => {
  const mine = await myPreferencesRequest();
  form.value = { ...mine.user };
  effective.value = mine.effective;
}, t('errors.generic'));

/** What blank values use: the organisation's setting, else the platform's. */
const inherited = computed(() => {
  const value = effective.value;
  if (!value) return undefined;
  const level = Object.entries(value.sources).find(([, source]) => source !== 'user')?.[1] ?? 'organization';
  return {
    level: (level === 'user' ? 'organization' : level) as 'organization' | 'platform' | 'default',
    locale: value.sources.locale === 'user' ? undefined : value.locale,
    timezone: value.sources.timezone === 'user' ? undefined : value.timezone,
    dateFormat: value.sources.dateFormat === 'user' ? undefined : value.dateFormat,
    timeFormat: value.sources.timeFormat === 'user' ? undefined : value.timeFormat,
  };
});

async function save(): Promise<void> {
  saving.value = true;
  try {
    const saved = await saveMyPreferencesRequest(form.value);
    form.value = { ...saved.user };
    effective.value = saved.effective;
    // The app applies the new language and formats when the user's preferences change.
    if (auth.user) auth.user = { ...auth.user, preferences: saved.effective };
    // Confirm in the newly chosen language.
    await applyPreferences(saved.effective);
    toast.push({ tone: 'success', title: t('preferences.saved') });
  } catch (saveError) {
    toast.push({ tone: 'danger', title: t('preferences.notSaved'), message: errorMessage(saveError, t('errors.generic')) });
  } finally {
    saving.value = false;
  }
}

void load();
</script>

<template>
  <PageContainer>
    <PageHeader :title="t('preferences.title')" :description="t('preferences.description')" />
    <SkeletonBlock v-if="loading" height="220px" />
    <ErrorState v-else-if="error" :title="t('states.unavailable')" :description="error" @retry="load" />
    <section v-else class="panel preferences-card">
      <RegionalForm v-model="form" :inherited="inherited" />
      <div class="preferences-actions">
        <AppButton :loading="saving" @click="save">{{ t('common.saveChanges') }}</AppButton>
      </div>
    </section>
  </PageContainer>
</template>

<style scoped>
.preferences-card {
  display: grid;
  gap: var(--space-5);
  padding: var(--space-6);
}

.preferences-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
