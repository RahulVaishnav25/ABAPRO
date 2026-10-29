<script setup lang="ts">
import { ref } from 'vue';
import type { TargetSummary, TrialResult } from '@abapro/shared';
import { ApiError } from '@/api/client';
import { recordObservationRequest } from '@/api/programs';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTextarea from '@/components/ui/AppTextarea.vue';
import { useToastStore } from '@/stores/toast';

const props = defineProps<{ programId: string; target: TargetSummary }>();
const emit = defineEmits<{ recorded: []; cancel: [] }>();

const RESULTS: Array<{ value: TrialResult; label: string }> = [
  { value: 'correct', label: 'Correct' },
  { value: 'incorrect', label: 'Incorrect' },
  { value: 'prompted', label: 'Prompted' },
  { value: 'no_response', label: 'No response' },
];

const toast = useToastStore();
const method = props.target.measurementMethod;
const usesTrials = method === 'trial' || method === 'probe';
const trialCount = props.target.expectedTrialCount ?? 0;
const trials = ref<TrialResult[]>(Array.from({ length: trialCount }, () => 'correct'));
const frequencyCount = ref('');
const durationSeconds = ref('');
const antecedent = ref('');
const behaviorNote = ref('');
const consequence = ref('');
const note = ref('');

async function record(): Promise<void> {
  try {
    const saved = await recordObservationRequest(props.programId, props.target.id, {
      note: note.value || undefined,
      frequencyCount: method === 'frequency' ? Number(frequencyCount.value) : undefined,
      durationSeconds: method === 'duration' ? Number(durationSeconds.value) : undefined,
      antecedent: antecedent.value || undefined,
      behaviorNote: behaviorNote.value || undefined,
      consequence: consequence.value || undefined,
      trials: usesTrials ? trials.value.map((result, index) => ({ trialNumber: index + 1, result })) : undefined,
    });
    toast.push({ tone: 'success', title: 'Observation recorded', message: `Saved with configuration version ${saved.configurationVersion}. Phase and status were not changed.` });
    emit('recorded');
  } catch (recordError) {
    toast.push({ tone: 'danger', title: 'Observation was not recorded', message: recordError instanceof ApiError ? recordError.message : 'Try again.' });
  }
}
</script>

<template>
  <div v-if="usesTrials" class="trials-grid">
    <AppSelect v-for="index in trialCount" :key="index" v-model="trials[index - 1]" :label="`Trial ${index}`" :options="RESULTS" />
  </div>
  <div v-else-if="method === 'frequency'" class="form-grid">
    <AppInput v-model="frequencyCount" label="Count" type="number" />
  </div>
  <div v-else-if="method === 'duration'" class="form-grid">
    <AppInput v-model="durationSeconds" label="Duration in seconds" type="number" />
  </div>
  <div v-else class="form-stack">
    <AppTextarea v-model="antecedent" label="Antecedent" :rows="2" />
    <AppTextarea v-model="behaviorNote" label="Behavior" :rows="2" />
    <AppTextarea v-model="consequence" label="Consequence" :rows="2" />
  </div>
  <AppTextarea v-model="note" label="Observation Note" :rows="2" placeholder="Optional session notes..." />
  <div class="section-actions">
    <AppButton type="button" variant="secondary" @click="emit('cancel')">Cancel</AppButton>
    <AppButton type="button" @click="record">Save observation</AppButton>
  </div>
</template>

<style scoped>
.trials-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 12px;
}

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
