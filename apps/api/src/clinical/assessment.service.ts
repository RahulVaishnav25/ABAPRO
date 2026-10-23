import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PERMISSIONS, type AssessmentDetail, type AssessmentSummary, type AssessmentTemplate, type AuthUser } from '@abapro/shared';
import { recordAudit } from '../common/audit';
import { asDate, asString } from '../common/http';
import type { Queryable } from '../db/database';
import { AuthorizationService } from '../access/authorization.service';
import type { AssessmentWrite, TemplateWrite } from './clinical.dto';

const DOCUMENT_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);
const MAX_DOCUMENT_BYTES = 512 * 1024;

@Injectable()
export class AssessmentService {
  constructor(@Inject(AuthorizationService) private readonly authorization: AuthorizationService) {}

  async list(user: AuthUser, clientId?: string): Promise<AssessmentSummary[]> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const params: unknown[] = [organizationId];
      const scope = clientScope(user, params);
      if (clientId) {
        const client = await this.authorization.findClient(tx, organizationId, clientId);
        await this.authorization.assertClientAccess(tx, user, client, 'view', PERMISSIONS.assessmentsView);
        params.push(client.id);
      }
      const rows = await tx.query<{
        id: string;
        client_id: string;
        client_name: string;
        name: string;
        assessment_type: string;
        status: AssessmentSummary['status'];
        assessed_on: string | null;
        review_on: string | null;
        clinician_name: string | null;
        program_count: number | string;
      }>(
        `SELECT a.id, a.client_id, c.display_name AS client_name, a.name, a.assessment_type, a.status,
                to_char(a.assessed_on, 'YYYY-MM-DD') AS assessed_on,
                to_char(a.review_on, 'YYYY-MM-DD') AS review_on,
                u.name AS clinician_name,
                (SELECT count(*) FROM client_programs p WHERE p.assessment_id = a.id) AS program_count
         FROM assessments a
         JOIN clients c ON c.id = a.client_id
         LEFT JOIN users u ON u.id = a.assigned_clinician_id
         WHERE a.organization_id = $1 ${scope} ${clientId ? `AND a.client_id = $${params.length}` : ''}
         ORDER BY a.assessed_on DESC NULLS LAST, a.created_at DESC`,
        params,
      );
      return rows.map((row) => ({
        id: asString(row.id),
        clientId: asString(row.client_id),
        clientName: asString(row.client_name),
        name: asString(row.name),
        assessmentType: asString(row.assessment_type),
        status: row.status,
        assessedOn: row.assessed_on ? asString(row.assessed_on) : null,
        reviewOn: row.review_on ? asString(row.review_on) : null,
        clinicianName: row.clinician_name ? asString(row.clinician_name) : null,
        programCount: Number(row.program_count ?? 0),
      }));
    });
  }

  async get(user: AuthUser, assessmentId: string): Promise<AssessmentDetail> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => this.load(tx, user, organizationId, assessmentId));
  }

  async create(user: AuthUser, input: AssessmentWrite): Promise<AssessmentDetail> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.authorization.findClient(tx, organizationId, input.clientId);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.assessmentsCreate);
      if (input.assignedClinicianId) {
        await assertClinician(tx, organizationId, input.assignedClinicianId);
      }
      const id = randomUUID();
      await tx.query(
        `INSERT INTO assessments (
           id, organization_id, client_id, template_id, name, assessment_type, status, assessed_on, review_on,
           assigned_clinician_id, summary, results_note, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          id,
          organizationId,
          client.id,
          input.templateId ?? null,
          input.name.trim(),
          input.assessmentType.trim(),
          input.status ?? 'draft',
          input.assessedOn || null,
          input.reviewOn || null,
          input.assignedClinicianId ?? null,
          input.summary?.trim() ?? '',
          input.resultsNote?.trim() ?? '',
          user.id,
        ],
      );
      const items = input.templateId ? await templateItems(tx, organizationId, input.templateId) : input.items ?? [];
      await replaceItems(tx, organizationId, id, items ?? []);
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action: 'assessment.created',
        targetType: 'assessment',
        targetId: id,
        metadata: { clientId: client.id },
      });
      return this.load(tx, user, organizationId, id);
    });
  }

  async update(user: AuthUser, assessmentId: string, input: AssessmentWrite): Promise<AssessmentDetail> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const current = await this.find(tx, organizationId, assessmentId);
      const client = await this.authorization.findClient(tx, organizationId, current.client_id);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.assessmentsCreate);
      const statusChanged = input.status !== undefined && input.status !== current.status;
      if (statusChanged && (input.status === 'completed' || input.status === 'reviewed')) {
        await tx.query(
          `INSERT INTO clinical_change_reasons (organization_id, record_type, record_id, reason, created_by)
           VALUES ($1, 'assessment', $2, $3, $4)`,
          [organizationId, assessmentId, requireReason(input.changeReason), user.id],
        );
      }
      if (input.assignedClinicianId) {
        await assertClinician(tx, organizationId, input.assignedClinicianId);
      }
      await tx.query(
        `UPDATE assessments
         SET name = $2, assessment_type = $3, status = $4, assessed_on = $5, review_on = $6,
             assigned_clinician_id = $7, summary = $8, results_note = $9, updated_at = now()
         WHERE id = $1`,
        [
          assessmentId,
          input.name.trim(),
          input.assessmentType.trim(),
          input.status ?? current.status,
          input.assessedOn || null,
          input.reviewOn || null,
          input.assignedClinicianId ?? null,
          input.summary?.trim() ?? '',
          input.resultsNote?.trim() ?? '',
          ],
      );
      if (input.items) {
        await replaceItems(tx, organizationId, assessmentId, input.items);
      }
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action: 'assessment.updated',
        targetType: 'assessment',
        targetId: assessmentId,
        metadata: { clientId: client.id, status: input.status ?? current.status },
      });
      return this.load(tx, user, organizationId, assessmentId);
    });
  }

  async templates(user: AuthUser): Promise<AssessmentTemplate[]> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const rows = await tx.query<{ id: string }>(
        `SELECT id FROM assessment_templates WHERE organization_id = $1 ORDER BY name`,
        [organizationId],
      );
      const templates: AssessmentTemplate[] = [];
      for (const row of rows) {
        templates.push(await loadTemplate(tx, asString(row.id)));
      }
      return templates;
    });
  }

  async saveTemplate(user: AuthUser, input: TemplateWrite, templateId?: string): Promise<AssessmentTemplate> {
    if (!user.permissions.includes(PERMISSIONS.assessmentsCreate)) {
      throw new BadRequestException('Assessment templates require permission to create assessments.');
    }
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const id = templateId ?? randomUUID();
      if (templateId) {
        const existing = await tx.query(`SELECT 1 AS present FROM assessment_templates WHERE id = $1 AND organization_id = $2`, [templateId, organizationId]);
        if (existing.length === 0) {
          throw new NotFoundException('That assessment template was not found.');
        }
        await tx.query(
          `UPDATE assessment_templates SET name = $2, assessment_type = $3, description = $4, status = $5, updated_at = now() WHERE id = $1`,
          [id, input.name.trim(), input.assessmentType.trim(), input.description?.trim() ?? '', input.status ?? 'active'],
        );
        await tx.query(`DELETE FROM assessment_template_items WHERE template_id = $1`, [id]);
      } else {
        await tx.query(
          `INSERT INTO assessment_templates (id, organization_id, name, assessment_type, description, status, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, organizationId, input.name.trim(), input.assessmentType.trim(), input.description?.trim() ?? '', input.status ?? 'active', user.id],
        );
      }
      let order = 0;
      for (const item of input.items ?? []) {
        if (!item.label.trim()) continue;
        await tx.query(
          `INSERT INTO assessment_template_items (organization_id, template_id, label, response_kind, guidance, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [organizationId, id, item.label.trim(), item.responseKind, item.guidance?.trim() ?? '', order],
        );
        order += 1;
      }
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action: 'assessment_template.updated',
        targetType: 'assessment_template',
        targetId: id,
      });
      return loadTemplate(tx, id);
    });
  }

  async addDocument(
    user: AuthUser,
    assessmentId: string,
    file: { fileName: string; contentType: string; contentBase64: string },
  ): Promise<{ id: string }> {
    if (!DOCUMENT_TYPES.has(file.contentType)) {
      throw new BadRequestException('Upload a PDF, PNG, JPEG, or WebP file.');
    }
    const content = Buffer.from(file.contentBase64, 'base64');
    if (content.length === 0 || content.length > MAX_DOCUMENT_BYTES) {
      throw new BadRequestException('Upload a document up to 512 KB.');
    }
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const current = await this.find(tx, organizationId, assessmentId);
      const client = await this.authorization.findClient(tx, organizationId, current.client_id);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.documentsUpload);
      const id = randomUUID();
      await tx.query(
        `INSERT INTO client_documents (
           id, organization_id, client_id, file_name, content_type, content, created_by,
           storage_key, byte_size, sha256, scan_status, category
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'not_configured', 'assessment')`,
        [
          id,
          organizationId,
          client.id,
          file.fileName.trim(),
          file.contentType,
          content,
          user.id,
          `private/${organizationId}/clients/${client.id}/documents/${id}`,
          content.length,
          createHash('sha256').update(content).digest('hex'),
        ],
      );
      await tx.query(
        `INSERT INTO assessment_documents (assessment_id, document_id, organization_id) VALUES ($1, $2, $3)`,
        [assessmentId, id, organizationId],
      );
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action: 'assessment.document_uploaded',
        targetType: 'document',
        targetId: id,
        metadata: { clientId: client.id, assessmentId },
      });
      return { id };
    });
  }

  private async find(tx: Queryable, organizationId: string, assessmentId: string): Promise<{ client_id: string; status: string }> {
    const rows = await tx.query<{ client_id: string; status: string }>(
      `SELECT client_id, status FROM assessments WHERE id = $1 AND organization_id = $2`,
      [assessmentId, organizationId],
    );
    const row = rows[0];
    if (!row) {
      throw new NotFoundException('That assessment was not found.');
    }
    return row;
  }

  private async load(tx: Queryable, user: AuthUser, organizationId: string, assessmentId: string): Promise<AssessmentDetail> {
    const rows = await tx.query<{
      id: string;
      client_id: string;
      client_name: string;
      template_id: string | null;
      name: string;
      assessment_type: string;
      status: AssessmentSummary['status'];
      assessed_on: string | null;
      review_on: string | null;
      clinician_name: string | null;
      summary: string;
      results_note: string;
    }>(
      `SELECT a.id, a.client_id, c.display_name AS client_name, a.template_id, a.name, a.assessment_type, a.status,
              to_char(a.assessed_on, 'YYYY-MM-DD') AS assessed_on, to_char(a.review_on, 'YYYY-MM-DD') AS review_on,
              u.name AS clinician_name, a.summary, a.results_note
       FROM assessments a
       JOIN clients c ON c.id = a.client_id
       LEFT JOIN users u ON u.id = a.assigned_clinician_id
       WHERE a.id = $1 AND a.organization_id = $2`,
      [assessmentId, organizationId],
    );
    const row = rows[0];
    if (!row) {
      throw new NotFoundException('That assessment was not found.');
    }
    const client = await this.authorization.findClient(tx, organizationId, asString(row.client_id));
    await this.authorization.assertClientAccess(tx, user, client, 'view', PERMISSIONS.assessmentsView);
    const items = await tx.query<{ id: string; label: string; response_kind: AssessmentDetail['items'][number]['responseKind']; response_text: string; sort_order: number }>(
      `SELECT id, label, response_kind, response_text, sort_order FROM assessment_items WHERE assessment_id = $1 ORDER BY sort_order`,
      [assessmentId],
    );
    const documents = await tx.query<{ id: string; file_name: string; content_type: string; byte_size: number; scan_status: 'not_configured' | 'rejected' }>(
      `SELECT d.id, d.file_name, d.content_type, d.byte_size, d.scan_status
       FROM assessment_documents link
       JOIN client_documents d ON d.id = link.document_id
       WHERE link.assessment_id = $1`,
      [assessmentId],
    );
    const programs = await tx.query<{ id: string; name: string; status: string }>(
      `SELECT id, name, status FROM client_programs WHERE assessment_id = $1 ORDER BY created_at`,
      [assessmentId],
    );
    return {
      id: asString(row.id),
      clientId: asString(row.client_id),
      clientName: asString(row.client_name),
      templateId: row.template_id ? asString(row.template_id) : null,
      name: asString(row.name),
      assessmentType: asString(row.assessment_type),
      status: row.status,
      assessedOn: row.assessed_on ? asString(row.assessed_on) : null,
      reviewOn: row.review_on ? asString(row.review_on) : null,
      clinicianName: row.clinician_name ? asString(row.clinician_name) : null,
      programCount: programs.length,
      summary: asString(row.summary),
      resultsNote: asString(row.results_note),
      items: items.map((item) => ({
        id: asString(item.id),
        label: asString(item.label),
        responseKind: item.response_kind,
        responseText: asString(item.response_text),
        sortOrder: Number(item.sort_order),
      })),
      documents: documents.map((document) => ({
        id: asString(document.id),
        fileName: asString(document.file_name),
        contentType: asString(document.content_type),
        byteSize: Number(document.byte_size),
        scanStatus: document.scan_status,
      })),
      programs: programs.map((program) => ({ id: asString(program.id), title: asString(program.name), status: asString(program.status) })),
    };
  }
}

function clientScope(user: AuthUser, params: unknown[]): string {
  if (user.role !== 'therapist' && user.role !== 'parent') {
    return '';
  }
  params.push(user.id);
  const relationship = user.role === 'parent' ? 'guardian' : 'therapist';
  return `AND EXISTS (
    SELECT 1 FROM client_assignments assigned
    WHERE assigned.client_id = a.client_id AND assigned.user_id = $${params.length}
      AND assigned.relationship = '${relationship}' AND assigned.ended_at IS NULL
  )`;
}

async function templateItems(tx: Queryable, organizationId: string, templateId: string): Promise<TemplateWrite['items']> {
  const rows = await tx.query<{ label: string; response_kind: 'text' | 'yes_no' | 'rating' | 'count'; guidance: string }>(
    `SELECT label, response_kind, guidance FROM assessment_template_items
     WHERE template_id = $1 AND organization_id = $2 ORDER BY sort_order`,
    [templateId, organizationId],
  );
  if (rows.length === 0) {
    const present = await tx.query(`SELECT 1 AS present FROM assessment_templates WHERE id = $1 AND organization_id = $2`, [templateId, organizationId]);
    if (present.length === 0) {
      throw new NotFoundException('That assessment template was not found.');
    }
  }
  return rows.map((row) => ({ label: asString(row.label), responseKind: row.response_kind, guidance: asString(row.guidance), responseText: '' }));
}

async function replaceItems(tx: Queryable, organizationId: string, assessmentId: string, items: NonNullable<AssessmentWrite['items']>): Promise<void> {
  await tx.query(`DELETE FROM assessment_items WHERE assessment_id = $1`, [assessmentId]);
  let order = 0;
  for (const item of items) {
    if (!item.label.trim()) continue;
    await tx.query(
      `INSERT INTO assessment_items (organization_id, assessment_id, label, response_kind, response_text, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [organizationId, assessmentId, item.label.trim(), item.responseKind, item.responseText?.trim() ?? '', order],
    );
    order += 1;
  }
}

async function loadTemplate(tx: Queryable, templateId: string): Promise<AssessmentTemplate> {
  const rows = await tx.query<{
    id: string;
    name: string;
    assessment_type: string;
    description: string;
    status: AssessmentTemplate['status'];
    updated_at: Date | string;
  }>(`SELECT id, name, assessment_type, description, status, updated_at FROM assessment_templates WHERE id = $1`, [templateId]);
  const row = rows[0];
  if (!row) {
    throw new NotFoundException('That assessment template was not found.');
  }
  const items = await tx.query<{ id: string; label: string; response_kind: AssessmentTemplate['items'][number]['responseKind']; guidance: string; sort_order: number }>(
    `SELECT id, label, response_kind, guidance, sort_order FROM assessment_template_items WHERE template_id = $1 ORDER BY sort_order`,
    [templateId],
  );
  return {
    id: asString(row.id),
    name: asString(row.name),
    assessmentType: asString(row.assessment_type),
    description: asString(row.description),
    status: row.status,
    updatedAt: asDate(row.updated_at).toISOString(),
    items: items.map((item) => ({
      id: asString(item.id),
      label: asString(item.label),
      responseKind: item.response_kind,
      guidance: asString(item.guidance),
      sortOrder: Number(item.sort_order),
    })),
  };
}

async function assertClinician(tx: Queryable, organizationId: string, userId: string): Promise<void> {
  const rows = await tx.query(
    `SELECT 1 AS present FROM organization_memberships
     WHERE organization_id = $1 AND user_id = $2 AND status = 'active'
       AND role IN ('clinical_supervisor', 'organization_admin')`,
    [organizationId, userId],
  );
  if (rows.length === 0) {
    throw new BadRequestException('The assigned clinician must be an active supervisor or organization administrator.');
  }
}

function requireReason(reason: string | undefined): string {
  const text = reason?.trim() ?? '';
  if (text.length < 12) {
    throw new BadRequestException('Enter a reason of at least 12 characters for this clinical change.');
  }
  return text;
}
