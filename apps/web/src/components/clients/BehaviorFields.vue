<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { MeasurementType } from '@abapro/shared';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTextarea from '@/components/ui/AppTextarea.vue';
import { useClientOptions } from './options';

export interface BehaviorFieldValues {
  name: string;
  operationalDefinition: string;
  measurementType: MeasurementType;
  measurementNotes: string;
  status: 'active' | 'discontinued';
}

/** Status is shown only for a saved behaviour. */
defineProps<{ showStatus?: boolean; required?: boolean }>();
const behavior = defineModel<BehaviorFieldValues>({ required: true });

const { t } = useI18n();
const { measurementOptions, behaviorStatusOptions } = useClientOptions();
</script>

<template>
  <div class="form-stack">
    <div class="form-grid">
      <AppInput v-model="behavior.name" :label="t('clients.fields.behavior')" :required="required" />
      <AppSelect v-model="behavior.measurementType" :label="t('clients.fields.measurement')" :options="measurementOptions" />
      <AppSelect v-if="showStatus" v-model="behavior.status" :label="t('clients.fields.status')" :options="behaviorStatusOptions" />
    </div>
    <AppTextarea v-model="behavior.operationalDefinition" :label="t('clients.fields.operationalDefinition')" :rows="3" />
    <AppTextarea v-model="behavior.measurementNotes" :label="t('clients.fields.measurementNotes')" :rows="2" />
  </div>
</template>
