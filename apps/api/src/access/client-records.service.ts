import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  PERMISSIONS,
  type AssessmentReference,
  type Permission,
  type AuthUser,
  type ClientActivity,
  type ClientBehavior,
  type ClientDocumentView,
  type ClientGoal,
  type ClientGuardian,
  type ClientProgramView,
  type ClientSessionView,
  type ContactChannel,
  type MeasurementType,
} from '@abapro/shared';
import { recordAudit } from '../common/audit';
import { asBytes, asDate, asString } from '../common/http';
import type { Queryable } from '../db/database';
import type {
  AssessmentReferenceDto,
  AvatarDto,
  BehaviorDto,
  GoalDto,
  GuardianDto,
  UpdateProgramStatusDto,
} from './access.dto';
import { AuthorizationService } from './authorization.service';

const MAX_DOCUMENT_BYTES = 512 * 1024;

@Injectable()
export class ClientRecordsService {
  constructor(@Inject(AuthorizationService) private readonly authorization: AuthorizationService) {}

  async addGuardian(user: AuthUser, clientId: string, input: GuardianDto): Promise<ClientGuardian> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.requireEditable(tx, user, organizationId, clientId, PERMISSIONS.guardiansManage);
      const id = await this.writeGuardian(tx, organizationId, client.id, user.id, input, null);
      if (input.portalAccess && input.linkedUserId) {
        await this.linkGuardian(tx, organizationId, client.id, input.linkedUserId, user.id);
      }
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action: 'client.guardian_updated',
        targetType: 'client',
        targetId: client.id,
        metadata: { guardianId: id },
      });
      return this.guardian(tx, id);
    });
  }

  async updateGuardian(user: AuthUser, clientId: string, guardianId: string, input: GuardianDto): Promise<ClientGuardian> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.requireEditable(tx, user, organizationId, clientId, PERMISSIONS.guardiansManage);
      const current = await tx.query<{ id: string }>(
        `SELECT id FROM client_guardians WHERE id = $1 AND client_id = $2 AND ended_at IS NULL`,
        [guardianId, client.id],
      );
      if (current.length === 0) {
        throw new NotFoundException('That guardian record was not found.');
      }
      await this.writeGuardian(tx, organizationId, client.id, user.id, input, guardianId);
      if (input.portalAccess && input.linkedUserId) {
        await this.linkGuardian(tx, organizationId, client.id, input.linkedUserId, user.id);
      }
      if (!input.portalAccess && input.linkedUserId) {
        await tx.query(
          `UPDATE client_assignments SET ended_at = now()
           WHERE client_id = $1 AND user_id = $2 AND relationship = 'guardian' AND ended_at IS NULL`,
          [client.id, input.linkedUserId],
        );
      }
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action: 'client.guardian_updated',
        targetType: 'client',
        targetId: client.id,
        metadata: { guardianId },
      });
      return this.guardian(tx, guardianId);
    });
  }

  async endGuardian(user: AuthUser, clientId: string, guardianId: string): Promise<{ id: string }> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.requireEditable(tx, user, organizationId, clientId, PERMISSIONS.guardiansManage);
      const rows = await tx.query<{ linked_user_id: string | null }>(
        `UPDATE client_guardians SET ended_at = now(), updated_at = now()
         WHERE id = $1 AND client_id = $2 AND ended_at IS NULL
         RETURNING linked_user_id`,
        [guardianId, client.id],
      );
      if (rows.length === 0) {
        throw new NotFoundException('That guardian record was not found.');
      }
      const linked = rows[0]?.linked_user_id;
      if (linked) {
        await tx.query(
          `UPDATE client_assignments SET ended_at = now()
           WHERE client_id = $1 AND user_id = $2 AND relationship = 'guardian' AND ended_at IS NULL`,
          [client.id, linked],
        );
      }
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action: 'client.guardian_ended',
        targetType: 'client',
        targetId: client.id,
        metadata: { guardianId },
      });
      return { id: guardianId };
    });
  }

  async behaviors(user: AuthUser, clientId: string): Promise<ClientBehavior[]> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.requireView(tx, user, organizationId, clientId, PERMISSIONS.clientsView);
      const rows = await tx.query<{
        id: string;
        name: string;
        operational_definition: string;
        measurement_type: MeasurementType;
        measurement_notes: string | null;
        status: 'active' | 'discontinued';
      }>(
        `SELECT id, name, operational_definition, measurement_type, measurement_notes, status
         FROM client_behaviors WHERE client_id = $1 ORDER BY created_at`,
        [client.id],
      );
      return rows.map((row) => ({
        id: asString(row.id),
        name: asString(row.name),
        operationalDefinition: asString(row.operational_definition),
        measurementType: row.measurement_type,
        measurementNotes: row.measurement_notes ? asString(row.measurement_notes) : null,
        status: row.status,
      }));
    });
  }

  async saveBehavior(user: AuthUser, clientId: string, input: BehaviorDto, behaviorId?: string): Promise<ClientBehavior> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.requireEditable(tx, user, organizationId, clientId, PERMISSIONS.clientsEdit);
      const status = input.status ?? 'active';
      const rows = behaviorId
        ? await tx.query<{ id: string }>(
            `UPDATE client_behaviors
             SET name = $3, operational_definition = $4, measurement_type = $5, measurement_notes = $6, status = $7, updated_at = now()
             WHERE id = $1 AND client_id = $2
             RETURNING id`,
            [behaviorId, client.id, input.name.trim(), input.operationalDefinition.trim(), input.measurementType, blank(input.measurementNotes), status],
          )
        : await tx.query<{ id: string }>(
            `INSERT INTO client_behaviors (
               organization_id, client_id, name, operational_definition, measurement_type, measurement_notes, status, created_by
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [organizationId, client.id, input.name.trim(), input.operationalDefinition.trim(), input.measurementType, blank(input.measurementNotes), status, user.id],
          );
      if (rows.length === 0) {
        throw new NotFoundException('That behavior record was not found.');
      }
      const id = asString(rows[0]?.id);
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action: 'client.behavior_updated',
        targetType: 'client',
        targetId: client.id,
        metadata: { behaviorId: id },
      });
      return {
        id,
        name: input.name.trim(),
        operationalDefinition: input.operationalDefinition.trim(),
        measurementType: input.measurementType,
        measurementNotes: blank(input.measurementNotes),
        status,
      };
    });
  }

  async goals(user: AuthUser, clientId: string): Promise<ClientGoal[]> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.requireView(tx, user, organizationId, clientId, PERMISSIONS.programsView);
      const rows = await tx.query<{
        id: string;
        statement: string;
        objective: string | null;
        assessment_reference: string | null;
        review_on: string | null;
        status: 'active' | 'met' | 'discontinued';
      }>(
        `SELECT id, statement, objective, assessment_reference, to_char(review_on, 'YYYY-MM-DD') AS review_on, status
         FROM client_goals WHERE client_id = $1 ORDER BY created_at`,
        [client.id],
      );
      return rows.map((row) => ({
        id: asString(row.id),
        statement: asString(row.statement),
        objective: row.objective ? asString(row.objective) : null,
        assessmentReference: row.assessment_reference ? asString(row.assessment_reference) : null,
        reviewOn: row.review_on ? asString(row.review_on) : null,
        status: row.status,
      }));
    });
  }

  async saveGoal(user: AuthUser, clientId: string, input: GoalDto, goalId?: string): Promise<ClientGoal> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.requireEditable(tx, user, organizationId, clientId, PERMISSIONS.programsEdit);
      const status = input.status ?? 'active';
      const review = input.reviewOn ? input.reviewOn.slice(0, 10) : null;
      const rows = goalId
        ? await tx.query<{ id: string }>(
            `UPDATE client_goals
             SET statement = $3, objective = $4, assessment_reference = $5, review_on = $6, status = $7, updated_at = now()
             WHERE id = $1 AND client_id = $2 RETURNING id`,
            [goalId, client.id, input.statement.trim(), blank(input.objective), blank(input.assessmentReference), review, status],
          )
        : await tx.query<{ id: string }>(
            `INSERT INTO client_goals (
               organization_id, client_id, statement, objective, assessment_reference, review_on, status, created_by
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [organizationId, client.id, input.statement.trim(), blank(input.objective), blank(input.assessmentReference), review, status, user.id],
          );
      if (rows.length === 0) {
        throw new NotFoundException('That goal was not found.');
      }
      const id = asString(rows[0]?.id);
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action: 'client.goal_updated',
        targetType: 'client',
        targetId: client.id,
        metadata: { goalId: id },
      });
      return {
        id,
        statement: input.statement.trim(),
        objective: blank(input.objective),
        assessmentReference: blank(input.assessmentReference),
        reviewOn: review,
        status,
      };
    });
  }

  async assessments(user: AuthUser, clientId: string): Promise<AssessmentReference[]> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.requireView(tx, user, organizationId, clientId, PERMISSIONS.assessmentsView);
      const rows = await tx.query<{
        id: string;
        title: string;
        instrument: string | null;
        completed_on: string | null;
        notes: string | null;
      }>(
        `SELECT id, title, instrument, to_char(completed_on, 'YYYY-MM-DD') AS completed_on, notes
         FROM client_assessment_references WHERE client_id = $1 ORDER BY created_at`,
        [client.id],
      );
      return rows.map((row) => ({
        id: asString(row.id),
        title: asString(row.title),
        instrument: row.instrument ? asString(row.instrument) : null,
        completedOn: row.completed_on ? asString(row.completed_on) : null,
        notes: row.notes ? asString(row.notes) : null,
      }));
    });
  }

  async addAssessment(user: AuthUser, clientId: string, input: AssessmentReferenceDto): Promise<AssessmentReference> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.requireEditable(tx, user, organizationId, clientId, PERMISSIONS.assessmentsCreate);
      const rows = await tx.query<{ id: string }>(
        `INSERT INTO client_assessment_references (
           organization_id, client_id, title, instrument, completed_on, notes, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [organizationId, client.id, input.title.trim(), blank(input.instrument), input.completedOn?.slice(0, 10) ?? null, blank(input.notes), user.id],
      );
      const id = asString(rows[0]?.id);
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action: 'client.assessment_recorded',
        targetType: 'client',
        targetId: client.id,
        metadata: { assessmentId: id },
      });
      return {
        id,
        title: input.title.trim(),
        instrument: blank(input.instrument),
        completedOn: input.completedOn?.slice(0, 10) ?? null,
        notes: blank(input.notes),
      };
    });
  }

  async programs(user: AuthUser, clientId: string): Promise<ClientProgramView[]> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.requireView(tx, user, organizationId, clientId, PERMISSIONS.programsView);
      const programs = await tx.query<{ id: string; name: string; status: ClientProgramView['status'] }>(
        `SELECT id, name, status FROM client_programs WHERE client_id = $1 ORDER BY created_at`,
        [client.id],
      );
      const targets = await tx.query<{ id: string; program_id: string; name: string; phase: string }>(
        `SELECT id, program_id, name, phase FROM client_targets WHERE client_id = $1 ORDER BY created_at`,
        [client.id],
      );
      return programs.map((program) => ({
        id: asString(program.id),
        name: asString(program.name),
        status: program.status,
        targets: targets
          .filter((target) => asString(target.program_id) === asString(program.id))
          .map((target) => ({ id: asString(target.id), name: asString(target.name), phase: asString(target.phase) })),
      }));
    });
  }

  async updateProgram(user: AuthUser, clientId: string, programId: string, input: UpdateProgramStatusDto): Promise<{ id: string; status: string }> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.requireEditable(tx, user, organizationId, clientId, PERMISSIONS.programsEdit);
      const rows = await tx.query<{ id: string }>(
        `UPDATE client_programs SET status = $3, updated_at = now() WHERE id = $1 AND client_id = $2 RETURNING id`,
        [programId, client.id, input.status],
      );
      if (rows.length === 0) {
        throw new NotFoundException('That program was not found.');
      }
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action: 'client.program_updated',
        targetType: 'program',
        targetId: programId,
        metadata: { clientId: client.id, status: input.status },
      });
      return { id: programId, status: input.status };
    });
  }

  async sessions(user: AuthUser, clientId: string): Promise<ClientSessionView[]> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.requireView(tx, user, organizationId, clientId, PERMISSIONS.sessionsView);
      const rows = await tx.query<{ id: string; started_at: Date | string; ended_at: Date | string | null; status: ClientSessionView['status']; observation_count: number | string; therapist_name: string | null }>(
        `SELECT s.id, s.started_at, s.ended_at, s.status,
                (SELECT count(*) FROM session_observations o WHERE o.session_id = s.id AND o.status = 'recorded') AS observation_count,
                therapist.name AS therapist_name
         FROM therapy_sessions s
         LEFT JOIN users therapist ON therapist.id = s.therapist_id
         WHERE s.client_id = $1
         ORDER BY s.started_at DESC`,
        [client.id],
      );
      return rows.map((row) => ({
        id: asString(row.id),
        startedAt: asDate(row.started_at).toISOString(),
        endedAt: row.ended_at ? asDate(row.ended_at).toISOString() : null,
        status: row.status,
        observationCount: Number(row.observation_count),
        therapistName: row.therapist_name ? asString(row.therapist_name) : null,
      }));
    });
  }

  async documents(user: AuthUser, clientId: string): Promise<ClientDocumentView[]> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.authorization.findClient(tx, organizationId, clientId);
      const permission = user.permissions.includes(PERMISSIONS.documentsDownload) ? PERMISSIONS.documentsDownload : PERMISSIONS.documentsUpload;
      await this.authorization.assertClientAccess(tx, user, client, 'view', permission);
      const sharedOnly = user.role === 'parent';
      const rows = await tx.query<{
        id: string;
        file_name: string;
        content_type: string;
        byte_size: number;
        category: ClientDocumentView['category'];
        scan_status: ClientDocumentView['scanStatus'];
        created_at: Date | string;
      }>(
        sharedOnly
          ? `SELECT d.id, d.file_name, d.content_type, d.byte_size, d.category, d.scan_status, d.created_at
             FROM client_documents d
             JOIN shared_records s ON s.record_id = d.id AND s.record_type = 'document' AND s.shared_with_user_id = $2
             WHERE d.client_id = $1 AND d.category <> 'avatar'
             ORDER BY d.created_at DESC`
          : `SELECT id, file_name, content_type, byte_size, category, scan_status, created_at
             FROM client_documents WHERE client_id = $1 AND category <> 'avatar'
             ORDER BY created_at DESC`,
        sharedOnly ? [client.id, user.id] : [client.id],
      );
      return rows.map((row) => ({
        id: asString(row.id),
        fileName: asString(row.file_name),
        contentType: asString(row.content_type),
        byteSize: Number(row.byte_size),
        category: row.category,
        scanStatus: row.scan_status,
        createdAt: asDate(row.created_at).toISOString(),
      }));
    });
  }

  async activity(user: AuthUser, clientId: string): Promise<ClientActivity[]> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.requireView(tx, user, organizationId, clientId, PERMISSIONS.auditView);
      const rows = await tx.query<{ id: string; action: string; name: string | null; created_at: Date | string }>(
        `SELECT e.id, e.action, u.name, e.created_at
         FROM audit_events e
         LEFT JOIN users u ON u.id = e.actor_user_id
         WHERE e.organization_id = $1
           AND (
             (e.target_type = 'client' AND e.target_id = $2)
             OR e.metadata->>'clientId' = $2
           )
         ORDER BY e.created_at DESC
         LIMIT 100`,
        [organizationId, client.id],
      );
      return rows.map((row) => ({
        id: asString(row.id),
        action: asString(row.action),
        actorName: row.name ? asString(row.name) : null,
        createdAt: asDate(row.created_at).toISOString(),
      }));
    });
  }

  async saveAvatar(user: AuthUser, clientId: string, input: AvatarDto): Promise<{ id: string }> {
    if (input.contentType !== 'image/png' && input.contentType !== 'image/jpeg' && input.contentType !== 'image/webp') {
      throw new BadRequestException('Upload a PNG, JPEG, or WebP profile image.');
    }
    const content = Buffer.from(input.contentBase64, 'base64');
    if (content.length === 0 || content.length > MAX_DOCUMENT_BYTES) {
      throw new BadRequestException('Upload a profile image up to 512 KB.');
    }
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.requireEditable(tx, user, organizationId, clientId, PERMISSIONS.clientsEdit);
      const id = randomUUID();
      await tx.query(
        `INSERT INTO client_documents (
           id, organization_id, client_id, file_name, content_type, content, created_by,
           storage_key, byte_size, sha256, scan_status, category
         ) VALUES ($1, $2, $3, 'profile', $4, $5, $6, $7, $8, $9, 'not_configured', 'avatar')`,
        [
          id,
          organizationId,
          client.id,
          input.contentType,
          content,
          user.id,
          `private/${organizationId}/clients/${client.id}/avatar/${id}`,
          content.length,
          createHash('sha256').update(content).digest('hex'),
        ],
      );
      await tx.query(`UPDATE clients SET avatar_object_id = $2, updated_at = now() WHERE id = $1`, [client.id, id]);
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action: 'client.avatar_updated',
        targetType: 'client',
        targetId: client.id,
      });
      return { id };
    });
  }

  async avatar(user: AuthUser, clientId: string): Promise<{ contentType: string; content: Buffer }> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.requireView(tx, user, organizationId, clientId, user.role === 'parent' ? PERMISSIONS.parentPortalView : PERMISSIONS.clientsView);
      const rows = await tx.query<{ content_type: string; content: unknown; scan_status: string }>(
        `SELECT d.content_type, d.content, d.scan_status
         FROM clients c
         JOIN client_documents d ON d.id = c.avatar_object_id
         WHERE c.id = $1`,
        [client.id],
      );
      const row = rows[0];
      const content = row ? asBytes(row.content) : null;
      if (!row || !content || row.scan_status === 'rejected') {
        throw new NotFoundException('That profile image was not found.');
      }
      return { contentType: asString(row.content_type), content };
    });
  }

  private async requireView(tx: Queryable, user: AuthUser, organizationId: string, clientId: string, permission: Permission) {
    const client = await this.authorization.findClient(tx, organizationId, clientId);
    await this.authorization.assertClientAccess(tx, user, client, 'view', permission);
    return client;
  }

  private async requireEditable(
    tx: Queryable,
    user: AuthUser,
    organizationId: string,
    clientId: string,
    permission: Permission,
  ) {
    const client = await this.authorization.findClient(tx, organizationId, clientId);
    await this.authorization.assertClientAccess(tx, user, client, 'write', permission);
    return client;
  }

  private async writeGuardian(
    tx: Queryable,
    organizationId: string,
    clientId: string,
    userId: string,
    input: GuardianDto,
    guardianId: string | null,
  ): Promise<string> {
    if (input.linkedUserId) {
      const member = await tx.query(
        `SELECT 1 AS present FROM organization_memberships
         WHERE organization_id = $1 AND user_id = $2 AND role = 'parent' AND status = 'active'`,
        [organizationId, input.linkedUserId],
      );
      if (member.length === 0) {
        throw new BadRequestException('Portal access can only be linked to a parent or guardian membership.');
      }
    }
    const channels = JSON.stringify(input.channels);
    if (guardianId) {
      await tx.query(
        `UPDATE client_guardians
         SET name = $3, relationship = $4, email = $5, phone = $6, channels = $7::jsonb,
             emergency_contact = $8, portal_access = $9, linked_user_id = $10, updated_at = now()
         WHERE id = $1 AND client_id = $2`,
        [guardianId, clientId, input.name.trim(), input.relationship, blank(input.email), blank(input.phone), channels, input.emergencyContact, input.portalAccess, input.linkedUserId ?? null],
      );
      return guardianId;
    }
    const rows = await tx.query<{ id: string }>(
      `INSERT INTO client_guardians (
         organization_id, client_id, name, relationship, email, phone, channels, emergency_contact, portal_access, linked_user_id, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11) RETURNING id`,
      [organizationId, clientId, input.name.trim(), input.relationship, blank(input.email), blank(input.phone), channels, input.emergencyContact, input.portalAccess, input.linkedUserId ?? null, userId],
    );
    return asString(rows[0]?.id);
  }

  private async linkGuardian(tx: Queryable, organizationId: string, clientId: string, linkedUserId: string, actorId: string): Promise<void> {
    await tx.query(
      `INSERT INTO client_assignments (organization_id, client_id, user_id, relationship, created_by)
       VALUES ($1, $2, $3, 'guardian', $4)
       ON CONFLICT (client_id, user_id, relationship) WHERE ended_at IS NULL DO NOTHING`,
      [organizationId, clientId, linkedUserId, actorId],
    );
  }

  private async guardian(tx: Queryable, id: string): Promise<ClientGuardian> {
    const rows = await tx.query<{
      id: string;
      name: string;
      relationship: ClientGuardian['relationship'];
      email: string | null;
      phone: string | null;
      channels: unknown;
      emergency_contact: boolean;
      portal_access: boolean;
      linked_user_id: string | null;
      ended_at: Date | string | null;
    }>(
      `SELECT id, name, relationship, email, phone, channels, emergency_contact, portal_access, linked_user_id, ended_at
       FROM client_guardians WHERE id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) {
      throw new NotFoundException('That guardian record was not found.');
    }
    return {
      id: asString(row.id),
      name: asString(row.name),
      relationship: row.relationship,
      email: row.email ? asString(row.email) : null,
      phone: row.phone ? asString(row.phone) : null,
      channels: parseChannels(row.channels),
      emergencyContact: Boolean(row.emergency_contact),
      portalAccess: Boolean(row.portal_access),
      linkedUserId: row.linked_user_id ? asString(row.linked_user_id) : null,
      endedAt: row.ended_at ? asDate(row.ended_at).toISOString() : null,
    };
  }
}

function blank(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseChannels(value: unknown): ContactChannel[] {
  const parsed = typeof value === 'string' ? JSON.parse(value) as unknown : value;
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter((item): item is ContactChannel => item === 'email' || item === 'phone' || item === 'portal');
}
