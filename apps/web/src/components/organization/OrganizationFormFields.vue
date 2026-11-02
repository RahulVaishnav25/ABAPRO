<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import PostalAddressFields from '@/components/address/PostalAddressFields.vue';
import AppInput from '@/components/ui/AppInput.vue';
import type { OrganizationFormValue } from './form-values';

const { t } = useI18n();
const model = defineModel<OrganizationFormValue>({ required: true });
</script>

<template>
  <div class="form-stack">
    <AppInput v-model="model.name" :label="t('orgs.fields.name')" required />
    <div class="form-grid">
      <AppInput v-model="model.contactEmail" :label="t('orgs.fields.contactEmail')" type="email" autocomplete="email" required />
      <AppInput v-model="model.contactPhone" :label="t('orgs.fields.contactPhone')" type="tel" autocomplete="tel" required />
    </div>
    <div class="form-grid">
      <AppInput v-model="model.companyIdentificationNumber" :label="t('orgs.fields.companyId')" />
      <AppInput v-model="model.taxNumber" :label="t('orgs.fields.taxNumber')" />
    </div>
    <PostalAddressFields v-model="model.address" country-required />
  </div>
</template>
