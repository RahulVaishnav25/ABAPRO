import { ref } from 'vue';
import { MAX_ATTACHMENT_BYTES, type ProgramCommunication } from '@abapro/shared';
import { uploadAttachmentRequest } from '@/api/communication';
import { errorMessage } from '@/lib/loader';
import { useToastStore } from '@/stores/toast';

/** One upload at a time, with progress, reporting success or failure in a toast. */
export function useUpload(programId: () => string, onUploaded: (data: ProgramCommunication) => void) {
  const toast = useToastStore();
  const progress = ref<number | null>(null);
  const uploading = ref(false);

  async function upload(file: Blob, fileName: string, homeActivityId?: string): Promise<boolean> {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.push({ tone: 'danger', title: 'File is too large', message: `${fileName} is larger than 10 MB.` });
      return false;
    }
    uploading.value = true;
    progress.value = 0;
    try {
      const data = await uploadAttachmentRequest(programId(), file, fileName, (fraction) => (progress.value = fraction), homeActivityId);
      onUploaded(data);
      toast.push({ tone: 'success', title: 'Attachment saved', message: fileName });
      return true;
    } catch (uploadError) {
      toast.push({ tone: 'danger', title: 'Attachment was not saved', message: errorMessage(uploadError, 'Try again.') });
      return false;
    } finally {
      uploading.value = false;
      progress.value = null;
    }
  }

  return { progress, uploading, upload };
}
