import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import sanitizeHtml from 'sanitize-html';
import {
  ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  PERMISSIONS,
  type AttachmentKind,
  type AuthUser,
  type HomeActivity,
  type HomeActivityStatus,
  type HomeActivityWrite,
  type ProgramAttachment,
  type ProgramAttachmentUpload,
  type ProgramCommunication,
  type ProgramNote,
  type ProgramNoteVersion,
  type ProgramNoteWrite,
  type Role,
} from '@abapro/shared';
import { recordAudit } from '../common/audit';
import { asBytes, asDate, asNullableString, asString } from '../common/http';
import type { Queryable } from '../db/database';
import { AuthorizationService, type ClientRecord } from '../access/authorization.service';

/** Formatting the note editor produces. Everything else, including every attribute, is removed. */
const NOTE_HTML: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'h3', 'h4', 'blockquote'],
  allowedAttributes: {},
  // Browsers wrap new lines in divs while editing.
  transformTags: { div: 'p' },
  disallowedTagsMode: 'discard',
};

interface ProgramRow {
  [key: string]: unknown;
  id: string;
  name: string;
  client_id: string;
  client_name: string;
}

/**
 * Program notes, attachments and home activities.
 *
 * Organisation users read them when they can view the client's programs; parents read them for a child they are
 * linked to as guardian. Assigned therapists and program editors write notes and activities. Attachments also need
 * the Upload documents permission. Every check runs here, and row-level security limits each query to the
 * organisation and clinic.
 */
@Injectable()
export class ProgramCommunicationService {
  constructor(@Inject(AuthorizationService) private readonly authorization: AuthorizationService) {}

  async forProgram(user: AuthUser, programId: string): Promise<ProgramCommunication> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const program = await programRow(tx, organizationId, programId);
      await this.readClient(tx, user, organizationId, program.client_id);
      return load(tx, user, program);
    });
  }

  /** Every program of a client, for the parent portal. */
  async forClient(user: AuthUser, clientId: string): Promise<ProgramCommunication[]> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.readClient(tx, user, organizationId, clientId);
      const programs = await tx.query<ProgramRow>(
        `SELECT p.id, p.name, p.client_id, c.display_name AS client_name
         FROM client_programs p JOIN clients c ON c.id = p.client_id
         WHERE p.client_id = $1 AND p.organization_id = $2
         ORDER BY p.name`,
        [client.id, organizationId],
      );
      const result: ProgramCommunication[] = [];
      for (const program of programs) result.push(await load(tx, user, program));
      return result;
    });
  }

  async addNote(user: AuthUser, programId: string, input: ProgramNoteWrite): Promise<ProgramCommunication> {
    const note = cleanNote(input);
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const program = await programRow(tx, organizationId, programId);
      const client = await this.writeClient(tx, user, organizationId, program.client_id);
      const id = randomUUID();
      await tx.query(
        `INSERT INTO program_notes (id, organization_id, client_id, program_id, title, body_html, note_date, author_id, author_role)
         VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9)`,
        [id, organizationId, client.id, programId, note.title, note.bodyHtml, note.noteDate, user.id, user.role],
      );
      await insertNoteVersion(tx, organizationId, client.id, id, 1, note, user);
      await recordAudit(tx, {
        organizationId, actorUserId: user.id, action: 'program.note_created', targetType: 'program_note', targetId: id,
        metadata: { clientId: client.id, programId },
      });
      return load(tx, user, program);
    });
  }

  async updateNote(user: AuthUser, programId: string, noteId: string, input: ProgramNoteWrite): Promise<ProgramCommunication> {
    const note = cleanNote(input);
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const program = await programRow(tx, organizationId, programId);
      const client = await this.writeClient(tx, user, organizationId, program.client_id);
      const rows = await tx.query<{ author_id: string; version: number }>(
        `SELECT author_id, version FROM program_notes WHERE id = $1 AND program_id = $2 FOR UPDATE`,
        [noteId, programId],
      );
      const current = rows[0];
      if (!current) throw new NotFoundException('That note was not found.');
      if (!mayEditNote(user, asString(current.author_id))) {
        throw new ForbiddenException('Only the author or a program editor can edit this note.');
      }
      const version = Number(current.version) + 1;
      await tx.query(
        `UPDATE program_notes SET title = $2, body_html = $3, note_date = $4::date, version = $5, updated_by = $6, updated_at = now()
         WHERE id = $1`,
        [noteId, note.title, note.bodyHtml, note.noteDate, version, user.id],
      );
      await insertNoteVersion(tx, organizationId, client.id, noteId, version, note, user);
      await recordAudit(tx, {
        organizationId, actorUserId: user.id, action: 'program.note_updated', targetType: 'program_note', targetId: noteId,
        metadata: { clientId: client.id, programId, version },
      });
      return load(tx, user, program);
    });
  }

  /** Every saved version of a note, newest first. Organisation users only. */
  async noteHistory(user: AuthUser, programId: string, noteId: string): Promise<ProgramNoteVersion[]> {
    if (user.role === 'parent') throw new ForbiddenException('You do not have access to this resource.');
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const program = await programRow(tx, organizationId, programId);
      await this.readClient(tx, user, organizationId, program.client_id);
      const rows = await tx.query<{
        version: number; title: string; body_html: string; note_date: string; editor: string; editor_role: Role; edited_at: unknown;
      }>(
        `SELECT v.version, v.title, v.body_html, to_char(v.note_date, 'YYYY-MM-DD') AS note_date,
                u.name AS editor, v.editor_role, v.edited_at
         FROM program_note_versions v
         JOIN program_notes n ON n.id = v.note_id
         JOIN users u ON u.id = v.edited_by
         WHERE v.note_id = $1 AND n.program_id = $2
         ORDER BY v.version DESC`,
        [noteId, programId],
      );
      if (rows.length === 0) throw new NotFoundException('That note was not found.');
      return rows.map((row) => ({
        version: Number(row.version),
        title: asString(row.title),
        bodyHtml: asString(row.body_html),
        noteDate: asString(row.note_date),
        editedByName: asString(row.editor),
        editorRole: row.editor_role,
        editedAt: asDate(row.edited_at).toISOString(),
      }));
    });
  }

  async addActivity(user: AuthUser, programId: string, input: HomeActivityWrite): Promise<ProgramCommunication> {
    const activity = cleanActivity(input);
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const program = await programRow(tx, organizationId, programId);
      const client = await this.writeClient(tx, user, organizationId, program.client_id);
      const id = randomUUID();
      await tx.query(
        `INSERT INTO program_home_activities (
           id, organization_id, client_id, program_id, title, instructions, purpose, frequency, guidance, status,
           created_by, creator_role, completed_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CASE WHEN $10 = 'completed' THEN now() END)`,
        [
          id, organizationId, client.id, programId, activity.title, activity.instructions, activity.purpose, activity.frequency,
          activity.guidance, activity.status, user.id, user.role,
        ],
      );
      await recordAudit(tx, {
        organizationId, actorUserId: user.id, action: 'program.activity_created', targetType: 'home_activity', targetId: id,
        metadata: { clientId: client.id, programId },
      });
      return load(tx, user, program);
    });
  }

  async updateActivity(user: AuthUser, programId: string, activityId: string, input: HomeActivityWrite): Promise<ProgramCommunication> {
    const activity = cleanActivity(input);
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const program = await programRow(tx, organizationId, programId);
      const client = await this.writeClient(tx, user, organizationId, program.client_id);
      const updated = await tx.query<{ id: string }>(
        `UPDATE program_home_activities
         SET title = $3, instructions = $4, purpose = $5, frequency = $6, guidance = $7, status = $8,
             completed_at = CASE WHEN $8 = 'completed' THEN COALESCE(completed_at, now()) END,
             updated_by = $9, updated_at = now()
         WHERE id = $1 AND program_id = $2
         RETURNING id`,
        [activityId, programId, activity.title, activity.instructions, activity.purpose, activity.frequency, activity.guidance, activity.status, user.id],
      );
      if (updated.length === 0) throw new NotFoundException('That activity was not found.');
      await recordAudit(tx, {
        organizationId, actorUserId: user.id, action: 'program.activity_updated', targetType: 'home_activity', targetId: activityId,
        metadata: { clientId: client.id, programId, status: activity.status },
      });
      return load(tx, user, program);
    });
  }

  async addAttachment(user: AuthUser, programId: string, input: ProgramAttachmentUpload): Promise<ProgramCommunication> {
    const file = checkedFile(input);
    if (!user.permissions.includes(PERMISSIONS.documentsUpload)) {
      throw new ForbiddenException('Your role cannot upload documents.');
    }
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const program = await programRow(tx, organizationId, programId);
      const client = await this.writeClient(tx, user, organizationId, program.client_id);
      if (input.homeActivityId) {
        const activity = await tx.query(`SELECT 1 AS present FROM program_home_activities WHERE id = $1 AND program_id = $2`, [input.homeActivityId, programId]);
        if (activity.length === 0) throw new NotFoundException('That activity was not found.');
      }
      const id = randomUUID();
      await tx.query(
        `INSERT INTO client_documents (
           id, organization_id, client_id, file_name, content_type, content, created_by,
           storage_key, byte_size, sha256, scan_status, category
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'not_configured', 'record')`,
        [
          id, organizationId, client.id, file.fileName, file.contentType, file.content, user.id,
          `private/${organizationId}/clients/${client.id}/programs/${programId}/${id}`, file.content.length,
          createHash('sha256').update(file.content).digest('hex'),
        ],
      );
      await tx.query(
        `INSERT INTO program_documents (program_id, document_id, organization_id, kind, home_activity_id) VALUES ($1, $2, $3, $4, $5)`,
        [programId, id, organizationId, file.kind, input.homeActivityId ?? null],
      );
      await recordAudit(tx, {
        organizationId, actorUserId: user.id, action: 'program.document_uploaded', targetType: 'document', targetId: id,
        metadata: { clientId: client.id, programId, kind: file.kind, homeActivityId: input.homeActivityId ?? null },
      });
      return load(tx, user, program);
    });
  }

  /** A file attached to the program. Parents may download those of their linked child's programs. */
  async attachment(user: AuthUser, programId: string, documentId: string): Promise<{ fileName: string; contentType: string; content: Buffer }> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const program = await programRow(tx, organizationId, programId);
      const client = await this.readClient(tx, user, organizationId, program.client_id);
      if (user.role !== 'parent' && !user.permissions.includes(PERMISSIONS.documentsDownload)) {
        throw new ForbiddenException('You do not have access to this resource.');
      }
      const rows = await tx.query<{ file_name: string; content_type: string; content: unknown; scan_status: string }>(
        `SELECT d.file_name, d.content_type, d.content, d.scan_status
         FROM program_documents pd JOIN client_documents d ON d.id = pd.document_id
         WHERE pd.program_id = $1 AND pd.document_id = $2 AND d.client_id = $3`,
        [programId, documentId, client.id],
      );
      const row = rows[0];
      const content = row ? asBytes(row.content) : null;
      if (!row || !content) throw new NotFoundException('That attachment was not found.');
      if (row.scan_status === 'rejected') throw new ForbiddenException('That file did not pass the upload check.');
      await recordAudit(tx, {
        organizationId, actorUserId: user.id, action: 'program.document_downloaded', targetType: 'document', targetId: documentId,
        metadata: { clientId: client.id, programId },
      });
      return { fileName: asString(row.file_name), contentType: asString(row.content_type), content };
    });
  }

  /** Parents reach only a child they are linked to; organisation users need to be able to view programs. */
  private async readClient(tx: Queryable, user: AuthUser, organizationId: string, clientId: string): Promise<ClientRecord> {
    if (user.role === 'parent') {
      return this.authorization.findAccessibleClient(tx, user, organizationId, clientId, 'view');
    }
    if (!user.permissions.includes(PERMISSIONS.programsView)) {
      throw new ForbiddenException('You do not have access to this resource.');
    }
    return this.authorization.findAccessibleClient(tx, user, organizationId, clientId, 'view', PERMISSIONS.programsView);
  }

  /** Program editors, and therapists assigned to the client. */
  private async writeClient(tx: Queryable, user: AuthUser, organizationId: string, clientId: string): Promise<ClientRecord> {
    if (user.permissions.includes(PERMISSIONS.programsEdit) && user.role !== 'parent' && user.role !== 'reviewer') {
      return this.authorization.findAccessibleClient(tx, user, organizationId, clientId, 'write', PERMISSIONS.programsEdit);
    }
    if (user.role === 'therapist') {
      return this.authorization.findAccessibleClient(tx, user, organizationId, clientId, 'view', PERMISSIONS.programsView);
    }
    throw new ForbiddenException('You cannot add notes or activities to this program.');
  }
}

function canWrite(user: AuthUser): boolean {
  if (user.role === 'parent' || user.role === 'reviewer') return false;
  return user.role === 'therapist' || user.permissions.includes(PERMISSIONS.programsEdit);
}

function mayEditNote(user: AuthUser, authorId: string): boolean {
  return canWrite(user) && (authorId === user.id || user.permissions.includes(PERMISSIONS.programsEdit));
}

async function programRow(tx: Queryable, organizationId: string, programId: string): Promise<ProgramRow> {
  const rows = await tx.query<ProgramRow>(
    `SELECT p.id, p.name, p.client_id, c.display_name AS client_name
     FROM client_programs p JOIN clients c ON c.id = p.client_id
     WHERE p.id = $1 AND p.organization_id = $2`,
    [programId, organizationId],
  );
  if (!rows[0]) throw new NotFoundException('That program was not found.');
  return rows[0];
}

async function load(tx: Queryable, user: AuthUser, program: ProgramRow): Promise<ProgramCommunication> {
  const programId = asString(program.id);
  const notes = await tx.query<{
    id: string; title: string; body_html: string; note_date: string; author_id: string; author: string; author_role: Role;
    created_at: unknown; updated_at: unknown; updater: string | null; version: number;
  }>(
    `SELECT n.id, n.title, n.body_html, to_char(n.note_date, 'YYYY-MM-DD') AS note_date, n.author_id, a.name AS author,
            n.author_role, n.created_at, n.updated_at, e.name AS updater, n.version
     FROM program_notes n
     JOIN users a ON a.id = n.author_id
     LEFT JOIN users e ON e.id = n.updated_by
     WHERE n.program_id = $1
     ORDER BY n.note_date DESC, n.created_at DESC`,
    [programId],
  );
  const attachments = await tx.query<{
    id: string; file_name: string; content_type: string; byte_size: number | string; kind: AttachmentKind;
    home_activity_id: string | null; created_at: unknown; uploader: string;
  }>(
    `SELECT d.id, d.file_name, d.content_type, d.byte_size, pd.kind, pd.home_activity_id, d.created_at, u.name AS uploader
     FROM program_documents pd
     JOIN client_documents d ON d.id = pd.document_id
     JOIN users u ON u.id = d.created_by
     WHERE pd.program_id = $1 AND d.scan_status <> 'rejected'
     ORDER BY d.created_at DESC`,
    [programId],
  );
  const activities = await tx.query<{
    id: string; title: string; instructions: string; purpose: string; frequency: string; guidance: string; status: HomeActivityStatus;
    creator: string; creator_role: Role; created_at: unknown; updated_at: unknown; completed_at: unknown;
  }>(
    `SELECT h.id, h.title, h.instructions, h.purpose, h.frequency, h.guidance, h.status, u.name AS creator, h.creator_role,
            h.created_at, h.updated_at, h.completed_at
     FROM program_home_activities h
     JOIN users u ON u.id = h.created_by
     WHERE h.program_id = $1
     ORDER BY h.status, h.created_at DESC`,
    [programId],
  );

  const files: ProgramAttachment[] = attachments.map((row) => ({
    id: asString(row.id),
    fileName: asString(row.file_name),
    contentType: asString(row.content_type),
    byteSize: Number(row.byte_size),
    kind: row.kind,
    homeActivityId: asNullableString(row.home_activity_id),
    uploadedAt: asDate(row.created_at).toISOString(),
    uploadedByName: asString(row.uploader),
  }));
  const writer = canWrite(user);
  return {
    programId,
    programTitle: asString(program.name),
    clientId: asString(program.client_id),
    clientName: asString(program.client_name),
    notes: notes.map((row): ProgramNote => ({
      id: asString(row.id),
      title: asString(row.title),
      bodyHtml: asString(row.body_html),
      noteDate: asString(row.note_date),
      authorId: asString(row.author_id),
      authorName: asString(row.author),
      authorRole: row.author_role,
      createdAt: asDate(row.created_at).toISOString(),
      updatedAt: asDate(row.updated_at).toISOString(),
      updatedByName: asNullableString(row.updater),
      version: Number(row.version),
      canEdit: mayEditNote(user, asString(row.author_id)),
    })),
    attachments: files.filter((file) => file.homeActivityId === null),
    activities: activities.map((row): HomeActivity => ({
      id: asString(row.id),
      title: asString(row.title),
      instructions: asString(row.instructions),
      purpose: asString(row.purpose),
      frequency: asString(row.frequency),
      guidance: asString(row.guidance),
      status: row.status,
      createdByName: asString(row.creator),
      creatorRole: row.creator_role,
      createdAt: asDate(row.created_at).toISOString(),
      updatedAt: asDate(row.updated_at).toISOString(),
      completedAt: row.completed_at ? asDate(row.completed_at).toISOString() : null,
      attachments: files.filter((file) => file.homeActivityId === asString(row.id)),
    })),
    canWrite: writer,
    canUpload: writer && user.permissions.includes(PERMISSIONS.documentsUpload),
  };
}

async function insertNoteVersion(
  tx: Queryable,
  organizationId: string,
  clientId: string,
  noteId: string,
  version: number,
  note: ProgramNoteWrite,
  user: AuthUser,
): Promise<void> {
  await tx.query(
    `INSERT INTO program_note_versions (organization_id, client_id, note_id, version, title, body_html, note_date, edited_by, editor_role)
     VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9)`,
    [organizationId, clientId, noteId, version, note.title, note.bodyHtml, note.noteDate, user.id, user.role],
  );
}

export function cleanNote(input: ProgramNoteWrite): ProgramNoteWrite {
  const title = input.title.trim();
  const bodyHtml = sanitizeHtml(input.bodyHtml, NOTE_HTML).trim();
  const text = sanitizeHtml(bodyHtml, { allowedTags: [], allowedAttributes: {} }).replace(/&nbsp;|\s/g, '');
  if (!title) throw new BadRequestException('Give the note a title.');
  if (!text) throw new BadRequestException('Write the note before saving it.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.noteDate.slice(0, 10))) throw new BadRequestException('Choose the note date.');
  return { title, bodyHtml, noteDate: input.noteDate.slice(0, 10) };
}

function cleanActivity(input: HomeActivityWrite): Required<HomeActivityWrite> {
  const title = input.title.trim();
  const instructions = input.instructions.trim();
  if (!title) throw new BadRequestException('Give the activity a title.');
  if (!instructions) throw new BadRequestException('Add instructions for the parent.');
  return {
    title,
    instructions,
    purpose: input.purpose?.trim() ?? '',
    frequency: input.frequency?.trim() ?? '',
    guidance: input.guidance?.trim() ?? '',
    status: input.status === 'completed' ? 'completed' : 'active',
  };
}

/** Checks the declared type against an allowlist and the file's own signature, so a renamed file is refused. */
export function checkedFile(input: ProgramAttachmentUpload): { fileName: string; contentType: string; content: Buffer; kind: AttachmentKind } {
  const contentType = input.contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!ATTACHMENT_TYPES[contentType]) {
    throw new BadRequestException('Upload a PDF, Word, Excel, PowerPoint, text, CSV, image or audio file.');
  }
  const content = Buffer.from(input.contentBase64, 'base64');
  if (content.length === 0) throw new BadRequestException('That file is empty.');
  if (content.length > MAX_ATTACHMENT_BYTES) throw new BadRequestException('Upload a file up to 10 MB.');
  if (!matchesSignature(contentType, content)) {
    throw new BadRequestException('That file’s contents do not match its type.');
  }
  // Keep the name only: no folders or control characters.
  const fileName = [...(input.fileName.split(/[\\/]/).pop() ?? '')]
    .filter((character) => character.charCodeAt(0) > 0x1f && character.charCodeAt(0) !== 0x7f)
    .join('')
    .trim();
  if (!fileName) throw new BadRequestException('Give the file a name.');
  return { fileName, contentType, content, kind: contentType.startsWith('audio/') ? 'audio' : 'document' };
}

function matchesSignature(contentType: string, content: Buffer): boolean {
  const starts = (...bytes: number[]) => bytes.every((byte, index) => content[index] === byte);
  const ascii = (offset: number, text: string) => content.subarray(offset, offset + text.length).toString('latin1') === text;
  switch (contentType) {
    case 'application/pdf':
      return ascii(0, '%PDF-');
    case 'image/png':
      return starts(0x89, 0x50, 0x4e, 0x47);
    case 'image/jpeg':
      return starts(0xff, 0xd8, 0xff);
    case 'image/webp':
      return ascii(0, 'RIFF') && ascii(8, 'WEBP');
    case 'application/msword':
    case 'application/vnd.ms-excel':
    case 'application/vnd.ms-powerpoint':
      return starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return starts(0x50, 0x4b, 0x03, 0x04);
    case 'text/plain':
    case 'text/csv':
      return !content.subarray(0, 8192).includes(0);
    case 'audio/webm':
      return starts(0x1a, 0x45, 0xdf, 0xa3);
    case 'audio/ogg':
      return ascii(0, 'OggS');
    case 'audio/mpeg':
      return ascii(0, 'ID3') || (content[0] === 0xff && ((content[1] ?? 0) & 0xe0) === 0xe0);
    case 'audio/mp4':
    case 'audio/x-m4a':
      return ascii(4, 'ftyp');
    case 'audio/wav':
    case 'audio/x-wav':
      return ascii(0, 'RIFF') && ascii(8, 'WAVE');
    default:
      return false;
  }
}
