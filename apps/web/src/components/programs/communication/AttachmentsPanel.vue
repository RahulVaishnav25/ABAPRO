<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ATTACHMENT_TYPES, type ProgramCommunication } from '@abapro/shared';
import AppButton from '@/components/ui/AppButton.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import FileUpload from '@/components/ui/FileUpload.vue';
import AttachmentList from './AttachmentList.vue';
import AudioRecorder from './AudioRecorder.vue';
import UploadProgress from './UploadProgress.vue';
import { useUpload } from './useUpload';

const ACCEPT = [...Object.keys(ATTACHMENT_TYPES), '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.txt', '.mp3', '.m4a', '.wav', '.webm', '.ogg'].join(',');

const props = defineProps<{ data: ProgramCommunication }>();
const emit = defineEmits<{ updated: [data: ProgramCommunication] }>();

const { t } = useI18n();
const files = ref<File[]>([]);
const recorder = ref<InstanceType<typeof AudioRecorder> | null>(null);
const { progress, uploading, upload } = useUpload(() => props.data.programId, (data) => emit('updated', data));

async function uploadFile(): Promise<void> {
  const file = files.value[0];
  if (!file) return;
  if (await upload(file, file.name)) files.value = [];
}

async function saveRecording(recording: Blob, fileName: string): Promise<void> {
  if (await upload(recording, fileName)) recorder.value?.reset();
}
</script>

<template>
  <div class="panel-stack">
    <div v-if="data.canUpload" class="upload-grid">
      <section class="upload-card">
        <h3 class="upload-title">{{ t('comms.attachments.uploadTitle') }}</h3>
        <FileUpload
          v-model="files"
          :label="t('comms.attachments.uploadTitle')"
          :hint="t('comms.attachments.uploadHint')"
          :accept="ACCEPT"
          :max-size-mb="10"
          :disabled="uploading"
          class="upload-field"
        />
        <UploadProgress :progress="progress" />
        <div class="upload-actions">
          <AppButton icon="upload" :disabled="files.length === 0" :loading="uploading" @click="uploadFile">{{ t('comms.attachments.upload') }}</AppButton>
        </div>
      </section>
      <AudioRecorder ref="recorder" :saving="uploading" @save="saveRecording" />
    </div>
    <p v-else-if="data.canWrite" class="panel-hint">{{ t('comms.attachments.noUpload') }}</p>

    <EmptyState
      v-if="data.attachments.length === 0"
      icon="file"
      :title="t('comms.attachments.empty')"
      :description="data.canUpload ? t('comms.attachments.emptyUploader') : t('comms.attachments.emptyReader')"
    />
    <AttachmentList v-else :program-id="data.programId" :attachments="data.attachments" />
  </div>
</template>

<style scoped>
.panel-stack {
  display: grid;
  gap: var(--space-4);
}

.upload-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-4);
  align-items: stretch;
}

.upload-card {
  display: grid;
  align-content: start;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.upload-title {
  color: var(--color-ink);
  font-size: var(--text-base);
  font-weight: 600;
}

/* The card heading names the zone, so its own label is only for screen readers. */
.upload-field :deep(> .field-label) {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.upload-actions {
  display: flex;
  justify-content: flex-end;
}

.panel-hint {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
</style>
