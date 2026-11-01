<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { MAX_ATTACHMENT_BYTES } from '@abapro/shared';
import AppIcon from '@/components/navigation/AppIcon.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import FieldError from '@/components/ui/FieldError.vue';

const props = defineProps<{ saving: boolean }>();
const emit = defineEmits<{ save: [recording: Blob, fileName: string] }>();
const { t } = useI18n();

/** Recordings stop on their own at this length, which keeps them well under the upload limit. */
const MAX_SECONDS = 10 * 60;
// The first type the browser can record that the API accepts.
const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
const EXTENSIONS: Record<string, string> = { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg' };

const supported = typeof window !== 'undefined' && 'MediaRecorder' in window && Boolean(navigator.mediaDevices?.getUserMedia);
const state = ref<'idle' | 'recording' | 'recorded'>('idle');
const seconds = ref(0);
const error = ref('');
const name = ref('');
const recording = ref<Blob | null>(null);
const previewUrl = ref('');

let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let timer: number | undefined;

const clockOf = (total: number) => `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
const clock = computed(() => clockOf(seconds.value));
const maxClock = clockOf(MAX_SECONDS);

function defaultName(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return t('comms.recorder.defaultName', {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}.${pad(now.getMinutes())}`,
  });
}

async function start(): Promise<void> {
  error.value = '';
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    error.value = t('comms.recorder.micDenied');
    return;
  }
  const mimeType = TYPES.find((type) => MediaRecorder.isTypeSupported(type));
  recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: recorder?.mimeType || mimeType || 'audio/webm' });
    releaseMicrophone();
    if (blob.size > MAX_ATTACHMENT_BYTES) {
      error.value = t('comms.recorder.tooLarge');
      state.value = 'idle';
      return;
    }
    recording.value = blob;
    previewUrl.value = URL.createObjectURL(blob);
    name.value = defaultName();
    state.value = 'recorded';
  };
  recorder.start(1000);
  seconds.value = 0;
  state.value = 'recording';
  timer = window.setInterval(() => {
    seconds.value += 1;
    if (seconds.value >= MAX_SECONDS) stop();
  }, 1000);
}

function stop(): void {
  window.clearInterval(timer);
  if (recorder?.state === 'recording') recorder.stop();
}

function releaseMicrophone(): void {
  for (const track of stream?.getTracks() ?? []) track.stop();
  stream = null;
}

function discard(): void {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = '';
  recording.value = null;
  state.value = 'idle';
}

function save(): void {
  if (!recording.value) return;
  const base = recording.value.type.split(';')[0] ?? 'audio/webm';
  const title = name.value.trim().replace(/[\\/]/g, '-') || defaultName();
  emit('save', recording.value, `${title}.${EXTENSIONS[base] ?? 'webm'}`);
}

/** Called by the parent once the upload has finished. */
defineExpose({ reset: discard });

onBeforeUnmount(() => {
  window.clearInterval(timer);
  if (recorder?.state === 'recording') recorder.stop();
  releaseMicrophone();
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
});
</script>

<template>
  <section class="recorder" :class="`is-${state}`">
    <h3 class="recorder-title">{{ t('comms.recorder.title') }}</h3>
    <p class="recorder-hint">{{ supported ? t('comms.recorder.hint') : t('comms.recorder.unsupported') }}</p>

    <!-- Ready to record -->
    <div v-if="supported && state === 'idle'" class="recorder-stage">
      <button type="button" class="record-button" @click="start">
        <span class="record-button-icon" aria-hidden="true"><AppIcon name="mic" :size="24" /></span>
        <span>{{ t('comms.recorder.start') }}</span>
      </button>
      <span class="recorder-limit">{{ t('comms.recorder.limit', { max: maxClock }) }}</span>
    </div>

    <!-- Recording -->
    <div v-else-if="state === 'recording'" class="recorder-stage">
      <p class="recorder-live" aria-live="polite">
        <span class="rec-dot" aria-hidden="true"></span>
        {{ t('comms.recorder.recording') }}
        <span class="recorder-clock">{{ clock }}</span>
        <span class="recorder-limit">{{ t('comms.recorder.limit', { max: maxClock }) }}</span>
      </p>
      <div class="recorder-track" aria-hidden="true">
        <span class="recorder-fill" :style="{ inlineSize: `${(seconds / MAX_SECONDS) * 100}%` }"></span>
      </div>
      <AppButton variant="danger" @click="stop">
        <span class="stop-square" aria-hidden="true"></span>
        {{ t('comms.recorder.stop') }} · {{ clock }}
      </AppButton>
    </div>

    <!-- Listen back, name and save -->
    <div v-else-if="state === 'recorded'" class="recorder-review">
      <p class="recorder-ready"><AppIcon name="check" :size="16" />{{ t('comms.recorder.ready') }}</p>
      <audio controls :src="previewUrl" class="recorder-player"></audio>
      <AppInput v-model="name" :label="t('comms.recorder.name')" />
      <div class="recorder-actions">
        <AppButton variant="ghost" :disabled="props.saving" @click="discard">{{ t('comms.recorder.discard') }}</AppButton>
        <AppButton icon="upload" :loading="props.saving" @click="save">{{ t('comms.recorder.save') }}</AppButton>
      </div>
    </div>
    <FieldError :message="error" />
  </section>
</template>

<style scoped>
.recorder {
  display: grid;
  align-content: start;
  gap: var(--space-2);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.recorder.is-recording {
  border-color: #f1b3ad;
  background: #fffafa;
}

.recorder-title {
  color: var(--color-ink);
  font-size: var(--text-base);
  font-weight: 600;
}

.recorder-hint {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.recorder-stage {
  display: grid;
  justify-items: center;
  gap: var(--space-3);
  padding: var(--space-4) 0 var(--space-2);
}

.record-button {
  display: grid;
  justify-items: center;
  gap: var(--space-2);
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-ink);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
}

.record-button-icon {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: #b42318;
  color: #ffffff;
  box-shadow: 0 0 0 6px #fdecea;
  transition: transform 0.12s ease, box-shadow var(--transition);
}

.record-button:hover .record-button-icon {
  box-shadow: 0 0 0 9px #fdecea;
}

.record-button:active .record-button-icon {
  transform: scale(0.96);
}

.record-button:focus-visible {
  outline: none;
}

.record-button:focus-visible .record-button-icon {
  box-shadow: 0 0 0 6px #fdecea, var(--focus);
}

.recorder-limit {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-weight: 500;
}

.recorder-live {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 4px var(--space-2);
  color: #b42318;
  font-weight: 600;
}

.recorder-clock {
  font-size: var(--text-lg);
  font-variant-numeric: tabular-nums;
}

.recorder-track {
  width: 100%;
  height: 4px;
  overflow: hidden;
  border-radius: var(--radius-full);
  background: #fbd9d5;
}

.recorder-fill {
  display: block;
  block-size: 100%;
  background: #b42318;
  transition: inline-size 1s linear;
}

.rec-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #b42318;
  animation: pulse 1s ease-in-out infinite;
}

.stop-square {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: currentColor;
}

.recorder-review {
  display: grid;
  gap: var(--space-3);
  padding-top: var(--space-2);
}

.recorder-ready {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--color-success);
  font-size: var(--text-sm);
  font-weight: 600;
}

.recorder-player {
  width: 100%;
}

.recorder-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

@keyframes pulse {
  50% {
    opacity: 0.3;
  }
}

@media (prefers-reduced-motion: reduce) {
  .rec-dot {
    animation: none;
  }

  .recorder-fill {
    transition: none;
  }
}
</style>
