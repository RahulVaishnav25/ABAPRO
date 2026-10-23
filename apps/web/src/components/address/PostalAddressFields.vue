<script setup lang="ts">
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import { ADDRESS_COUNTRIES, type PostalAddress } from './postal-address';

const model = defineModel<PostalAddress>({ required: true });

withDefaults(
  defineProps<{
    legend?: string;
    countryRequired?: boolean;
  }>(),
  {
    legend: 'Address',
    countryRequired: false,
  },
);

const countries = ADDRESS_COUNTRIES.map((country) => ({ value: country.value, label: country.label }));
</script>

<template>
  <fieldset class="address-fields">
    <legend>{{ legend }}</legend>
    <AppInput v-model="model.line1" label="Address line 1" autocomplete="address-line1" />
    <AppInput v-model="model.line2" label="Address line 2" autocomplete="address-line2" />
    <AppInput v-model="model.landmark" label="Landmark" />
    <div class="address-grid">
      <AppInput v-model="model.state" label="State" autocomplete="address-level1" />
      <AppSelect
        v-model="model.country"
        label="Country"
        :options="countries"
        :required="countryRequired"
        :placeholder="countryRequired ? undefined : 'Select country'"
      />
      <AppInput v-model="model.city" label="City" autocomplete="address-level2" />
      <AppInput v-model="model.postalCode" label="ZIP code" autocomplete="postal-code" />
    </div>
  </fieldset>
</template>

<style scoped>
.address-fields {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
}

.address-fields legend {
  padding: 0 4px;
  font-weight: 700;
  color: var(--color-ink);
}

.address-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

@media (max-width: 720px) {
  .address-grid {
    grid-template-columns: 1fr;
  }
}
</style>
