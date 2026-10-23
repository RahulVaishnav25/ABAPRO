<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { classifySubmission, type ClientDirectoryItem, type CollectedObservation, type SaveDisposition, type SessionTargetOption, type TherapySessionDetail } from '@abapro/shared';
import { clientDirectoryRequest } from '@/api/clients';
import { ApiError } from '@/api/client';
import {
  addSessionTrialRequest,
  completeSessionRequest,
  interruptSessionRequest,
  recordSessionObservationRequest,
  resumeSessionRequest,
  sessionRequest,
  sessionsRequest,
  startSessionRequest,
  submissionKey,
  undoSessionTrialRequest,
  voidSessionObservationRequest,
  type ObservationPayload,
} from '@/api/sessions';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppTextarea from '@/components/ui/AppTextarea.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { enqueueSubmission, readQueue, removeQueuedSubmission, type QueuedSubmission } from '@/lib/session-queue';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const loading = ref(true);
const error = ref('');
const clients = ref<ClientDirectoryItem[]>([]);
const clientId = ref('');
const openList = ref<Array<{ id: string; startedAt: string; interruptedAt: string | null }>>([]);
const session = ref<TherapySessionDetail | null>(null);
const targetId = ref('');
const setting = ref('Clinic');
const location = ref('');
const note = ref('');
const observationNote = ref('');
const saveState = ref<SaveDisposition | 'saving' | 'idle'>('idle');
const saveMessage = ref('');
const conflicts = ref<string[]>([]);
const queued = ref<QueuedSubmission[]>([]);
const frequencyCount = ref('0');
const windowStart = ref('');
const windowEnd = ref('');
const durationValue = ref('');
const durationUnit = ref<'seconds' | 'minutes'>('seconds');
const timerStart = ref('');
const antecedent = ref('');
const behavior = ref('');
const consequence = ref('');
const contextNote = ref('');
const abcTime = ref('');
const undoReason = ref('');
const promptLevel = ref('');

const sessionId = computed(() => (typeof route.params.sessionId === 'string' ? route.params.sessionId : ''));
const target = computed(() => session.value?.targets.find((item) => item.id === targetId.value) ?? null);
const draft = computed(() => session.value?.observations.find((item) => item.targetId === targetId.value && item.status === 'draft' && (item.measurementMethod === 'trial' || item.measurementMethod === 'probe')));
const activeTrials = computed(() => (draft.value?.trials ?? []).filter((trial) => !trial.voidedAt));
const nextTrial = computed(() => activeTrials.value.length + 1);
const promptLevels = computed(() => (target.value?.promptHierarchy ?? '').split(',').map((item) => item.trim()).filter(Boolean));
const saveLabel = computed(() => ({
  idle: 'Ready',
  saving: 'Saving',
  saved: 'Saved',
  failed: 'Failed',
  queued: 'Queued',
  conflict: 'Needs review',
}[saveState.value]));

watch(sessionId, (id) => {
  if (id) void loadSession(id).catch((loadError: unknown) => {
    error.value = loadError instanceof Error ? loadError.message : 'The session could not be loaded.';
  });
});

watch(targetId, () => {
  promptLevel.value = promptLevels.value[0] ?? '';
  abcTime.value = new Date().toISOString().slice(0, 16);
});

async function loadClients(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    clients.value = (await clientDirectoryRequest({ pageSize: 50, status: 'active' })).items;
    if (typeof route.query.clientId === 'string') clientId.value = route.query.clientId;
    if (sessionId.value) await loadSession(sessionId.value);
    else if (clientId.value) await loadOpen();
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'Sessions could not be loaded.';
  } finally {
    loading.value = false;
  }
}

async function loadOpen(): Promise<void> {
  if (!clientId.value) return;
  const rows = await sessionsRequest(clientId.value, 'in_progress');
  openList.value = rows.map((item) => ({ id: item.id, startedAt: item.startedAt, interruptedAt: item.interruptedAt }));
}

async function loadSession(id: string): Promise<void> {
  session.value = await sessionRequest(id);
  clientId.value = session.value.clientId;
  if (!targetId.value) targetId.value = session.value.targets[0]?.id ?? '';
}

async function start(): Promise<void> {
  const saved = await submitDetail(() => startSessionRequest({
    clientId: clientId.value,
    therapistId: auth.user?.id,
    setting: setting.value,
    location: location.value,
    note: note.value,
  }));
  if (saved) await router.push(`/sessions/${saved.id}`);
}

async function submitDetail(action: () => Promise<TherapySessionDetail>): Promise<TherapySessionDetail | null> {
  saveState.value = 'saving';
  saveMessage.value = '';
  try {
    const detail = await action();
    session.value = detail;
    saveState.value = 'saved';
    return detail;
  } catch (submitError) {
    applyFailure(submitError, null);
    return null;
  }
}

async function submitObservation(body: ObservationPayload, label: string): Promise<boolean> {
  if (!session.value) return false;
  return send(`/sessions/${session.value.id}/observations`, body, label, () => recordSessionObservationRequest(session.value!.id, body));
}

async function send(path: string, body: unknown, label: string, action: () => Promise<CollectedObservation>): Promise<boolean> {
  saveState.value = 'saving';
  saveMessage.value = '';
  try {
    const saved = await action();
    replaceObservation(saved);
    saveState.value = 'saved';
    return true;
  } catch (submitError) {
    const status = submitError instanceof ApiError ? submitError.status : null;
    const disposition = classifySubmission(status === 0 ? null : status);
    saveMessage.value = submitError instanceof Error ? submitError.message : 'The observation was not saved.';
    if (disposition === 'queued') {
      const id = submissionKey();
      enqueueSubmission({ id, path, body, label });
      queued.value = readQueue();
    }
    if (disposition === 'conflict') conflicts.value.push(saveMessage.value);
    saveState.value = disposition;
    return false;
  }
}

function applyFailure(submitError: unknown, body: unknown): void {
  const status = submitError instanceof ApiError ? submitError.status : null;
  saveState.value = classifySubmission(status === 0 ? null : status);
  saveMessage.value = submitError instanceof Error ? submitError.message : 'The session was not saved.';
  if (saveState.value === 'queued' && body) {
    enqueueSubmission({ id: submissionKey(), path: '/sessions', body, label: 'Session' });
    queued.value = readQueue();
  }
  if (saveState.value === 'conflict') conflicts.value.push(saveMessage.value);
}

function replaceObservation(saved: CollectedObservation): void {
  if (!session.value) return;
  const rest = session.value.observations.filter((item) => item.id !== saved.id && item.id !== saved.amendedFromId);
  session.value = { ...session.value, observations: [...rest, saved] };
  session.value.summary = {
    ...session.value.summary,
    canComplete: !session.value.observations.some((item) => item.status === 'draft'),
  };
}

async function recordTrial(result: 'correct' | 'incorrect' | 'prompted' | 'no_response', level?: string): Promise<void> {
  if (!session.value || !target.value) return;
  if (saveState.value === 'queued') return;
  const trial = { idempotencyKey: submissionKey(), trialNumber: nextTrial.value, result, promptLevel: level || (result === 'prompted' ? promptLevel.value : undefined) };
  if (draft.value) {
    const saved = await send(
      `/sessions/${session.value.id}/observations/${draft.value.id}/trials`,
      trial,
      `Trial ${trial.trialNumber}`,
      () => addSessionTrialRequest(session.value!.id, draft.value!.id, trial),
    );
    if (saved) await refresh();
    return;
  }
  const saved = await submitObservation({
    idempotencyKey: submissionKey(),
    targetId: target.value.id,
    note: observationNote.value || undefined,
    trials: [trial],
  }, `Trial ${trial.trialNumber}`);
  if (saved) await refresh();
}

async function undo(): Promise<void> {
  const last = activeTrials.value[activeTrials.value.length - 1];
  if (!session.value || !draft.value || !last) return;
  const saved = await send(
    `/sessions/${session.value.id}/observations/${draft.value.id}/trials/${last.id}/undo`,
    { reason: undoReason.value },
    'Undo trial',
    () => undoSessionTrialRequest(session.value!.id, draft.value!.id, last.id, undoReason.value),
  );
  if (saved) {
    undoReason.value = '';
    await refresh();
  }
}

async function recordFrequency(mode: 'event' | 'window'): Promise<void> {
  if (!target.value) return;
  const now = new Date().toISOString();
  await submitObservation({
    idempotencyKey: submissionKey(),
    targetId: target.value.id,
    note: observationNote.value || undefined,
    frequencyCount: mode === 'event' ? 1 : Number(frequencyCount.value),
    occurredAt: mode === 'event' ? now : undefined,
    windowStartedAt: mode === 'window' ? new Date(windowStart.value).toISOString() : undefined,
    windowEndedAt: mode === 'window' ? new Date(windowEnd.value).toISOString() : undefined,
  }, mode === 'event' ? 'Frequency event' : 'Frequency count');
  if (saveState.value === 'saved') await refresh();
}

async function recordDuration(mode: 'timer' | 'entered'): Promise<void> {
  if (!target.value) return;
  await submitObservation({
    idempotencyKey: submissionKey(),
    targetId: target.value.id,
    note: observationNote.value || undefined,
    startedAt: mode === 'timer' ? timerStart.value : undefined,
    endedAt: mode === 'timer' ? new Date().toISOString() : undefined,
    durationSeconds: mode === 'entered' ? Number(durationValue.value) : undefined,
    durationUnit: mode === 'entered' ? durationUnit.value : undefined,
  }, 'Duration');
  if (saveState.value === 'saved') {
    timerStart.value = '';
    await refresh();
  }
}

async function recordAbc(): Promise<void> {
  if (!target.value) return;
  await submitObservation({
    idempotencyKey: submissionKey(),
    targetId: target.value.id,
    antecedent: antecedent.value,
    behaviorNote: behavior.value,
    consequence: consequence.value,
    contextNote: contextNote.value || undefined,
    occurredAt: abcTime.value ? new Date(abcTime.value).toISOString() : undefined,
    note: observationNote.value || undefined,
  }, 'ABC');
  if (saveState.value === 'saved') {
    antecedent.value = '';
    behavior.value = '';
    consequence.value = '';
    contextNote.value = '';
    await refresh();
  }
}

async function refresh(): Promise<void> {
  if (!session.value) return;
  session.value = await sessionRequest(session.value.id);
}

async function interrupt(): Promise<void> {
  if (!session.value) return;
  await submitDetail(() => interruptSessionRequest(session.value!.id));
}

async function resume(): Promise<void> {
  if (!session.value) return;
  await submitDetail(() => resumeSessionRequest(session.value!.id));
}

async function complete(): Promise<void> {
  if (!session.value) return;
  await submitDetail(() => completeSessionRequest(session.value!.id, session.value!.note));
}

async function removeObservation(observation: CollectedObservation): Promise<void> {
  if (!session.value) return;
  const saved = await send(
    `/sessions/${session.value.id}/observations/${observation.id}/void`,
    { reason: undoReason.value },
    'Remove observation',
    () => voidSessionObservationRequest(session.value!.id, observation.id, undoReason.value),
  );
  if (saved) await refresh();
}

async function syncQueue(): Promise<void> {
  const pending = readQueue();
  queued.value = pending;
  for (const item of pending) {
    try {
      const response = await fetch(`/api/v1${item.path}`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(item.body),
      });
      const disposition = classifySubmission(response.ok ? response.status : response.status);
      if (disposition === 'saved') removeQueuedSubmission(item.id);
      else if (disposition === 'conflict' || disposition === 'failed') {
        removeQueuedSubmission(item.id);
        const payload = await response.json().catch(() => ({ message: 'Saved data needs review.' }));
        conflicts.value.push(typeof payload.message === 'string' ? payload.message : 'A queued observation needs review.');
      }
    } catch {
      break;
    }
  }
  queued.value = readQueue();
  if (session.value) await refresh().catch(() => undefined);
}

function selectTarget(item: SessionTargetOption): void {
  targetId.value = item.id;
}

onMounted(() => {
  queued.value = readQueue();
  void loadClients().then(() => syncQueue());
  window.addEventListener('online', syncQueue);
});
onUnmounted(() => window.removeEventListener('online', syncQueue));
</script>

<template>
  <PageContainer>
    <PageHeader title="Session" description="Record data for the target in front of you. A response is saved only after the server accepts it." />
    <SkeletonBlock v-if="loading" height="240px" />
    <ErrorState v-else-if="error" title="Session unavailable" :description="error" @retry="loadClients" />
    <template v-else>
      <p class="save" role="status" :data-state="saveState">{{ saveLabel }}<span v-if="saveMessage"> · {{ saveMessage }}</span></p>
      <p v-for="conflict in conflicts" :key="conflict" class="conflict" role="alert">{{ conflict }}</p>
      <p v-if="queued.length" class="queued">{{ queued.length }} observation{{ queued.length === 1 ? '' : 's' }} queued until the connection returns.</p>

      <section v-if="!session" class="panel stack">
        <AppSelect v-model="clientId" label="Client" :options="clients.map((client) => ({ value: client.id, label: `${client.displayName} (${client.clientCode})` }))" @update:model-value="loadOpen" />
        <article v-for="item in openList" :key="item.id">
          <p>Open session {{ item.interruptedAt ? '· interrupted' : '' }}</p>
          <AppButton type="button" @click="router.push(`/sessions/${item.id}`)">Resume</AppButton>
        </article>
        <div class="grid">
          <AppSelect v-model="setting" label="Setting" :options="['Clinic', 'Home', 'School', 'Community', 'Telehealth'].map((item) => ({ value: item, label: item }))" />
          <AppInput v-model="location" label="Location" />
        </div>
        <AppTextarea v-model="note" label="Session note" :rows="2" />
        <AppButton v-if="auth.can('observations.record')" type="button" :disabled="!clientId" @click="start">Start session</AppButton>
      </section>

      <template v-else>
        <section class="panel stack">
          <div class="heading">
            <div>
              <h2>{{ session.clientName }}</h2>
              <p>{{ session.therapistName || 'No therapist' }} · {{ session.setting || 'No setting' }} · {{ session.location || 'No location' }}</p>
            </div>
            <StatusBadge :tone="session.status === 'in_progress' ? 'success' : 'neutral'" :label="session.status" />
          </div>
          <p v-if="session.interruptedAt">This session was interrupted. Resume it to keep the same observations.</p>
          <div class="actions">
            <AppButton v-if="session.status === 'in_progress' && session.interruptedAt" type="button" @click="resume">Resume</AppButton>
            <AppButton v-if="session.status === 'in_progress' && !session.interruptedAt" type="button" variant="secondary" @click="interrupt">Mark interrupted</AppButton>
          </div>
        </section>

        <section class="panel stack">
          <h2>Targets</h2>
          <div class="targets">
            <button v-for="item in session.targets" :key="item.id" type="button" class="target" :aria-pressed="item.id === targetId" @click="selectTarget(item)">
              <strong>{{ item.title }}</strong>
              <span>{{ item.programTitle }} · {{ item.phase }} · {{ item.measurementMethod }}</span>
            </button>
          </div>
          <EmptyState v-if="session.targets.length === 0" title="No active targets" description="Active programs and targets for this client appear here." />
        </section>

        <section v-if="target && session.status === 'in_progress' && !session.interruptedAt" class="panel stack">
          <h2>{{ target.title }}</h2>
          <p>{{ target.measurementMethod === 'probe' ? 'Probe data is stored separately from teaching trials.' : target.measurementMethod === 'trial' ? 'Teaching trials' : target.measurementMethod }}</p>
          <p>{{ target.operationalDefinition || 'No operational definition recorded.' }}</p>
          <p>{{ target.teachingInstructions || 'No teaching instructions recorded.' }}</p>
          <p>Phase: {{ target.phase }}</p>

          <template v-if="target.measurementMethod === 'trial' || target.measurementMethod === 'probe'">
            <p class="progress">Trial {{ Math.min(nextTrial, target.expectedTrialCount || nextTrial) }} of {{ target.expectedTrialCount }}</p>
            <div class="responses">
              <button type="button" class="response" @click="recordTrial('correct')">Correct</button>
              <button type="button" class="response" @click="recordTrial('incorrect')">Incorrect</button>
              <button type="button" class="response" @click="recordTrial('no_response')">No response</button>
              <button v-if="promptLevels.length === 0" type="button" class="response" @click="recordTrial('prompted')">Prompted</button>
              <button v-for="level in promptLevels" :key="level" type="button" class="response" @click="recordTrial('prompted', level)">{{ level }}</button>
            </div>
            <AppTextarea v-model="observationNote" label="Note" :rows="2" />
            <AppInput v-model="undoReason" label="Reason to undo the last trial" hint="At least 12 characters. The removed trial stays in the audit history." />
            <AppButton type="button" variant="secondary" :disabled="activeTrials.length === 0 || undoReason.trim().length < 12" @click="undo">Undo last trial</AppButton>
          </template>

          <template v-else-if="target.measurementMethod === 'frequency'">
            <AppButton type="button" class="response" @click="recordFrequency('event')">Record event</AppButton>
            <div class="grid">
              <AppInput v-model="frequencyCount" label="Count" type="number" />
              <AppInput v-model="windowStart" label="Window start" type="datetime-local" />
              <AppInput v-model="windowEnd" label="Window end" type="datetime-local" />
            </div>
            <AppButton type="button" variant="secondary" @click="recordFrequency('window')">Save count for this window</AppButton>
          </template>

          <template v-else-if="target.measurementMethod === 'duration'">
            <AppButton v-if="!timerStart" type="button" @click="timerStart = new Date().toISOString()">Start duration</AppButton>
            <AppButton v-else type="button" @click="recordDuration('timer')">Stop and save</AppButton>
            <div class="grid">
              <AppInput v-model="durationValue" label="Entered duration" type="number" />
              <AppSelect v-model="durationUnit" label="Unit" :options="[{ value: 'seconds', label: 'Seconds' }, { value: 'minutes', label: 'Minutes' }]" />
            </div>
            <AppButton type="button" variant="secondary" @click="recordDuration('entered')">Save entered duration</AppButton>
          </template>

          <template v-else>
            <p>Record what happened before, during, and after the behavior. This form does not infer its function.</p>
            <AppTextarea v-model="antecedent" label="Antecedent" :rows="2" />
            <AppTextarea v-model="behavior" label="Behavior" :rows="2" />
            <AppTextarea v-model="consequence" label="Consequence" :rows="2" />
            <AppInput v-model="abcTime" label="Timestamp" type="datetime-local" />
            <AppTextarea v-model="contextNote" label="Context" :rows="2" />
            <AppButton type="button" @click="recordAbc">Save ABC observation</AppButton>
          </template>
        </section>

        <section class="panel stack">
          <h2>Collected data</h2>
          <p>{{ session.summary.observationCount }} recorded observations across {{ session.summary.recordedTargetCount }} targets.</p>
          <p v-if="session.summary.incomplete.length">Incomplete trial sets: {{ session.summary.incomplete.map((item) => `${item.targetTitle} ${item.recordedTrials} of ${item.expectedTrials}`).join(', ') }}</p>
          <article v-for="item in session.observations" :key="item.id">
            <strong>{{ item.targetTitle }}</strong> · {{ item.measurementMethod }} · {{ item.status }}
            <p v-if="item.trials.length">{{ item.trials.filter((trial) => !trial.voidedAt).map((trial) => `${trial.trialNumber}:${trial.result}${trial.promptLevel ? ` (${trial.promptLevel})` : ''}`).join(', ') }}</p>
            <p v-if="item.frequencyCount != null">Count {{ item.frequencyCount }}<template v-if="item.ratePerMinute != null"> · {{ item.ratePerMinute }} per minute</template></p>
            <p v-if="item.durationSeconds != null">{{ item.durationSeconds }} seconds</p>
            <p v-if="item.antecedent">{{ item.antecedent }} → {{ item.behaviorNote }} → {{ item.consequence }}</p>
            <AppButton v-if="session.status === 'in_progress' && item.status !== 'voided' && item.status !== 'amended'" type="button" variant="secondary" :disabled="undoReason.trim().length < 12" @click="removeObservation(item)">Remove</AppButton>
          </article>
          <AppButton v-if="auth.can('observations.record') && session.status === 'in_progress'" type="button" :disabled="!session.summary.canComplete" @click="complete">Complete session</AppButton>
          <p v-if="!session.summary.canComplete">Finish the open trial set before completing. Targets you did not run can stay blank.</p>
        </section>
      </template>
    </template>
  </PageContainer>
</template>

<style scoped>
.stack { display: grid; gap: 12px; }
.grid, .heading, .actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.targets, .responses { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.target, .response { min-height: 72px; padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); text-align: left; cursor: pointer; }
.target strong, .target span { display: block; }
.target span { color: var(--color-text-muted); font-size: 0.9rem; }
.target[aria-pressed='true'] { border-color: var(--color-primary); }
.response { font-size: 1.05rem; font-weight: 650; }
.save[data-state='saved'] { color: var(--color-primary); }
.save[data-state='failed'], .conflict { color: var(--color-danger); }
.queued { color: var(--color-text-muted); }
.progress { font-size: 1.15rem; font-weight: 650; }
h2 { margin: 0; }
</style>
