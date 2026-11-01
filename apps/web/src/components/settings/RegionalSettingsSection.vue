<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { RegionalSettings } from '@abapro/shared';
import {
  organizationRegionalRequest,
  platformRegionalRequest,
  saveOrganizationRegionalRequest,
  savePlatformRegionalRequest,
} from '@/api/preferences';
import { currentUserRequest } from '@/api/resources';
import AppButton from '@/components/ui/AppButton.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import { errorMessage, useLoader } from '@/lib/loader';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import RegionalForm from './RegionalForm.vue';

/** Organisation or platform language and region, in Settings. */
const props = defineProps<{ scope: 'organization' | 'platform' }>();
const { t } = useI18n();
const auth = useAuthStore();
const toast = useToastStore();
const form = ref<RegionalSettings>({});
const platformDefaults = ref<RegionalSettings>({});
const saving = ref(false);
const currencyError = ref('');

const { loading, error, load } = useLoader(async () => {
  if (props.scope === 'organization') {
    const [mine, platform] = await Promise.all([organizationRegionalRequest(), platformRegionalRequest()]);
    form.value = { ...mine };
    platformDefaults.value = platform;
  } else {
    form.value = { ...(await platformRegionalRequest()) };
  }
}, t('errors.generic'));

/** Organisation formats left blank use the platform's; platform values left blank use the standard ones. */
const inherited = computed(() =>
  props.scope === 'organization'
    ? { level: 'platform' as const, dateFormat: platformDefaults.value.dateFormat ?? 'auto', timeFormat: platformDefaults.value.timeFormat ?? 'auto' }
    : { level: 'default' as const, locale: 'en', timezone: 'UTC', dateFormat: 'auto', timeFormat: 'auto' },
);

async function save(): Promise<void> {
  currencyError.value = form.value.currency && !/^[A-Z]{3}$/.test(form.value.currency) ? t('regional.invalidCurrency') : '';
  if (currencyError.value) return;
  saving.value = true;
  try {
    form.value = { ...(props.scope === 'organization' ? await saveOrganizationRegionalRequest(form.value) : await savePlatformRegionalRequest(form.value)) };
    // Reload the signed-in user so the new defaults apply straight away.
    auth.user = await currentUserRequest();
    toast.push({ tone: 'success', title: t('settings.regionalSaved') });
  } catch (saveError) {
    toast.push({ tone: 'danger', title: t('common.notSaved'), message: errorMessage(saveError, t('errors.generic')) });
  } finally {
    saving.value = false;
  }
}

onMounted(() => void load());
</script>

<template>
  <section class="settings-card">
    <div class="section-heading">
      <h2>{{ scope === 'organization' ? t('settings.regionalTitle') : t('settings.regionalPlatformTitle') }}</h2>
      <p class="section-desc">
        {{ scope === 'organization' ? t('settings.regionalOrgDescription', { organisation: auth.user?.organization?.name ?? '' }) : t('settings.regionalPlatformDescription') }}
      </p>
    </div>
    <SkeletonBlock v-if="loading" height="160px" />
    <ErrorState v-else-if="error" :title="t('states.unavailable')" :description="error" @retry="load" />
    <template v-else>
      <RegionalForm v-model="form" :inherited="inherited" :required="scope === 'organization'" show-currency :currency-error="currencyError" />
      <div class="regional-actions">
        <AppButton :loading="saving" @click="save">{{ t('common.saveChanges') }}</AppButton>
      </div>
    </template>
  </section>
</template>

<style scoped>
.regional-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
