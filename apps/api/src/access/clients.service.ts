import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PERMISSIONS,
  type AuthUser,
  type ClientDirectoryPage,
  type ClientDocumentSummary,
  type ClientPlacement,
  type ClientProfile,
  type ClientSummary,
  type ClinicalProfile,
  type DemoSeedResult,
  type StaffOption,
} from '@abapro/shared';
import { recordAudit } from '../common/audit';
import { asBytes, asDate, asString } from '../common/http';
import { DATABASE } from '../db/database.module';
import type { Database, Queryable } from '../db/database';
import { AuthorizationService } from './authorization.service';
import { seedDemoClients } from './client-demo';
import type {
  AmendObservationDto,
  ApprovePhaseDto,
  AssignmentDto,
  ClientListQuery,
  CreateClientDto,
  CreateDocumentDto,
  CreateObservationDto,
  CreateProgramDto,
  CreateTargetDto,
  SensitiveProfileDto,
  ShareRecordDto,
  UpdateClientDto,
} from './access.dto';

const MAX_DOCUMENT_BYTES = 512 * 1024;

@Injectable()
export class ClientsService {
  constructor(
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(DATABASE) private readonly database: Database,
  ) {}

  async list(user: AuthUser, query: ClientListQuery): Promise<ClientDirectoryPage> {
    const page = boundedInt(query.page, 1, 10_000);
    const pageSize = boundedInt(query.pageSize, 20, 50);
    const canSeeDob = user.permissions.includes(PERMISSIONS.clientsSensitiveView);
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const built = directoryFilters(user, organizationId, query);
      const sort = sortClause(query.sort, query.direction);
      const rows = await tx.query<DirectoryRow>(
        `SELECT c.id, c.display_name, c.preferred_name, c.client_code, c.status, c.created_at,
                c.organization_id, o.name AS organization_name, c.clinic_id, clinic.name AS clinic_name,
                c.avatar_object_id IS NOT NULL AS has_avatar,
                ${canSeeDob ? "to_char(c.date_of_birth, 'YYYY-MM-DD')" : 'NULL::text'} AS date_of_birth,
                (SELECT count(*) FROM client_programs p WHERE p.client_id = c.id AND p.status = 'active') AS active_programs,
                (SELECT max(s.started_at) FROM therapy_sessions s WHERE s.client_id = c.id AND s.status = 'completed') AS last_session_at
         FROM clients c
         JOIN organizations o ON o.id = c.organization_id
         LEFT JOIN clinics clinic ON clinic.id = c.clinic_id
         WHERE ${built.where}
         ORDER BY ${sort}
         LIMIT $${built.params.length + 1} OFFSET $${built.params.length + 2}`,
        [...built.params, pageSize, (page - 1) * pageSize],
      );
      const totals = await tx.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM clients c WHERE ${built.where}`,
        built.params,
      );
      const people = await assignmentPeople(tx, rows.map((row) => asString(row.id)));
      return {
        items: rows.map((row) => toDirectoryItem(row, people, canSeeDob)),
        total: Number(totals[0]?.total ?? 0),
        page,
        pageSize,
      };
    });
  }

  async get(user: AuthUser, clientId: string): Promise<ClientProfile> {
    const canSeeDob = user.permissions.includes(PERMISSIONS.clientsSensitiveView);
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.authorization.findClient(tx, organizationId, clientId);
      await this.authorization.assertClientAccess(tx, user, client, 'view', viewPermission(user));
      return this.loadProfile(tx, client.id, canSeeDob, user.role !== 'parent');
    });
  }

  async codeAvailable(user: AuthUser, code: string, exceptClientId?: string, organizationId?: string): Promise<{ available: boolean }> {
    const target = await this.placementOrganization(user, organizationId);
    const rows = await this.database.query(
      `SELECT 1 AS present FROM clients
       WHERE organization_id = $1 AND lower(client_code) = lower($2)
         AND ($3::uuid IS NULL OR id <> $3::uuid)`,
      [target, code.trim(), exceptClientId ?? null],
    );
    return { available: rows.length === 0 };
  }

  async placement(user: AuthUser): Promise<ClientPlacement> {
    const rows = user.platformAdmin
      ? await this.database.query<{ organization_id: string; organization_name: string; clinic_id: string | null; clinic_name: string | null }>(
          `SELECT o.id AS organization_id, o.name AS organization_name, c.id AS clinic_id, c.name AS clinic_name
           FROM organizations o
           LEFT JOIN clinics c ON c.organization_id = o.id
           ORDER BY o.name, c.name`,
        )
      : await this.database.query<{ organization_id: string; organization_name: string; clinic_id: string | null; clinic_name: string | null }>(
          `SELECT o.id AS organization_id, o.name AS organization_name, c.id AS clinic_id, c.name AS clinic_name
           FROM organization_memberships m
           JOIN organizations o ON o.id = m.organization_id
           LEFT JOIN clinics c ON c.organization_id = o.id
           LEFT JOIN clinic_access access ON access.clinic_id = c.id AND access.user_id = m.user_id
           WHERE m.user_id = $1 AND m.status = 'active'
             AND (m.role = 'organization_admin' OR c.id IS NULL OR access.user_id IS NOT NULL)
           ORDER BY o.name, c.name`,
          [user.id],
        );
    const organizations: ClientPlacement['organizations'] = [];
    for (const row of rows) {
      const id = asString(row.organization_id);
      let organization = organizations.find((item) => item.id === id);
      if (!organization) {
        organization = { id, name: asString(row.organization_name), clinics: [] };
        organizations.push(organization);
      }
      if (row.clinic_id) {
        organization.clinics.push({ id: asString(row.clinic_id), name: asString(row.clinic_name) });
      }
    }
    return { organizations };
  }

  private async placementOrganization(user: AuthUser, organizationId?: string): Promise<string> {
    const target = organizationId || user.organization?.id;
    if (!target) {
      throw new BadRequestException('Choose an organisation.');
    }
    if (user.platformAdmin) {
      const rows = await this.database.query(`SELECT 1 AS present FROM organizations WHERE id = $1`, [target]);
      if (rows.length === 0) {
        throw new BadRequestException('Choose an organisation.');
      }
      return target;
    }
    const rows = await this.database.query(
      `SELECT 1 AS present FROM organization_memberships
       WHERE user_id = $1 AND organization_id = $2 AND status = 'active'`,
      [user.id, target],
    );
    if (rows.length === 0) {
      throw new ForbiddenException('You do not have access to this organisation.');
    }
    return target;
  }

  async create(user: AuthUser, input: CreateClientDto): Promise<ClientSummary> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const id = await insertClient(tx, organizationId, user, input);
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action: 'client.created',
        targetType: 'client',
        targetId: id,
      });
      const profile = await this.loadProfile(tx, id, user.permissions.includes(PERMISSIONS.clientsSensitiveView), true);
      return { id: profile.id, displayName: profile.displayName, status: profile.status, clientCode: profile.clientCode };
    });
  }

  async update(user: AuthUser, clientId: string, input: UpdateClientDto): Promise<ClientSummary> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.authorization.findClient(tx, organizationId, clientId);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.clientsEdit);
      const current = await tx.query<{ status: 'active' | 'inactive'; client_code: string }>(
        `SELECT status, client_code FROM clients WHERE id = $1`,
        [client.id],
      );
      const previous = current[0]?.status ?? client.status;
      if (input.status === 'inactive' && previous === 'active' && input.confirmDeactivation !== true) {
        throw new BadRequestException('Confirm deactivation before changing this client to inactive.');
      }
      const code = input.clientCode?.trim();
      if (code && code.toLowerCase() !== asString(current[0]?.client_code).toLowerCase()) {
        await assertCodeAvailable(tx, organizationId, code);
      }
      const dob = dateOfBirthForWrite(user, input.dateOfBirth);
      const clinicId = input.clinicId ? await clinicForWrite(tx, organizationId, user, input.clinicId) : null;
      try {
        await tx.query(
          `UPDATE clients
           SET display_name = $2,
               client_code = COALESCE($3, client_code),
               preferred_name = CASE WHEN $4::boolean THEN $5 ELSE preferred_name END,
               language = CASE WHEN $6::boolean THEN $7 ELSE language END,
               timezone = CASE WHEN $8::boolean THEN $9 ELSE timezone END,
               date_of_birth = CASE WHEN $10::boolean THEN $11::date ELSE date_of_birth END,
               status = $12,
               clinic_id = CASE WHEN $13::boolean THEN $14::uuid ELSE clinic_id END,
               updated_at = now()
           WHERE id = $1`,
          [
            client.id,
            input.displayName.trim(),
            code || null,
            input.preferredName !== undefined,
            blankToNull(input.preferredName),
            input.language !== undefined,
            blankToNull(input.language),
            input.timezone !== undefined,
            normalizeTimezone(input.timezone),
            dob.allowed && input.dateOfBirth !== undefined,
            dob.value,
            input.status,
            input.clinicId !== undefined,
            clinicId,
          ],
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException('That client identifier is already used in this organization.');
        }
        throw error;
      }
      const action = input.status === 'inactive' && previous === 'active'
        ? 'client.deactivated'
        : input.status === 'active' && previous === 'inactive'
          ? 'client.reactivated'
          : 'client.updated';
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action,
        targetType: 'client',
        targetId: client.id,
      });
      return { id: client.id, displayName: input.displayName.trim(), status: input.status, clientCode: code || asString(current[0]?.client_code) };
    });
  }

  async remove(user: AuthUser, clientId: string): Promise<never> {
    await this.authorization.requireClient(user, clientId, 'write', PERMISSIONS.clientsEdit);
    throw new ConflictException('Clients are not deleted. Deactivate the client to preserve clinical history.');
  }

  async seedDemo(user: AuthUser): Promise<DemoSeedResult> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const created = await seedDemoClients(tx, organizationId, user.id);
      return { created };
    });
  }

  async assignees(user: AuthUser): Promise<StaffOption[]> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const rows = await tx.query<{ id: string; name: string; role: string }>(
        `SELECT u.id, u.name, m.role
         FROM organization_memberships m
         JOIN users u ON u.id = m.user_id
         WHERE m.organization_id = $1 AND m.status = 'active'
           AND m.role IN ('therapist', 'clinical_supervisor')
         ORDER BY u.name`,
        [organizationId],
      );
      return rows.map((row) => ({ id: asString(row.id), name: asString(row.name), role: asString(row.role) }));
    });
  }

  async parentMembers(user: AuthUser): Promise<StaffOption[]> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const rows = await tx.query<{ id: string; name: string; email: string }>(
        `SELECT u.id, u.name, u.email
         FROM organization_memberships m
         JOIN users u ON u.id = m.user_id
         WHERE m.organization_id = $1 AND m.status = 'active' AND m.role = 'parent'
         ORDER BY u.name`,
        [organizationId],
      );
      return rows.map((row) => ({
        id: asString(row.id),
        name: asString(row.name),
        role: 'parent',
        email: asString(row.email),
      }));
    });
  }

  async endAssignment(user: AuthUser, clientId: string, assignmentId: string): Promise<{ id: string }> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.authorization.findClient(tx, organizationId, clientId);
      const rows = await tx.query<{ id: string; relationship: 'therapist' | 'supervisor' | 'guardian' }>(
        `SELECT id, relationship FROM client_assignments
         WHERE id = $1 AND client_id = $2 AND ended_at IS NULL`,
        [assignmentId, client.id],
      );
      const assignment = rows[0];
      if (!assignment) {
        throw new NotFoundException('That assignment was not found.');
      }
      const permission = assignment.relationship === 'guardian' ? PERMISSIONS.guardiansManage : PERMISSIONS.assignmentsManage;
      await this.authorization.assertClientAccess(tx, user, client, 'write', permission);
      await tx.query(`UPDATE client_assignments SET ended_at = now() WHERE id = $1`, [assignment.id]);
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action: 'client.assignment_ended',
        targetType: 'client',
        targetId: client.id,
        metadata: { assignmentId: asString(assignment.id), relationship: assignment.relationship },
      });
      return { id: asString(assignment.id) };
    });
  }

  async sensitive(user: AuthUser, clientId: string): Promise<ClinicalProfile> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.authorization.findClient(tx, organizationId, clientId);
      await this.authorization.assertClientAccess(tx, user, client, 'sensitive', PERMISSIONS.clientsSensitiveView);
      const rows = await tx.query<{
        summary: string;
        medical_history: string;
        allergies: string;
        precautions: string;
        communication_preferences: string;
      }>(
        `SELECT summary, medical_history, allergies, precautions, communication_preferences
         FROM client_sensitive_profiles WHERE client_id = $1`,
        [client.id],
      );
      const row = rows[0];
      return {
        medicalHistory: row ? asString(row.medical_history) : '',
        allergies: row ? asString(row.allergies) : '',
        precautions: row ? asString(row.precautions) : '',
        communicationPreferences: row ? asString(row.communication_preferences) : '',
        summary: row ? asString(row.summary) : '',
      };
    });
  }

  async saveSensitive(user: AuthUser, clientId: string, input: SensitiveProfileDto): Promise<ClinicalProfile> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.authorization.findClient(tx, organizationId, clientId);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.clientsEdit);
      if (!user.permissions.includes(PERMISSIONS.clientsSensitiveView)) {
        throw new BadRequestException('Sensitive information requires permission to view it as well.');
      }
      const profile = {
        medicalHistory: input.medicalHistory?.trim() ?? '',
        allergies: input.allergies?.trim() ?? '',
        precautions: input.precautions?.trim() ?? '',
        communicationPreferences: input.communicationPreferences?.trim() ?? '',
        summary: input.summary?.trim() ?? '',
      };
      await tx.query(
        `INSERT INTO client_sensitive_profiles (
           client_id, organization_id, summary, medical_history, allergies, precautions, communication_preferences
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (client_id) DO UPDATE SET
           summary = EXCLUDED.summary,
           medical_history = EXCLUDED.medical_history,
           allergies = EXCLUDED.allergies,
           precautions = EXCLUDED.precautions,
           communication_preferences = EXCLUDED.communication_preferences,
           updated_at = now()`,
        [
          client.id,
          organizationId,
          profile.summary,
          profile.medicalHistory,
          profile.allergies,
          profile.precautions,
          profile.communicationPreferences,
        ],
      );
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action: 'client.sensitive_updated',
        targetType: 'client',
        targetId: client.id,
      });
      return profile;
    });
  }

  async assign(user: AuthUser, clientId: string, input: AssignmentDto): Promise<{ id: string }> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.authorization.findClient(tx, organizationId, clientId);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.assignmentsManage);
      await this.assertAssignableMember(tx, organizationId, input.userId, input.relationship);
      const rows = await tx.query<{ id: string }>(
        `INSERT INTO client_assignments (organization_id, client_id, user_id, relationship, created_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (client_id, user_id, relationship) WHERE ended_at IS NULL
         DO UPDATE SET created_by = EXCLUDED.created_by
         RETURNING id`,
        [organizationId, client.id, input.userId, input.relationship, user.id],
      );
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action: 'client.assignment_changed',
        targetType: 'client',
        targetId: client.id,
        metadata: { userId: input.userId, relationship: input.relationship },
      });
      return { id: asString(rows[0]?.id) };
    });
  }

  async share(user: AuthUser, clientId: string, input: ShareRecordDto): Promise<{ id: string }> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.authorization.findClient(tx, organizationId, clientId);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.guardiansManage);
      const guardian = await tx.query(
        `SELECT 1 AS present FROM client_assignments
         WHERE client_id = $1 AND user_id = $2 AND relationship = 'guardian' AND ended_at IS NULL`,
        [client.id, input.sharedWithUserId],
      );
      if (guardian.length === 0) {
        throw new BadRequestException('Records can only be shared with a linked parent or guardian.');
      }
      const rows = await tx.query<{ id: string }>(
        `INSERT INTO shared_records (organization_id, client_id, record_type, record_id, shared_with_user_id, shared_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (record_type, record_id, shared_with_user_id) DO UPDATE SET shared_by = EXCLUDED.shared_by
         RETURNING id`,
        [organizationId, client.id, input.recordType, input.recordId, input.sharedWithUserId, user.id],
      );
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action: 'client.record_shared',
        targetType: input.recordType,
        targetId: input.recordId,
        metadata: { clientId: client.id, sharedWithUserId: input.sharedWithUserId },
      });
      return { id: asString(rows[0]?.id) };
    });
  }

  async addDocument(user: AuthUser, clientId: string, input: CreateDocumentDto): Promise<ClientDocumentSummary> {
    const content = decodeDocument(input.contentType, input.contentBase64);
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.authorization.findClient(tx, organizationId, clientId);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.documentsUpload);
      const id = randomUUID();
      const storageKey = `private/${organizationId}/clients/${client.id}/documents/${id}`;
      const rows = await tx.query<{ created_at: Date | string }>(
        `INSERT INTO client_documents (
           id, organization_id, client_id, file_name, content_type, content, created_by,
           storage_key, byte_size, sha256, scan_status, category
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'not_configured', $11)
         RETURNING created_at`,
        [
          id,
          organizationId,
          client.id,
          input.fileName.trim(),
          input.contentType,
          content,
          user.id,
          storageKey,
          content.length,
          createHash('sha256').update(content).digest('hex'),
          input.category ?? 'record',
        ],
      );
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action: 'client.document_uploaded',
        targetType: 'document',
        targetId: id,
        metadata: { clientId: client.id },
      });
      return {
        id,
        fileName: input.fileName.trim(),
        contentType: input.contentType,
        createdAt: asDate(rows[0]?.created_at).toISOString(),
      };
    });
  }

  async document(user: AuthUser, clientId: string, documentId: string): Promise<{ contentType: string; fileName: string; content: Buffer }> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.authorization.findClient(tx, organizationId, clientId);
      await this.authorization.assertClientAccess(
        tx,
        user,
        client,
        user.role === 'parent' ? 'record' : 'view',
        PERMISSIONS.documentsDownload,
        documentId,
      );
      if (user.role !== 'parent' && !user.permissions.includes(PERMISSIONS.documentsDownload)) {
        throw new ForbiddenException('You do not have access to this resource.');
      }
      const rows = await tx.query<{ file_name: string; content_type: string; content: unknown; scan_status: string }>(
        `SELECT file_name, content_type, content, scan_status FROM client_documents WHERE id = $1 AND client_id = $2`,
        [documentId, client.id],
      );
      const row = rows[0];
      const content = row ? asBytes(row.content) : null;
      if (!row || !content) {
        throw new NotFoundException('That document was not found.');
      }
      if (row.scan_status === 'rejected') {
        throw new ForbiddenException('That file did not pass the upload check.');
      }
      return { fileName: asString(row.file_name), contentType: asString(row.content_type), content };
    });
  }

  async addObservation(user: AuthUser, clientId: string, input: CreateObservationDto): Promise<{ id: string }> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.authorization.findClient(tx, organizationId, clientId);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.observationsRecord);
      const rows = await tx.query<{ id: string }>(
        `INSERT INTO clinical_observations (organization_id, client_id, note, recorded_by)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [organizationId, client.id, input.note.trim(), user.id],
      );
      const id = asString(rows[0]?.id);
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action: 'observation.recorded',
        targetType: 'observation',
        targetId: id,
        metadata: { clientId: client.id },
      });
      return { id };
    });
  }

  async amendObservation(user: AuthUser, clientId: string, observationId: string, input: AmendObservationDto): Promise<{ id: string }> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.authorization.findClient(tx, organizationId, clientId);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.observationsAmend);
      const rows = await tx.query<{ id: string }>(
        `UPDATE clinical_observations
         SET note = $3, amended_by = $4, amended_at = now()
         WHERE id = $1 AND client_id = $2
         RETURNING id`,
        [observationId, client.id, input.note.trim(), user.id],
      );
      if (rows.length === 0) {
        throw new BadRequestException('That observation was not found.');
      }
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action: 'observation.amended',
        targetType: 'observation',
        targetId: observationId,
        metadata: { clientId: client.id },
      });
      return { id: observationId };
    });
  }

  async addProgram(user: AuthUser, clientId: string, input: CreateProgramDto): Promise<{ id: string }> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.authorization.findClient(tx, organizationId, clientId);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.programsEdit);
      const rows = await tx.query<{ id: string }>(
        `INSERT INTO client_programs (organization_id, client_id, name, status, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [organizationId, client.id, input.name.trim(), input.status ?? 'active', user.id],
      );
      const id = asString(rows[0]?.id);
      await tx.query(
        `INSERT INTO program_configuration_versions (
           organization_id, program_id, version, measurement_type, mastery_criteria, teaching_procedure, reason, created_by
         ) VALUES ($1, $2, 1, 'frequency', '', '', 'Initial configuration', $3)`,
        [organizationId, id, user.id],
      );
      return { id };
    });
  }

  async addTarget(user: AuthUser, clientId: string, input: CreateTargetDto): Promise<{ id: string }> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.authorization.findClient(tx, organizationId, clientId);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.targetsEdit);
      const program = await tx.query(
        `SELECT 1 AS present FROM client_programs WHERE id = $1 AND client_id = $2`,
        [input.programId, client.id],
      );
      if (program.length === 0) {
        throw new BadRequestException('That program was not found.');
      }
      const rows = await tx.query<{ id: string }>(
        `INSERT INTO client_targets (organization_id, client_id, program_id, name, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [organizationId, client.id, input.programId, input.name.trim(), user.id],
      );
      const id = asString(rows[0]?.id);
      await tx.query(
        `INSERT INTO target_configuration_versions (
           organization_id, target_id, version, measurement_method, mastery_criteria, baseline_note, prompt_hierarchy, teaching_instructions, reason, created_by
         ) VALUES ($1, $2, 1, 'frequency', '', '', '', '', 'Initial configuration', $3)`,
        [organizationId, id, user.id],
      );
      return { id };
    });
  }

  async approvePhase(user: AuthUser, clientId: string, targetId: string, input: ApprovePhaseDto): Promise<{ id: string; phase: string }> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.authorization.findClient(tx, organizationId, clientId);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.phasesApprove);
      const rows = await tx.query<{ id: string }>(
        `UPDATE client_targets SET phase = $3 WHERE id = $1 AND client_id = $2 RETURNING id`,
        [targetId, client.id, input.phase],
      );
      if (rows.length === 0) {
        throw new BadRequestException('That target was not found.');
      }
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action: 'target.phase_approved',
        targetType: 'target',
        targetId,
        metadata: { clientId: client.id, phase: input.phase },
      });
      return { id: targetId, phase: input.phase };
    });
  }

  private async assertAssignableMember(
    tx: Queryable,
    organizationId: string,
    userId: string,
    relationship: 'therapist' | 'supervisor' | 'guardian',
  ): Promise<void> {
    const rows = await tx.query<{ role: string }>(
      `SELECT role FROM organization_memberships
       WHERE organization_id = $1 AND user_id = $2 AND status = 'active'`,
      [organizationId, userId],
    );
    const role = rows[0]?.role;
    if (!role) {
      throw new BadRequestException('That person is not an active member of this organization.');
    }
    if (relationship === 'guardian' && role !== 'parent') {
      throw new BadRequestException('Guardian access can only be linked to a parent or guardian membership.');
    }
    if (relationship === 'supervisor' && role !== 'clinical_supervisor') {
      throw new BadRequestException('A clinical supervisor assignment requires a supervisor membership.');
    }
    if (relationship === 'therapist' && role !== 'therapist' && role !== 'clinical_supervisor') {
      throw new BadRequestException('Treatment access can only be linked to a therapist or supervisor.');
    }
  }

  private async loadProfile(tx: Queryable, clientId: string, canSeeDob: boolean, includePortalAccess: boolean): Promise<ClientProfile> {
    const rows = await tx.query<ProfileRow>(
      `SELECT clients.id, clients.display_name, clients.preferred_name, clients.client_code, clients.language, clients.timezone, clients.status,
              clients.organization_id, o.name AS organization_name, clients.clinic_id, clinic.name AS clinic_name,
              clients.avatar_object_id IS NOT NULL AS has_avatar,
              ${canSeeDob ? "to_char(clients.date_of_birth, 'YYYY-MM-DD')" : 'NULL::text'} AS date_of_birth,
              clients.created_at, clients.updated_at,
              (SELECT count(*) FROM client_programs p WHERE p.client_id = clients.id AND p.status = 'active') AS active_programs,
              (SELECT max(started_at) FROM therapy_sessions s WHERE s.client_id = clients.id AND s.status = 'completed') AS last_session_at
       FROM clients
       JOIN organizations o ON o.id = clients.organization_id
       LEFT JOIN clinics clinic ON clinic.id = clients.clinic_id
       WHERE clients.id = $1`,
      [clientId],
    );
    const row = rows[0];
    if (!row) {
      throw new NotFoundException('That client was not found.');
    }
    const assignments = await tx.query<{
      id: string;
      user_id: string;
      name: string;
      relationship: 'therapist' | 'supervisor' | 'guardian';
      ended_at: Date | string | null;
    }>(
      `SELECT a.id, a.user_id, u.name, a.relationship, a.ended_at
       FROM client_assignments a
       JOIN users u ON u.id = a.user_id
       WHERE a.client_id = $1
       ORDER BY a.ended_at NULLS FIRST, u.name`,
      [clientId],
    );
    const guardians = await tx.query<GuardianRow>(
      `SELECT id, name, relationship, email, phone, channels, emergency_contact, portal_access, linked_user_id, ended_at
       FROM client_guardians WHERE client_id = $1 ORDER BY ended_at NULLS FIRST, name`,
      [clientId],
    );
    const active = assignments.filter((item) => !item.ended_at);
    const therapists = active
      .filter((item) => item.relationship === 'therapist')
      .map((item) => ({ id: asString(item.user_id), name: asString(item.name) }));
    const supervisorRow = active.find((item) => item.relationship === 'supervisor');
    const profile: ClientProfile = {
      id: asString(row.id),
      organizationId: asString(row.organization_id),
      organizationName: asString(row.organization_name),
      clinicId: row.clinic_id ? asString(row.clinic_id) : null,
      clinicName: row.clinic_name ? asString(row.clinic_name) : null,
      displayName: asString(row.display_name),
      preferredName: row.preferred_name ? asString(row.preferred_name) : null,
      clientCode: asString(row.client_code),
      initials: initials(row.preferred_name ? asString(row.preferred_name) : asString(row.display_name)),
      hasAvatar: Boolean(row.has_avatar),
      language: row.language ? asString(row.language) : null,
      timezone: row.timezone ? asString(row.timezone) : null,
      status: row.status,
      createdAt: asDate(row.created_at).toISOString(),
      updatedAt: asDate(row.updated_at).toISOString(),
      therapists,
      supervisor: supervisorRow ? { id: asString(supervisorRow.user_id), name: asString(supervisorRow.name) } : null,
      assignments: assignments.map((item) => ({
        id: asString(item.id),
        userId: asString(item.user_id),
        name: asString(item.name),
        relationship: item.relationship,
        endedAt: item.ended_at ? asDate(item.ended_at).toISOString() : null,
      })),
      guardians: guardians.map((item) => ({
        id: asString(item.id),
        name: asString(item.name),
        relationship: item.relationship,
        email: item.email ? asString(item.email) : null,
        phone: item.phone ? asString(item.phone) : null,
        channels: asChannels(item.channels),
        emergencyContact: Boolean(item.emergency_contact),
        portalAccess: includePortalAccess ? Boolean(item.portal_access) : false,
        linkedUserId: includePortalAccess && item.linked_user_id ? asString(item.linked_user_id) : null,
        endedAt: item.ended_at ? asDate(item.ended_at).toISOString() : null,
      })),
      activeProgramCount: Number(row.active_programs ?? 0),
      lastSessionAt: row.last_session_at ? asDate(row.last_session_at).toISOString() : null,
    };
    if (canSeeDob) {
      profile.dateOfBirth = row.date_of_birth ? asString(row.date_of_birth) : null;
    }
    return profile;
  }
}

function viewPermission(user: AuthUser) {
  return user.role === 'parent' ? PERMISSIONS.parentPortalView : PERMISSIONS.clientsView;
}

interface DirectoryRow {
  [key: string]: unknown;
  id: string;
  display_name: string;
  preferred_name: string | null;
  client_code: string;
  organization_id: string;
  organization_name: string;
  clinic_id: string | null;
  clinic_name: string | null;
  status: 'active' | 'inactive';
  created_at: Date | string;
  has_avatar: boolean;
  date_of_birth: string | null;
  active_programs: number | string;
  last_session_at: Date | string | null;
}

interface ProfileRow extends DirectoryRow {
  language: string | null;
  timezone: string | null;
  organization_id: string;
  organization_name: string;
  clinic_id: string | null;
  clinic_name: string | null;
  updated_at: Date | string;
}

interface GuardianRow {
  [key: string]: unknown;
  id: string;
  name: string;
  relationship: ClientProfile['guardians'][number]['relationship'];
  email: string | null;
  phone: string | null;
  channels: unknown;
  emergency_contact: boolean;
  portal_access: boolean;
  linked_user_id: string | null;
  ended_at: Date | string | null;
}

function directoryFilters(user: AuthUser, organizationId: string, query: ClientListQuery): { where: string; params: unknown[] } {
  const params: unknown[] = [organizationId];
  const clauses = ['c.organization_id = $1'];
  if (user.role === 'therapist' || user.role === 'parent' || user.role === 'platform_admin') {
    params.push(user.id);
    const userParam = `$${params.length}`;
    if (user.role === 'therapist') {
      clauses.push(`EXISTS (
        SELECT 1 FROM client_assignments a
        WHERE a.client_id = c.id AND a.user_id = ${userParam} AND a.relationship = 'therapist' AND a.ended_at IS NULL
      )`);
    } else if (user.role === 'parent') {
      clauses.push(`EXISTS (
        SELECT 1 FROM client_assignments a
        WHERE a.client_id = c.id AND a.user_id = ${userParam} AND a.relationship = 'guardian' AND a.ended_at IS NULL
      )`);
    } else {
      clauses.push(`EXISTS (
        SELECT 1 FROM exceptional_access_grants g
        WHERE g.client_id = c.id AND g.grantee_user_id = ${userParam}
          AND g.revoked_at IS NULL AND g.expires_at > now()
          AND g.permissions @> '["clients.view"]'::jsonb
      )`);
    }
  }
  if (query.status) {
    params.push(query.status);
    clauses.push(`c.status = $${params.length}`);
  }
  const search = query.q?.trim();
  if (search) {
    params.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
    const like = `$${params.length}`;
    clauses.push(`(c.display_name ILIKE ${like} ESCAPE '\\' OR c.preferred_name ILIKE ${like} ESCAPE '\\' OR c.client_code ILIKE ${like} ESCAPE '\\')`);
  }
  if (query.therapistId) {
    params.push(query.therapistId);
    clauses.push(`EXISTS (
      SELECT 1 FROM client_assignments a
      WHERE a.client_id = c.id AND a.user_id = $${params.length} AND a.relationship = 'therapist' AND a.ended_at IS NULL
    )`);
  }
  if (query.supervisorId) {
    params.push(query.supervisorId);
    clauses.push(`EXISTS (
      SELECT 1 FROM client_assignments a
      WHERE a.client_id = c.id AND a.user_id = $${params.length} AND a.relationship = 'supervisor' AND a.ended_at IS NULL
    )`);
  }
  if (query.programStatus) {
    params.push(query.programStatus);
    clauses.push(`EXISTS (
      SELECT 1 FROM client_programs p WHERE p.client_id = c.id AND p.status = $${params.length}
    )`);
  }
  return { where: clauses.join(' AND '), params };
}

function sortClause(sort: ClientListQuery['sort'], direction: ClientListQuery['direction']): string {
  const columns: Record<NonNullable<ClientListQuery['sort']>, string> = {
    name: 'c.display_name',
    code: 'c.client_code',
    status: 'c.status',
    created: 'c.created_at',
    session: 'last_session_at',
    programs: 'active_programs',
  };
  const column = columns[sort ?? 'name'];
  const order = direction === 'desc' ? 'DESC' : 'ASC';
  return `${column} ${order} NULLS LAST, c.display_name ASC`;
}

async function assignmentPeople(tx: Queryable, clientIds: string[]): Promise<Map<string, { therapists: Array<{ id: string; name: string }>; supervisor: { id: string; name: string } | null }>> {
  const grouped = new Map<string, { therapists: Array<{ id: string; name: string }>; supervisor: { id: string; name: string } | null }>();
  for (const id of clientIds) {
    grouped.set(id, { therapists: [], supervisor: null });
  }
  if (clientIds.length === 0) {
    return grouped;
  }
  const rows = await tx.query<{ client_id: string; user_id: string; name: string; relationship: string }>(
    `SELECT a.client_id, a.user_id, u.name, a.relationship
     FROM client_assignments a
     JOIN users u ON u.id = a.user_id
     WHERE a.client_id = ANY($1::uuid[]) AND a.ended_at IS NULL AND a.relationship IN ('therapist', 'supervisor')
     ORDER BY u.name`,
    [clientIds],
  );
  for (const row of rows) {
    const bucket = grouped.get(asString(row.client_id));
    if (!bucket) continue;
    const person = { id: asString(row.user_id), name: asString(row.name) };
    if (row.relationship === 'supervisor' && !bucket.supervisor) {
      bucket.supervisor = person;
    }
    if (row.relationship === 'therapist') {
      bucket.therapists.push(person);
    }
  }
  return grouped;
}

function toDirectoryItem(
  row: DirectoryRow,
  people: Map<string, { therapists: Array<{ id: string; name: string }>; supervisor: { id: string; name: string } | null }>,
  canSeeDob: boolean,
): ClientDirectoryPage['items'][number] {
  const assigned = people.get(asString(row.id)) ?? { therapists: [], supervisor: null };
  const item: ClientDirectoryPage['items'][number] = {
    id: asString(row.id),
    displayName: asString(row.display_name),
    preferredName: row.preferred_name ? asString(row.preferred_name) : null,
    clientCode: asString(row.client_code),
    organizationId: asString(row.organization_id),
    organizationName: asString(row.organization_name),
    clinicId: row.clinic_id ? asString(row.clinic_id) : null,
    clinicName: row.clinic_name ? asString(row.clinic_name) : null,
    initials: initials(row.preferred_name ? asString(row.preferred_name) : asString(row.display_name)),
    hasAvatar: Boolean(row.has_avatar),
    therapists: assigned.therapists,
    supervisor: assigned.supervisor,
    status: row.status,
    activeProgramCount: Number(row.active_programs ?? 0),
    lastSessionAt: row.last_session_at ? asDate(row.last_session_at).toISOString() : null,
    createdAt: asDate(row.created_at).toISOString(),
  };
  if (canSeeDob) {
    item.dateOfBirth = row.date_of_birth ? asString(row.date_of_birth) : null;
  }
  return item;
}

async function insertClient(tx: Queryable, organizationId: string, user: AuthUser, input: CreateClientDto): Promise<string> {
  const supplied = input.clientCode?.trim();
  const attempts = supplied ? [supplied] : [generatedCode(), generatedCode(), generatedCode(), generatedCode(), generatedCode()];
  let lastError: unknown;
  for (const code of attempts) {
    try {
      if (supplied) {
        await assertCodeAvailable(tx, organizationId, supplied);
      }
      const dob = dateOfBirthForWrite(user, input.dateOfBirth);
      const clinicId = await clinicForWrite(tx, organizationId, user, input.clinicId);
      const rows = await tx.query<{ id: string }>(
        `INSERT INTO clients (
           organization_id, clinic_id, display_name, client_code, preferred_name, language, timezone, date_of_birth, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $8::boolean THEN $9::date ELSE NULL END, $10)
         RETURNING id`,
        [
          organizationId,
          clinicId,
          input.displayName.trim(),
          code,
          blankToNull(input.preferredName),
          blankToNull(input.language),
          normalizeTimezone(input.timezone),
          dob.allowed,
          dob.value,
          user.id,
        ],
      );
      return asString(rows[0]?.id);
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      if (supplied) {
        throw new ConflictException('That client identifier is already used in this organization.');
      }
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new ConflictException('A client identifier could not be reserved.');
}

async function clinicForWrite(tx: Queryable, organizationId: string, user: AuthUser, clinicId?: string): Promise<string | null> {
  const chosen = clinicId?.trim() || user.clinic?.id || '';
  if (!chosen) {
    return null;
  }
  const rows = await tx.query(`SELECT id FROM clinics WHERE id = $1 AND organization_id = $2`, [chosen, organizationId]);
  if (rows.length === 0) {
    throw new BadRequestException('Choose a clinic in this organisation.');
  }
  if (!user.platformAdmin && user.role !== 'organization_admin') {
    const access = await tx.query(
      `SELECT 1 AS present FROM clinic_access WHERE clinic_id = $1 AND user_id = $2`,
      [chosen, user.id],
    );
    if (access.length === 0) {
      throw new ForbiddenException('You do not have access to this clinic.');
    }
  }
  return chosen;
}

async function assertCodeAvailable(tx: Queryable, organizationId: string, code: string): Promise<void> {
  const existing = await tx.query(
    `SELECT 1 AS present FROM clients WHERE organization_id = $1 AND lower(client_code) = lower($2)`,
    [organizationId, code],
  );
  if (existing.length > 0) {
    throw new ConflictException('That client identifier is already used in this organization.');
  }
}

function dateOfBirthForWrite(user: AuthUser, value: string | undefined): { allowed: boolean; value: string | null } {
  if (!user.permissions.includes(PERMISSIONS.clientsSensitiveView)) {
    return { allowed: false, value: null };
  }
  if (!value) {
    return { allowed: true, value: null };
  }
  const day = value.slice(0, 10);
  if (day > new Date().toISOString().slice(0, 10) || day < '1900-01-01') {
    throw new BadRequestException('Enter a date of birth between 1900 and today.');
  }
  return { allowed: true, value: day };
}

function normalizeTimezone(value: string | undefined): string | null {
  const timezone = blankToNull(value);
  if (!timezone) {
    return null;
  }
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    throw new BadRequestException('Enter a valid time zone, such as America/Chicago.');
  }
  return timezone;
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function boundedInt(value: unknown, fallback: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function generatedCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return `C-${[...randomBytes(6)].map((byte) => alphabet[byte % alphabet.length]).join('')}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
  return letters || '?';
}

function asChannels(value: unknown): ClientProfile['guardians'][number]['channels'] {
  const parsed = typeof value === 'string' ? JSON.parse(value) as unknown : value;
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter((item): item is 'email' | 'phone' | 'portal' => item === 'email' || item === 'phone' || item === 'portal');
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const code = 'code' in error ? String((error as { code: unknown }).code) : '';
  if (code === '23505') {
    return true;
  }
  const message = error instanceof Error ? error.message : '';
  return /duplicate key|unique constraint/i.test(message);
}

const DOCUMENT_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);

function decodeDocument(contentType: string, contentBase64: string): Buffer {
  if (!DOCUMENT_TYPES.has(contentType)) {
    throw new BadRequestException('Upload a PDF, PNG, JPEG, or WebP file.');
  }
  const content = Buffer.from(contentBase64, 'base64');
  if (content.length === 0 || content.length > MAX_DOCUMENT_BYTES) {
    throw new BadRequestException('Upload a document up to 512 KB.');
  }
  return content;
}
