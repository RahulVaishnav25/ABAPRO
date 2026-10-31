<script setup lang="ts">
import { ref } from 'vue';
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
      <div class="upload-card">
        <FileUpload
          v-model="files"
          label="Upload a file"
          hint="PDF, Word, Excel, PowerPoint, text, CSV, images or audio, up to 10 MB."
          :accept="ACCEPT"
          :max-size-mb="10"
          :disabled="uploading"
        />
        <UploadProgress :progress="progress" />
        <div class="upload-actions">
          <AppButton :disabled="files.length === 0" :loading="uploading" @click="uploadFile">Upload</AppButton>
        </div>
      </div>
      <AudioRecorder ref="recorder" :saving="uploading" @save="saveRecording" />
    </div>
    <p v-else-if="data.canWrite" class="panel-hint">Your role cannot upload files. An administrator can allow it under Upload documents.</p>

    <EmptyState
      v-if="data.attachments.length === 0"
      title="No attachments yet"
      :description="data.canUpload ? 'Upload a document or record audio above.' : 'Files shared by the care team appear here.'"
    />
    <AttachmentList v-else :program-id="data.programId" :attachments="data.attachments" />
  </div>
</template>

<style scoped>
.panel-stack {
  display: grid;
  gap: 14px;
}

.upload-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
  align-items: start;
}

.upload-card {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 10px);
  background: var(--color-surface);
}

.upload-actions {
  display: flex;
  justify-content: flex-end;
}

.panel-hint {
  margin: 0;
  font-size: 0.88rem;
  color: var(--color-text-muted);
}
</style>
