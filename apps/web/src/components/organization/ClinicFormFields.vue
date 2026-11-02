<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import PostalAddressFields from '@/components/address/PostalAddressFields.vue';
import AppInput from '@/components/ui/AppInput.vue';
import type { ClinicFormValue } from './form-values';

const { t } = useI18n();
const model = defineModel<ClinicFormValue>({ required: true });
</script>

<template>
  <div class="form-stack">
    <AppInput v-model="model.name" :label="t('clinics.fields.name')" required />
    <div class="form-grid">
      <AppInput v-model="model.contactEmail" :label="t('clinics.fields.email')" type="email" autocomplete="email" />
      <AppInput v-model="model.contactPhone" :label="t('clinics.fields.phone')" type="tel" autocomplete="tel" />
    </div>
    <PostalAddressFields v-model="model.address" />
  </div>
</template>
