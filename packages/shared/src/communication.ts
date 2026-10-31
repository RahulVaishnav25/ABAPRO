import type { Role } from './permissions';

// Program notes, attachments and home activities. Organisation users with access to the client read them;
// parents read them for their linked child. Writing is for assigned therapists and program editors.

export type HomeActivityStatus = 'active' | 'completed';
export type AttachmentKind = 'document' | 'audio';

/** Largest attachment, including audio recordings. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** File types accepted as attachments, with the label shown for each. */
export const ATTACHMENT_TYPES: Readonly<Record<string, string>> = {
  'application/pdf': 'PDF',
  'application/msword': 'Word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/vnd.ms-excel': 'Excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
  'application/vnd.ms-powerpoint': 'PowerPoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
  'text/plain': 'Text',
  'text/csv': 'CSV',
  'image/png': 'PNG image',
  'image/jpeg': 'JPEG image',
  'image/webp': 'WebP image',
  'audio/webm': 'Audio',
  'audio/ogg': 'Audio',
  'audio/mpeg': 'Audio',
  'audio/mp4': 'Audio',
  'audio/x-m4a': 'Audio',
  'audio/wav': 'Audio',
  'audio/x-wav': 'Audio',
};

export function attachmentTypeLabel(contentType: string): string {
  return ATTACHMENT_TYPES[contentType.split(';')[0]?.trim() ?? ''] ?? 'File';
}

export interface ProgramNote {
  id: string;
  title: string;
  /** Sanitised by the API; only basic formatting tags remain. */
  bodyHtml: string;
  noteDate: string;
  authorId: string;
  authorName: string;
  authorRole: Role;
  createdAt: string;
  updatedAt: string;
  updatedByName: string | null;
  version: number;
  /** Whether the current user may edit it: its author, or a program editor. */
  canEdit: boolean;
}

export interface ProgramNoteVersion {
  version: number;
  title: string;
  bodyHtml: string;
  noteDate: string;
  editedByName: string;
  editorRole: Role;
  editedAt: string;
}

export interface ProgramAttachment {
  id: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  kind: AttachmentKind;
  homeActivityId: string | null;
  uploadedAt: string;
  uploadedByName: string;
}

export interface HomeActivity {
  id: string;
  title: string;
  instructions: string;
  purpose: string;
  frequency: string;
  guidance: string;
  status: HomeActivityStatus;
  createdByName: string;
  creatorRole: Role;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  attachments: ProgramAttachment[];
}

export interface ProgramCommunication {
  programId: string;
  programTitle: string;
  clientId: string;
  clientName: string;
  notes: ProgramNote[];
  /** Attachments not tied to a home activity. */
  attachments: ProgramAttachment[];
  activities: HomeActivity[];
  /** Notes and activities. */
  canWrite: boolean;
  /** Attachments and audio, which also need the Upload documents permission. */
  canUpload: boolean;
}

export interface ProgramNoteWrite {
  title: string;
  bodyHtml: string;
  noteDate: string;
}

export interface HomeActivityWrite {
  title: string;
  instructions: string;
  purpose?: string;
  frequency?: string;
  guidance?: string;
  status?: HomeActivityStatus;
}

export interface ProgramAttachmentUpload {
  fileName: string;
  contentType: string;
  contentBase64: string;
  /** Supporting material for one of the program's home activities. */
  homeActivityId?: string;
}
