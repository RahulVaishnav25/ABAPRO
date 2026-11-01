<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { attachmentTypeLabel, type ProgramAttachment } from '@abapro/shared';
import { attachmentBlobRequest, formatBytes, saveBlob } from '@/api/communication';
import AppIcon from '@/components/navigation/AppIcon.vue';
import AppButton from '@/components/ui/AppButton.vue';
import { errorMessage } from '@/lib/loader';
import { useToastStore } from '@/stores/toast';
import { formatDateTime } from '@/lib/format';

const props = defineProps<{ programId: string; attachments: ProgramAttachment[]; compact?: boolean }>();
const toast = useToastStore();
const { t, te } = useI18n();

function typeName(attachment: ProgramAttachment): string {
  const label = attachment.kind === 'audio' ? 'Audio' : attachmentTypeLabel(attachment.contentType);
  return te(`comms.attachments.types.${label}`) ? t(`comms.attachments.types.${label}`) : label;
}

/** Icon colour group for a file. */
function family(attachment: ProgramAttachment): string {
  if (attachment.kind === 'audio') return 'audio';
  const type = attachment.contentType;
  if (type.includes('pdf')) return 'pdf';
  if (type.startsWith('image/')) return 'image';
  if (type.includes('sheet') || type.includes('excel') || type.includes('csv')) return 'sheet';
  return 'doc';
}

const busy = ref('');
/** Object URLs of audio loaded for playing, by attachment. */
const players = ref(new Map<string, string>());

async function download(attachment: ProgramAttachment): Promise<void> {
  busy.value = attachment.id;
  try {
    saveBlob(await attachmentBlobRequest(props.programId, attachment), attachment.fileName);
  } catch (downloadError) {
    toast.push({ tone: 'danger', title: t('comms.attachments.downloadFailed'), message: errorMessage(downloadError, t('errors.generic')) });
  } finally {
    busy.value = '';
  }
}

async function play(attachment: ProgramAttachment): Promise<void> {
  if (players.value.has(attachment.id)) return;
  busy.value = attachment.id;
  try {
    const url = URL.createObjectURL(await attachmentBlobRequest(props.programId, attachment));
    players.value = new Map(players.value).set(attachment.id, url);
  } catch (playError) {
    toast.push({ tone: 'danger', title: t('comms.attachments.playFailed'), message: errorMessage(playError, t('errors.generic')) });
  } finally {
    busy.value = '';
  }
}

onBeforeUnmount(() => {
  for (const url of players.value.values()) URL.revokeObjectURL(url);
});

const uploaded = (iso: string) => formatDateTime(iso);
</script>

<template>
  <ul class="attachment-list" :class="{ 'is-compact': compact }">
    <li v-for="attachment in attachments" :key="attachment.id" class="attachment">
      <span class="attachment-icon" :class="`is-${family(attachment)}`" aria-hidden="true">
        <AppIcon :name="attachment.kind === 'audio' ? 'mic' : 'file'" :size="18" />
      </span>
      <div class="attachment-body">
        <strong class="attachment-name" dir="auto">{{ attachment.fileName }}</strong>
        <span class="attachment-meta">
          <span>{{ typeName(attachment) }}</span>
          <span>{{ formatBytes(attachment.byteSize) }}</span>
          <span>{{ uploaded(attachment.uploadedAt) }}</span>
          <span>{{ attachment.uploadedByName }}</span>
        </span>
        <audio v-if="players.get(attachment.id)" class="attachment-player" controls autoplay :src="players.get(attachment.id)"></audio>
      </div>
      <div class="attachment-actions">
        <AppButton
          v-if="attachment.kind === 'audio' && !players.has(attachment.id)"
          size="sm"
          variant="secondary"
          icon="play"
          :loading="busy === attachment.id"
          :aria-label="t('comms.attachments.playName', { name: attachment.fileName })"
          @click="play(attachment)"
        >
          {{ t('comms.attachments.play') }}
        </AppButton>
        <AppButton
          size="sm"
          variant="secondary"
          icon="download"
          :disabled="busy === attachment.id"
          :aria-label="t('comms.attachments.downloadName', { name: attachment.fileName })"
          @click="download(attachment)"
        >
          {{ t('comms.attachments.download') }}
        </AppButton>
      </div>
    </li>
  </ul>
</template>

<style scoped>
.attachment-list {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.attachment {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  transition: border-color var(--transition), box-shadow var(--transition);
}

.attachment:hover {
  border-color: var(--color-border-strong);
  box-shadow: var(--shadow-xs);
}

.is-compact .attachment {
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface-muted);
}

.attachment-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 38px;
  height: 38px;
  border-radius: var(--radius-sm);
  background: var(--color-primary-soft);
  color: var(--color-primary-ink);
}

/* Each kind of file keeps its colour; the name and type below say what it is. */
.attachment-icon.is-pdf {
  background: #fdecea;
  color: #b42318;
}

.attachment-icon.is-sheet {
  background: #e7f6ec;
  color: #1b6b3a;
}

.attachment-icon.is-image {
  background: #eef0fd;
  color: #3a46b3;
}

.attachment-icon.is-audio {
  background: #fdf3e2;
  color: #8a4b05;
}

.attachment-body {
  display: grid;
  flex: 1;
  gap: 2px;
  min-width: 180px;
}

.attachment-name {
  overflow-wrap: anywhere;
  color: var(--color-ink);
  font-weight: 600;
}

.attachment-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 2px var(--space-3);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}

.attachment-player {
  width: 100%;
  max-width: 420px;
  margin-top: 6px;
}

.attachment-actions {
  display: flex;
  gap: 6px;
}
</style>
