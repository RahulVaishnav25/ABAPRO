<script setup lang="ts">
import PostalAddressFields from '@/components/address/PostalAddressFields.vue';
import AppInput from '@/components/ui/AppInput.vue';
import type { OrganizationFormValue } from './form-values';

const model = defineModel<OrganizationFormValue>({ required: true });
</script>

<template>
  <div class="organisation-fields">
    <AppInput v-model="model.name" label="Organisation name" required />
    <AppInput v-model="model.contactEmail" label="Contact email" type="email" autocomplete="email" required />
    <AppInput v-model="model.contactPhone" label="Contact phone" type="tel" autocomplete="tel" required />
    <div class="pair">
      <AppInput v-model="model.companyIdentificationNumber" label="Company identification number" />
      <AppInput v-model="model.taxNumber" label="Tax number" />
    </div>
    <PostalAddressFields v-model="model.address" country-required />
  </div>
</template>

<style scoped>
.organisation-fields {
  display: grid;
  gap: 12px;
}

.pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

@media (max-width: 720px) {
  .pair {
    grid-template-columns: 1fr;
  }
}
</style>
