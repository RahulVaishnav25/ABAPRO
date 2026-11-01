import { ref } from 'vue';
import { MAX_ATTACHMENT_BYTES, type ProgramCommunication } from '@abapro/shared';
import { uploadAttachmentRequest } from '@/api/communication';
import { i18n } from '@/i18n';
import { errorMessage } from '@/lib/loader';
import { useToastStore } from '@/stores/toast';

/** One upload at a time, with progress, reporting success or failure in a toast. */
export function useUpload(programId: () => string, onUploaded: (data: ProgramCommunication) => void) {
  const toast = useToastStore();
  const t = i18n.global.t;
  const progress = ref<number | null>(null);
  const uploading = ref(false);

  async function upload(file: Blob, fileName: string, homeActivityId?: string): Promise<boolean> {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.push({ tone: 'danger', title: t('comms.attachments.tooLarge'), message: t('comms.attachments.tooLargeMessage', { name: fileName }) });
      return false;
    }
    uploading.value = true;
    progress.value = 0;
    try {
      const data = await uploadAttachmentRequest(programId(), file, fileName, (fraction) => (progress.value = fraction), homeActivityId);
      onUploaded(data);
      toast.push({ tone: 'success', title: t('comms.attachments.saved'), message: fileName });
      return true;
    } catch (uploadError) {
      toast.push({ tone: 'danger', title: t('comms.attachments.notSaved'), message: errorMessage(uploadError, t('errors.generic')) });
      return false;
    } finally {
      uploading.value = false;
      progress.value = null;
    }
  }

  return { progress, uploading, upload };
}
