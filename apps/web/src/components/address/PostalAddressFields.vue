<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import { ADDRESS_COUNTRIES, countryLabel, type PostalAddress } from './postal-address';

const model = defineModel<PostalAddress>({ required: true });

withDefaults(
  defineProps<{
    legend?: string;
    countryRequired?: boolean;
  }>(),
  {
    legend: undefined,
    countryRequired: false,
  },
);

const { t, locale } = useI18n();
const countries = computed(() => {
  void locale.value;
  return ADDRESS_COUNTRIES.map((country) => ({ value: country.value, label: countryLabel(country.value) }));
});
</script>

<template>
  <fieldset class="address-fields">
    <legend>{{ legend ?? t('address.legend') }}</legend>
    <AppInput v-model="model.line1" :label="t('address.line1')" autocomplete="address-line1" />
    <AppInput v-model="model.line2" :label="t('address.line2')" autocomplete="address-line2" />
    <AppInput v-model="model.landmark" :label="t('address.landmark')" />
    <div class="form-grid">
      <AppInput v-model="model.city" :label="t('address.city')" autocomplete="address-level2" />
      <AppInput v-model="model.state" :label="t('address.state')" autocomplete="address-level1" />
      <AppInput v-model="model.postalCode" :label="t('address.postalCode')" autocomplete="postal-code" />
      <AppSelect
        v-model="model.country"
        :label="t('address.country')"
        :options="countries"
        :required="countryRequired"
        :placeholder="countryRequired ? undefined : t('address.selectCountry')"
      />
    </div>
  </fieldset>
</template>

<style scoped>
.address-fields {
  display: grid;
  gap: var(--space-4);
  margin: 0;
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
}

.address-fields legend {
  padding: 0 4px;
  color: var(--color-ink);
  font-size: var(--text-sm);
  font-weight: 600;
}
</style>
