<script setup lang="ts">
import PostalAddressFields from '@/components/address/PostalAddressFields.vue';
import AppInput from '@/components/ui/AppInput.vue';
import type { ClinicFormValue } from './form-values';

const model = defineModel<ClinicFormValue>({ required: true });
</script>

<template>
  <div class="clinic-fields">
    <AppInput v-model="model.name" label="Clinic name" required />
    <div class="pair">
      <AppInput v-model="model.contactEmail" label="Clinic email" type="email" autocomplete="email" />
      <AppInput v-model="model.contactPhone" label="Clinic phone" type="tel" autocomplete="tel" />
    </div>
    <PostalAddressFields v-model="model.address" />
  </div>
</template>

<style scoped>
.clinic-fields {
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
