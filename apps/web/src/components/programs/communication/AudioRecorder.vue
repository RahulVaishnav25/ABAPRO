<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { MAX_ATTACHMENT_BYTES } from '@abapro/shared';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import FieldError from '@/components/ui/FieldError.vue';

const props = defineProps<{ saving: boolean }>();
const emit = defineEmits<{ save: [recording: Blob, fileName: string] }>();

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

const clock = computed(() => `${Math.floor(seconds.value / 60)}:${String(seconds.value % 60).padStart(2, '0')}`);

function defaultName(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `Recording ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}.${pad(now.getMinutes())}`;
}

async function start(): Promise<void> {
  error.value = '';
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    error.value = 'Allow microphone access in the browser to record.';
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
      error.value = 'That recording is larger than 10 MB. Record a shorter one.';
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
  <div class="recorder">
    <div class="recorder-head">
      <div>
        <strong class="recorder-title">Record audio</strong>
        <p class="recorder-hint">Record a voice note or session audio, then listen back before saving it.</p>
      </div>
      <template v-if="supported">
        <AppButton v-if="state === 'idle'" variant="secondary" @click="start">
          <span class="rec-dot" aria-hidden="true"></span> Start recording
        </AppButton>
        <AppButton v-else-if="state === 'recording'" variant="danger" @click="stop">Stop · {{ clock }}</AppButton>
      </template>
    </div>
    <p v-if="!supported" class="recorder-hint">This browser cannot record audio. Upload an audio file instead.</p>
    <p v-if="state === 'recording'" class="recorder-live" aria-live="polite">
      <span class="rec-dot is-live" aria-hidden="true"></span> Recording… {{ clock }} of 10:00
    </p>
    <div v-if="state === 'recorded'" class="recorder-review">
      <audio controls :src="previewUrl" class="recorder-player"></audio>
      <AppInput v-model="name" label="Recording name" />
      <div class="recorder-actions">
        <AppButton variant="secondary" :disabled="props.saving" @click="discard">Discard</AppButton>
        <AppButton :loading="props.saving" @click="save">Save recording</AppButton>
      </div>
    </div>
    <FieldError :message="error" />
  </div>
</template>

<style scoped>
.recorder {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 10px);
  background: var(--color-surface);
}

.recorder-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
}

.recorder-title {
  color: var(--color-ink);
}

.recorder-hint {
  margin: 2px 0 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.recorder-live {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-weight: 600;
  color: #b42318;
}

.rec-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #b42318;
}

.rec-dot.is-live {
  animation: pulse 1s ease-in-out infinite;
}

.recorder-review {
  display: grid;
  gap: 10px;
}

.recorder-player {
  width: 100%;
}

.recorder-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@keyframes pulse {
  50% {
    opacity: 0.3;
  }
}

@media (prefers-reduced-motion: reduce) {
  .rec-dot.is-live {
    animation: none;
  }
}
</style>
