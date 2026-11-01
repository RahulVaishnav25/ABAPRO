<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTextarea from '@/components/ui/AppTextarea.vue';
import { useClientOptions } from './options';

export interface GoalFieldValues {
  statement: string;
  objective: string;
  assessmentReference: string;
  reviewOn: string;
  status: 'active' | 'met' | 'discontinued';
}

/** Status is shown only for a saved goal. */
defineProps<{ showStatus?: boolean }>();
const goal = defineModel<GoalFieldValues>({ required: true });

const { t } = useI18n();
const { goalStatusOptions } = useClientOptions();
</script>

<template>
  <div class="form-stack">
    <AppTextarea v-model="goal.statement" :label="t('clients.fields.goal')" :rows="2" />
    <AppTextarea v-model="goal.objective" :label="t('clients.fields.objective')" :rows="2" />
    <div class="form-grid">
      <AppInput v-model="goal.assessmentReference" :label="t('clients.fields.assessmentReference')" />
      <AppInput v-model="goal.reviewOn" :label="t('clients.fields.reviewDate')" type="date" />
      <AppSelect v-if="showStatus" v-model="goal.status" :label="t('clients.fields.status')" :options="goalStatusOptions" />
    </div>
  </div>
</template>
