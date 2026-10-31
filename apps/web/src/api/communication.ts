import type {
  HomeActivityWrite,
  ProgramAttachment,
  ProgramAttachmentUpload,
  ProgramCommunication,
  ProgramNoteVersion,
  ProgramNoteWrite,
} from '@abapro/shared';
import { apiBlob, apiRequest, apiUpload, encodedPath } from './client';
import { fileToBase64 } from './clients';

export function communicationRequest(programId: string): Promise<ProgramCommunication> {
  return apiRequest(encodedPath`/programs/${programId}/communication`);
}

export function saveNoteRequest(programId: string, body: ProgramNoteWrite, noteId?: string): Promise<ProgramCommunication> {
  return noteId
    ? apiRequest(encodedPath`/programs/${programId}/notes/${noteId}`, { method: 'PATCH', body })
    : apiRequest(encodedPath`/programs/${programId}/notes`, { method: 'POST', body });
}

export function noteHistoryRequest(programId: string, noteId: string): Promise<ProgramNoteVersion[]> {
  return apiRequest(encodedPath`/programs/${programId}/notes/${noteId}/history`);
}

export function saveActivityRequest(programId: string, body: HomeActivityWrite, activityId?: string): Promise<ProgramCommunication> {
  return activityId
    ? apiRequest(encodedPath`/programs/${programId}/activities/${activityId}`, { method: 'PATCH', body })
    : apiRequest(encodedPath`/programs/${programId}/activities`, { method: 'POST', body });
}

export async function uploadAttachmentRequest(
  programId: string,
  file: Blob,
  fileName: string,
  onProgress: (fraction: number) => void,
  homeActivityId?: string,
): Promise<ProgramCommunication> {
  const body: ProgramAttachmentUpload = {
    fileName,
    contentType: file.type,
    contentBase64: await fileToBase64(file),
    homeActivityId,
  };
  return apiUpload(encodedPath`/programs/${programId}/attachments`, body, onProgress);
}

export function attachmentBlobRequest(programId: string, attachment: ProgramAttachment): Promise<Blob> {
  return apiBlob(encodedPath`/programs/${programId}/attachments/${attachment.id}`);
}

/** Saves a blob through the browser's download prompt. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
