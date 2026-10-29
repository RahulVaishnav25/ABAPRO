<script setup lang="ts">
import { ref } from 'vue';
import type { ProgramDetail, TargetSummary, TargetWrite } from '@abapro/shared';
import { ApiError } from '@/api/client';
import { saveTargetRequest } from '@/api/programs';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTextarea from '@/components/ui/AppTextarea.vue';
import { useToastStore } from '@/stores/toast';

const props = defineProps<{ programId: string; existing: TargetSummary | null }>();
const emit = defineEmits<{ saved: [program: ProgramDetail]; cancel: [] }>();

const MEASUREMENTS = [
  { value: 'trial', label: 'Trial by trial' },
  { value: 'probe', label: 'Probe' },
  { value: 'frequency', label: 'Frequency' },
  { value: 'duration', label: 'Duration' },
  { value: 'abc', label: 'ABC' },
];
const PHASES = [
  { value: 'baseline', label: 'Baseline' },
  { value: 'intervention', label: 'Intervention' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'mastered', label: 'Mastered' },
];
const STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'mastered', label: 'Mastered' },
  { value: 'discontinued', label: 'Discontinued' },
];

const toast = useToastStore();

function initial(existing: TargetSummary | null): TargetWrite {
  if (!existing) return { title: '', measurementMethod: 'frequency', status: 'active', phase: 'baseline' };
  return {
    title: existing.title,
    description: existing.description,
    operationalDefinition: existing.operationalDefinition,
    measurementMethod: existing.measurementMethod,
    expectedTrialCount: existing.expectedTrialCount ?? undefined,
    baselineNote: existing.baselineNote,
    teachingInstructions: existing.teachingInstructions,
    promptHierarchy: existing.promptHierarchy,
    masteryCriteria: existing.masteryCriteria,
    phase: existing.phase,
    status: existing.status,
    startedOn: existing.startedOn ?? undefined,
    reviewOn: existing.reviewOn ?? undefined,
    clinicalNotes: existing.clinicalNotes,
  };
}

const target = ref<TargetWrite>(initial(props.existing));

function usesTrials(): boolean {
  return target.value.measurementMethod === 'trial' || target.value.measurementMethod === 'probe';
}

async function save(): Promise<void> {
  try {
    const program = await saveTargetRequest(
      props.programId,
      { ...target.value, expectedTrialCount: usesTrials() ? Number(target.value.expectedTrialCount) : undefined },
      props.existing?.id,
    );
    toast.push({ tone: 'success', title: props.existing ? 'Target updated' : 'Target added', message: 'The measurement configuration is saved with this target.' });
    emit('saved', program);
  } catch (saveError) {
    toast.push({ tone: 'danger', title: 'Target was not saved', message: saveError instanceof ApiError ? saveError.message : 'Try again.' });
  }
}
</script>

<template>
  <div class="form-grid">
    <AppInput v-model="target.title" label="Title" required />
    <AppSelect v-model="target.measurementMethod" label="Measurement Method" :options="MEASUREMENTS" />
    <AppInput v-if="usesTrials()" :model-value="String(target.expectedTrialCount ?? '')" label="Expected Trials" type="number" @update:model-value="target.expectedTrialCount = Number($event)" />
    <AppSelect v-model="target.phase" label="Phase" :options="PHASES" />
    <AppSelect v-model="target.status" label="Status" :options="STATUSES" />
    <AppInput v-model="target.startedOn" label="Start Date" type="date" />
    <AppInput v-model="target.reviewOn" label="Review Date" type="date" />
  </div>
  <div class="form-stack">
    <AppTextarea v-model="target.operationalDefinition" label="Operational Definition" :rows="2" />
    <AppTextarea v-model="target.teachingInstructions" label="Teaching Instructions" :rows="2" />
    <AppTextarea v-model="target.promptHierarchy" label="Prompt Hierarchy" :rows="2" />
    <AppTextarea v-model="target.baselineNote" label="Baseline Note" :rows="2" />
    <AppTextarea v-model="target.masteryCriteria" label="Mastery Criteria" :rows="2" />
    <AppTextarea v-model="target.clinicalNotes" label="Clinical Notes" :rows="2" />
    <AppInput v-if="existing" v-model="target.changeReason" label="Reason for a clinical change" />
  </div>
  <div class="section-actions">
    <AppButton type="button" variant="secondary" @click="emit('cancel')">Cancel</AppButton>
    <AppButton type="button" @click="save">Save target</AppButton>
  </div>
</template>

<style scoped>
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px 20px;
}

.form-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.section-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 8px;
}

@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
    gap: 14px;
  }
}
</style>
