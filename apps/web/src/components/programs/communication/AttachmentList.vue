<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { attachmentTypeLabel, type ProgramAttachment } from '@abapro/shared';
import { attachmentBlobRequest, formatBytes, saveBlob } from '@/api/communication';
import AppButton from '@/components/ui/AppButton.vue';
import { errorMessage } from '@/lib/loader';
import { useToastStore } from '@/stores/toast';
import { formatDateTime } from '@/lib/format';

const props = defineProps<{ programId: string; attachments: ProgramAttachment[]; compact?: boolean }>();
const toast = useToastStore();

const busy = ref('');
/** Object URLs of audio loaded for playing, by attachment. */
const players = ref(new Map<string, string>());

async function download(attachment: ProgramAttachment): Promise<void> {
  busy.value = attachment.id;
  try {
    saveBlob(await attachmentBlobRequest(props.programId, attachment), attachment.fileName);
  } catch (downloadError) {
    toast.push({ tone: 'danger', title: 'Download failed', message: errorMessage(downloadError, 'Try again.') });
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
    toast.push({ tone: 'danger', title: 'Recording could not be loaded', message: errorMessage(playError, 'Try again.') });
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
      <span class="attachment-icon" :class="`is-${attachment.kind}`" aria-hidden="true">
        <svg v-if="attachment.kind === 'audio'" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
        <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" />
        </svg>
      </span>
      <div class="attachment-body">
        <strong class="attachment-name">{{ attachment.fileName }}</strong>
        <span class="attachment-meta">
          {{ attachment.kind === 'audio' ? 'Audio' : attachmentTypeLabel(attachment.contentType) }} · {{ formatBytes(attachment.byteSize) }} ·
          {{ uploaded(attachment.uploadedAt) }} · {{ attachment.uploadedByName }}
        </span>
        <audio v-if="players.get(attachment.id)" class="attachment-player" controls autoplay :src="players.get(attachment.id)"></audio>
      </div>
      <div class="attachment-actions">
        <AppButton
          v-if="attachment.kind === 'audio' && !players.has(attachment.id)"
          size="sm"
          variant="secondary"
          :loading="busy === attachment.id"
          :aria-label="`Play ${attachment.fileName}`"
          @click="play(attachment)"
        >
          Play
        </AppButton>
        <AppButton size="sm" variant="secondary" :disabled="busy === attachment.id" :aria-label="`Download ${attachment.fileName}`" @click="download(attachment)">
          Download
        </AppButton>
      </div>
    </li>
  </ul>
</template>

<style scoped>
.attachment-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.attachment {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 10px);
  background: var(--color-surface);
}

.is-compact .attachment {
  padding: 8px 10px;
}

.attachment-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--color-surface-muted);
  color: var(--color-primary);
}

.attachment-icon.is-audio {
  color: #b45309;
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
}

.attachment-meta {
  font-size: 0.82rem;
  color: var(--color-text-muted);
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
