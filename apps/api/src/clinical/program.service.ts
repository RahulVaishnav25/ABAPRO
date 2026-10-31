import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  PERMISSIONS,
  type AuthUser,
  type CareStatus,
  type MeasurementMethod,
  type MeasurementProcedure,
  type ProgramDetail,
  type ProgramSummary,
  type ProgramWrite,
  type TargetListItem,
  type TargetStatus,
  type TargetSummary,
  type TargetWrite,
} from '@abapro/shared';
import { recordAudit } from '../common/audit';
import { recordChangeReason, requireReason } from '../common/clinical-change';
import { asDate, asNullableNumber, asString } from '../common/http';
import type { Queryable } from '../db/database';
import { AuthorizationService, assignmentScope, type ClientRecord } from '../access/authorization.service';

@Injectable()
export class ProgramService {
  constructor(@Inject(AuthorizationService) private readonly authorization: AuthorizationService) {}

  async list(user: AuthUser, clientId?: string): Promise<ProgramSummary[]> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const params: unknown[] = [organizationId];
      let clientClause = '';
      if (clientId) {
        const client = await this.authorization.findAccessibleClient(tx, user, organizationId, clientId, 'view', PERMISSIONS.programsView);
        params.push(client.id);
        clientClause = `AND p.client_id = $${params.length}`;
      }
      const scope = assignmentScope(user, 'p.client_id', params);
      const rows = await tx.query<{
        id: string;
        client_id: string;
        client_name: string;
        name: string;
        domain: string | null;
        date_implemented: string | null;
        date_mastered: string | null;
        status: ProgramSummary['status'];
        measurement_type: MeasurementMethod;
        measurement_procedure: MeasurementProcedure | null;
        target_count: number | string;
        review_on: string | null;
      }>(
        `SELECT p.id, p.client_id, c.display_name AS client_name, p.name, p.domain,
                to_char(p.date_implemented, 'YYYY-MM-DD') AS date_implemented,
                to_char(p.date_mastered, 'YYYY-MM-DD') AS date_mastered,
                p.status, p.measurement_type, p.measurement_procedure,
                (SELECT count(*) FROM client_targets t WHERE t.program_id = p.id) AS target_count,
                to_char(p.review_on, 'YYYY-MM-DD') AS review_on
         FROM client_programs p
         JOIN clients c ON c.id = p.client_id
         WHERE p.organization_id = $1 ${clientClause} ${scope && `AND ${scope}`}
         ORDER BY c.display_name, p.name`,
        params,
      );
      return rows.map((row) => ({
        id: asString(row.id),
        clientId: asString(row.client_id),
        clientName: asString(row.client_name),
        title: asString(row.name),
        domain: row.domain ? asString(row.domain) : undefined,
        dateImplemented: row.date_implemented ? asString(row.date_implemented) : null,
        dateMastered: row.date_mastered ? asString(row.date_mastered) : null,
        status: row.status,
        measurementType: row.measurement_type,
        measurementProcedure: (row.measurement_procedure as MeasurementProcedure | null) || (row.measurement_type === 'trial' ? 'Step by Step' : 'Probe'),
        targetCount: Number(row.target_count ?? 0),
        reviewOn: row.review_on ? asString(row.review_on) : null,
      }));
    });
  }

  async get(user: AuthUser, programId: string): Promise<ProgramDetail> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => this.load(tx, user, organizationId, programId));
  }

  async listTargets(user: AuthUser, programId?: string): Promise<TargetListItem[]> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const params: unknown[] = [organizationId];
      let programClause = '';
      if (programId) {
        const program = await this.programRow(tx, organizationId, programId);
        await this.authorization.findAccessibleClient(tx, user, organizationId, program.client_id, 'view', PERMISSIONS.programsView);
        params.push(programId);
        programClause = `AND t.program_id = $${params.length}`;
      }
      const scope = assignmentScope(user, 'p.client_id', params);
      return queryTargets(tx, `p.organization_id = $1 ${programClause} ${scope && `AND ${scope}`}`, params);
    });
  }

  async getTarget(user: AuthUser, targetId: string): Promise<TargetListItem> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const [target] = await queryTargets(tx, 'p.organization_id = $1 AND t.id = $2', [organizationId, targetId]);
      if (!target) throw new NotFoundException('That target was not found.');
      await this.authorization.findAccessibleClient(tx, user, organizationId, target.clientId, 'view', PERMISSIONS.programsView);
      return target;
    });
  }

  async create(user: AuthUser, input: ProgramWrite): Promise<ProgramDetail> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.authorization.findAccessibleClient(tx, user, organizationId, input.clientId, 'write', PERMISSIONS.programsEdit);
      const measurement = normalizeProgramMeasurement(input.measurementType, input.measurementProcedure, input.expectedTrialCount);
      if (input.assessmentId) {
        await assertAssessment(tx, organizationId, client.id, input.assessmentId);
      }
      const id = randomUUID();
      const domain = input.domain?.trim() || 'General';
      const dateImplemented = input.dateImplemented || null;
      const dateMastered = input.dateMastered || null;
      const assessmentType = input.assessmentType?.trim() || null;
      const sd = input.sd?.trim() ?? '';
      const masterySteps = input.masterySteps?.trim() ?? '';
      const errorCorrectionProcedure = input.errorCorrectionProcedure?.trim() ?? '';
      const teachingMethod = input.teachingMethod?.trim() ?? '';
      const netTeachingIdea = input.netTeachingIdea?.trim() ?? '';
      const masteryCriteria = input.masteryCriteria?.trim() ?? '';

      await tx.query(
        `INSERT INTO client_programs (
           id, organization_id, client_id, name, description, objective, assessment_id, teaching_procedure,
           date_implemented, review_on, status, measurement_type, expected_trial_count,
           mastery_criteria, notes, created_by,
           domain, date_mastered, assessment_type, sd, mastery_steps,
           error_correction_procedure, teaching_method, net_teaching_idea, measurement_procedure
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`,
        [
          id, organizationId, client.id, input.title.trim(), input.description?.trim() ?? '', input.objective?.trim() ?? '',
          input.assessmentId ?? null, input.teachingProcedure?.trim() ?? '', dateImplemented, input.reviewOn || null,
          'in_treatment', measurement.method, measurement.trials,
          masteryCriteria, input.notes?.trim() ?? '', user.id,
          domain, dateMastered, assessmentType, sd, masterySteps,
          errorCorrectionProcedure, teachingMethod, netTeachingIdea, measurement.procedure,
        ],
      );
      await insertProgramVersion(tx, organizationId, id, 1, measurement, input.teachingProcedure ?? '', masteryCriteria, 'Initial configuration', user.id);
      if (input.goalStatement?.trim()) {
        await tx.query(
          `INSERT INTO program_goals (organization_id, client_id, program_id, assessment_id, statement, objective, review_on, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [organizationId, client.id, id, input.assessmentId ?? null, input.goalStatement.trim(), input.goalObjective?.trim() ?? '', input.reviewOn || null, user.id],
        );
      }
      await recordAudit(tx, {
        organizationId, actorUserId: user.id, action: 'program.created', targetType: 'program', targetId: id, metadata: { clientId: client.id },
      });
      return this.load(tx, user, organizationId, id);
    });
  }

  async update(user: AuthUser, programId: string, input: ProgramWrite): Promise<ProgramDetail> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const current = await this.programRow(tx, organizationId, programId);
      const client = await this.authorization.findAccessibleClient(tx, user, organizationId, current.client_id, 'write', PERMISSIONS.programsEdit);
      const measurement = normalizeProgramMeasurement(input.measurementType, input.measurementProcedure, input.expectedTrialCount);
      const configChanged = measurement.method !== current.measurement_type
        || measurement.trials !== current.expected_trial_count
        || (input.masteryCriteria?.trim() ?? '') !== current.mastery_criteria
        || (input.teachingProcedure?.trim() ?? '') !== current.teaching_procedure;
      const status = input.status ?? current.status;
      const statusChanged = status !== current.status;
      if (configChanged || statusChanged) {
        const reason = requireReason(input.changeReason);
        await recordChangeReason(tx, { organizationId, recordType: 'program', recordId: programId, reason, userId: user.id });
        if (configChanged) {
          const version = current.configuration_version + 1;
          await insertProgramVersion(tx, organizationId, programId, version, measurement, input.teachingProcedure ?? '', input.masteryCriteria ?? '', reason, user.id);
          await tx.query(`UPDATE client_programs SET configuration_version = $2 WHERE id = $1`, [programId, version]);
        }
      }
      if (input.assessmentId) await assertAssessment(tx, organizationId, client.id, input.assessmentId);
      const domain = input.domain?.trim();
      const dateMastered = input.dateMastered || null;
      const assessmentType = input.assessmentType !== undefined ? (input.assessmentType.trim() || null) : undefined;
      const sd = input.sd?.trim();
      const masterySteps = input.masterySteps?.trim();
      const errorCorrectionProcedure = input.errorCorrectionProcedure?.trim();
      const teachingMethod = input.teachingMethod?.trim();
      const netTeachingIdea = input.netTeachingIdea?.trim();

      await tx.query(
        `UPDATE client_programs
         SET name = $2, description = $3, objective = $4, assessment_id = $5, teaching_procedure = $6,
             date_implemented = $7, review_on = $8, status = $9,
             measurement_type = $10, expected_trial_count = $11, mastery_criteria = $12, notes = $13,
             domain = COALESCE($14, domain),
             date_mastered = COALESCE($15, date_mastered),
             assessment_type = CASE WHEN $16::text IS NOT NULL THEN $16 ELSE assessment_type END,
             sd = COALESCE($17, sd),
             mastery_steps = COALESCE($18, mastery_steps),
             error_correction_procedure = COALESCE($19, error_correction_procedure),
             teaching_method = COALESCE($20, teaching_method),
             net_teaching_idea = COALESCE($21, net_teaching_idea),
             measurement_procedure = $22,
             updated_at = now()
         WHERE id = $1`,
        [
          programId, input.title.trim(), input.description?.trim() ?? '', input.objective?.trim() ?? '', input.assessmentId ?? null,
          input.teachingProcedure?.trim() ?? '', input.dateImplemented || null, input.reviewOn || null,
          status, measurement.method, measurement.trials, input.masteryCriteria?.trim() ?? '', input.notes?.trim() ?? '',
          domain, dateMastered, assessmentType, sd, masterySteps,
          errorCorrectionProcedure, teachingMethod, netTeachingIdea, measurement.procedure,
        ],
      );
      await recordAudit(tx, {
        organizationId, actorUserId: user.id, action: configChanged ? 'program.configuration_changed' : 'program.updated',
        targetType: 'program', targetId: programId, metadata: { clientId: client.id, status },
      });
      return this.load(tx, user, organizationId, programId);
    });
  }

  async addTarget(user: AuthUser, programId: string, input: TargetWrite): Promise<ProgramDetail> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const program = await this.programRow(tx, organizationId, programId);
      const client = await this.clientForCareAction(tx, user, organizationId, program.client_id);
      const orderRows = await tx.query<{ next_order: number | string }>(`SELECT COALESCE(max(sort_order), -1) + 1 AS next_order FROM client_targets WHERE program_id = $1`, [programId]);
      await insertTarget(tx, organizationId, client.id, programId, input, user.id, Number(orderRows[0]?.next_order ?? 0));
      return this.load(tx, user, organizationId, programId);
    });
  }

  async updateTarget(user: AuthUser, programId: string, targetId: string, input: TargetWrite): Promise<ProgramDetail> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const program = await this.programRow(tx, organizationId, programId);
      const client = await this.authorization.findAccessibleClient(tx, user, organizationId, program.client_id, 'write', PERMISSIONS.programsEdit);
      const current = await targetRow(tx, programId, targetId);
      const nextPhase = input.phase ?? current.phase;
      const measurement = normalizeMeasurement(input.measurementMethod, input.expectedTrialCount);
      // Task criteria are optional on this endpoint; an omitted field keeps its stored value.
      const criteria = {
        sd: input.sd === undefined ? current.sd : input.sd.trim(),
        masterySessions: input.masterySessions === undefined ? current.mastery_sessions : input.masterySessions,
        masteryProbe: input.masteryProbe === undefined ? current.mastery_probe : input.masteryProbe,
        baselineSessions: input.baselineSessions === undefined ? current.baseline_sessions : input.baselineSessions,
        baselineProbe: input.baselineProbe === undefined ? current.baseline_probe : input.baselineProbe,
        promptUsed: input.promptUsed ?? current.prompt_used,
      };
      const configChanged = measurement.method !== current.measurement_method
        || measurement.trials !== current.expected_trial_count
        || (input.masteryCriteria?.trim() ?? '') !== current.mastery_criteria
        || (input.promptHierarchy?.trim() ?? '') !== current.prompt_hierarchy
        || (input.teachingInstructions?.trim() ?? '') !== current.teaching_instructions
        || (input.baselineNote?.trim() ?? '') !== current.baseline_note
        || criteria.masterySessions !== current.mastery_sessions
        || criteria.masteryProbe !== current.mastery_probe
        || criteria.baselineSessions !== current.baseline_sessions
        || criteria.baselineProbe !== current.baseline_probe;
      const status = input.status ?? current.status;
      if (configChanged || status !== current.status) {
        const reason = requireReason(input.changeReason);
        await recordChangeReason(tx, { organizationId, recordType: 'target', recordId: targetId, reason, userId: user.id });
        if (configChanged) {
          const version = current.configuration_version + 1;
          await insertTargetVersion(tx, organizationId, targetId, version, measurement, input, reason, user.id);
          await tx.query(`UPDATE client_targets SET configuration_version = $2 WHERE id = $1`, [targetId, version]);
        }
      }
      await tx.query(
        `UPDATE client_targets
         SET name = $2, description = $3, operational_definition = $4, measurement_method = $5, expected_trial_count = $6,
             baseline_note = $7, teaching_instructions = $8, prompt_hierarchy = $9, mastery_criteria = $10,
             phase = $11, status = $12, started_on = $13, review_on = $14, clinical_notes = $15,
             sd = $16, mastery_sessions = $17, mastery_probe = $18, baseline_sessions = $19, baseline_probe = $20,
             prompt_used = $21, updated_at = now()
         WHERE id = $1`,
        [
          targetId, input.title.trim(), input.description?.trim() ?? '', input.operationalDefinition?.trim() ?? '',
          measurement.method, measurement.trials, input.baselineNote?.trim() ?? '', input.teachingInstructions?.trim() ?? '',
          input.promptHierarchy?.trim() ?? '', input.masteryCriteria?.trim() ?? '', nextPhase, status,
          input.startedOn || null, input.reviewOn || null, input.clinicalNotes?.trim() ?? '',
          criteria.sd, criteria.masterySessions, criteria.masteryProbe, criteria.baselineSessions, criteria.baselineProbe,
          criteria.promptUsed,
        ],
      );
      await recordAudit(tx, {
        organizationId, actorUserId: user.id, action: configChanged ? 'target.configuration_changed' : 'target.updated',
        targetType: 'target', targetId, metadata: { clientId: client.id, programId, status },
      });
      return this.load(tx, user, organizationId, programId);
    });
  }

  async addDocument(
    user: AuthUser,
    programId: string,
    file: { fileName: string; contentType: string; contentBase64: string },
  ): Promise<ProgramDetail> {
    if (!DOCUMENT_TYPES.has(file.contentType)) {
      throw new BadRequestException('Upload a PDF, PNG, JPEG, or WebP file.');
    }
    const content = Buffer.from(file.contentBase64, 'base64');
    if (content.length === 0 || content.length > MAX_DOCUMENT_BYTES) {
      throw new BadRequestException('Upload a document up to 512 KB.');
    }
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const program = await this.programRow(tx, organizationId, programId);
      const client = await this.authorization.findAccessibleClient(tx, user, organizationId, program.client_id, 'write', PERMISSIONS.documentsUpload);
      const id = randomUUID();
      await tx.query(
        `INSERT INTO client_documents (
           id, organization_id, client_id, file_name, content_type, content, created_by,
           storage_key, byte_size, sha256, scan_status, category
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'not_configured', 'record')`,
        [
          id, organizationId, client.id, file.fileName.trim(), file.contentType, content, user.id,
          `private/${organizationId}/clients/${client.id}/documents/${id}`, content.length,
          createHash('sha256').update(content).digest('hex'),
        ],
      );
      await tx.query(
        `INSERT INTO program_documents (program_id, document_id, organization_id) VALUES ($1, $2, $3)`,
        [programId, id, organizationId],
      );
      await recordAudit(tx, {
        organizationId, actorUserId: user.id, action: 'program.document_uploaded', targetType: 'document', targetId: id,
        metadata: { clientId: client.id, programId },
      });
      return this.load(tx, user, organizationId, programId);
    });
  }

  async setProgramStatus(user: AuthUser, programId: string, status: CareStatus, changeReason: string): Promise<ProgramDetail> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const current = await this.programRow(tx, organizationId, programId);
      const client = await this.clientForCareAction(tx, user, organizationId, current.client_id);
      if (status !== current.status) {
        const reason = requireReason(changeReason);
        await recordChangeReason(tx, { organizationId, recordType: 'program', recordId: programId, reason, userId: user.id });
        await tx.query(`UPDATE client_programs SET status = $2, updated_at = now() WHERE id = $1`, [programId, status]);
        await recordAudit(tx, {
          organizationId, actorUserId: user.id, action: 'program.status_changed',
          targetType: 'program', targetId: programId, metadata: { clientId: client.id, status },
        });
      }
      return this.load(tx, user, organizationId, programId);
    });
  }

  async setTargetStatus(user: AuthUser, programId: string, targetId: string, status: CareStatus, changeReason: string): Promise<ProgramDetail> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const program = await this.programRow(tx, organizationId, programId);
      const client = await this.clientForCareAction(tx, user, organizationId, program.client_id);
      const current = await targetRow(tx, programId, targetId);
      if (status !== current.status) {
        const reason = requireReason(changeReason);
        await recordChangeReason(tx, { organizationId, recordType: 'target', recordId: targetId, reason, userId: user.id });
        await tx.query(`UPDATE client_targets SET status = $2, updated_at = now() WHERE id = $1`, [targetId, status]);
        await recordAudit(tx, {
          organizationId, actorUserId: user.id, action: 'target.status_changed',
          targetType: 'target', targetId, metadata: { clientId: client.id, programId, status },
        });
      }
      return this.load(tx, user, organizationId, programId);
    });
  }

  /** Program editors, and therapists assigned to the client, can add tasks and change program and task status. */
  private async clientForCareAction(tx: Queryable, user: AuthUser, organizationId: string, clientId: string): Promise<ClientRecord> {
    if (user.permissions.includes(PERMISSIONS.programsEdit)) {
      return this.authorization.findAccessibleClient(tx, user, organizationId, clientId, 'write', PERMISSIONS.programsEdit);
    }
    if (user.role === 'therapist') {
      return this.authorization.findAccessibleClient(tx, user, organizationId, clientId, 'view', PERMISSIONS.programsView);
    }
    throw new ForbiddenException('You do not have access to this resource.');
  }

  private async programRow(tx: Queryable, organizationId: string, programId: string): Promise<ProgramRow> {
    const rows = await tx.query<ProgramRow>(
      `SELECT client_id, name, status, measurement_type, expected_trial_count, mastery_criteria, teaching_procedure, configuration_version
       FROM client_programs WHERE id = $1 AND organization_id = $2`,
      [programId, organizationId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('That program was not found.');
    return {
      ...row,
      client_id: asString(row.client_id),
      expected_trial_count: asNullableNumber(row.expected_trial_count),
      configuration_version: Number(row.configuration_version),
      mastery_criteria: asString(row.mastery_criteria),
      teaching_procedure: asString(row.teaching_procedure),
    };
  }

  private async load(tx: Queryable, user: AuthUser, organizationId: string, programId: string): Promise<ProgramDetail> {
    const rows = await tx.query<{
      id: string; client_id: string; client_name: string; name: string; description: string; objective: string;
      assessment_id: string | null; assessment_name: string | null; teaching_procedure: string;
      review_on: string | null;
      status: ProgramDetail['status']; measurement_type: MeasurementMethod; expected_trial_count: number | null;
      mastery_criteria: string; notes: string; template_id: string | null; configuration_version: number;
      domain: string | null; date_implemented: string | null; date_mastered: string | null;
      assessment_type: string | null; sd: string | null; mastery_steps: string | null;
      error_correction_procedure: string | null;
      teaching_method: string | null; net_teaching_idea: string | null;
      measurement_procedure: MeasurementProcedure | null;
    }>(
      `SELECT p.id, p.client_id, c.display_name AS client_name, p.name, p.description, p.objective, p.assessment_id,
              a.name AS assessment_name, p.teaching_procedure,
              to_char(p.review_on, 'YYYY-MM-DD') AS review_on,
              p.status, p.measurement_type, p.expected_trial_count, p.mastery_criteria, p.notes, p.template_id, p.configuration_version,
              p.domain, to_char(p.date_implemented, 'YYYY-MM-DD') AS date_implemented,
              to_char(p.date_mastered, 'YYYY-MM-DD') AS date_mastered,
              p.assessment_type, p.sd, p.mastery_steps,
              p.error_correction_procedure, p.teaching_method, p.net_teaching_idea, p.measurement_procedure
       FROM client_programs p
       JOIN clients c ON c.id = p.client_id
       LEFT JOIN assessments a ON a.id = p.assessment_id
       WHERE p.id = $1 AND p.organization_id = $2`,
      [programId, organizationId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('That program was not found.');
    await this.authorization.findAccessibleClient(tx, user, organizationId, asString(row.client_id), 'view', PERMISSIONS.programsView);
    const goals = await tx.query<{ id: string; statement: string; objective: string; assessment_id: string | null; status: ProgramDetail['goals'][number]['status']; review_on: string | null }>(
      `SELECT id, statement, objective, assessment_id, status, to_char(review_on, 'YYYY-MM-DD') AS review_on FROM program_goals WHERE program_id = $1`,
      [programId],
    );
    const targets = await tx.query<TargetSelectRow>(
      `SELECT ${TARGET_COLUMNS} FROM client_targets t WHERE t.program_id = $1 ORDER BY t.sort_order, t.created_at`,
      [programId],
    );
    const documents = await tx.query<{ id: string; file_name: string; content_type: string; byte_size: number | string; scan_status: string }>(
      `SELECT d.id, d.file_name, d.content_type, d.byte_size, d.scan_status
       FROM program_documents link
       JOIN client_documents d ON d.id = link.document_id
       WHERE link.program_id = $1
       ORDER BY d.created_at`,
      [programId],
    );
    const versions = await tx.query<{ id: string; version: number; measurement_type: MeasurementMethod; expected_trial_count: number | null; mastery_criteria: string; reason: string; created_at: Date | string }>(
      `SELECT id, version, measurement_type, expected_trial_count, mastery_criteria, reason, created_at
       FROM program_configuration_versions WHERE program_id = $1 ORDER BY version`,
      [programId],
    );
    return {
      id: asString(row.id),
      clientId: asString(row.client_id),
      clientName: asString(row.client_name),
      title: asString(row.name),
      domain: asString(row.domain ?? ''),
      dateImplemented: row.date_implemented ? asString(row.date_implemented) : null,
      dateMastered: row.date_mastered ? asString(row.date_mastered) : null,
      assessmentType: row.assessment_type ? asString(row.assessment_type) : null,
      sd: asString(row.sd ?? ''),
      masterySteps: asString(row.mastery_steps ?? ''),
      errorCorrectionProcedure: asString(row.error_correction_procedure ?? ''),
      teachingMethod: asString(row.teaching_method ?? ''),
      netTeachingIdea: asString(row.net_teaching_idea ?? ''),
      measurementProcedure: (row.measurement_procedure as MeasurementProcedure) || (row.measurement_type === 'trial' ? 'Step by Step' : 'Probe'),
      description: asString(row.description),
      objective: asString(row.objective),
      assessmentId: row.assessment_id ? asString(row.assessment_id) : null,
      assessmentName: row.assessment_name ? asString(row.assessment_name) : null,
      teachingProcedure: asString(row.teaching_procedure),
      reviewOn: row.review_on ? asString(row.review_on) : null,
      status: row.status,
      measurementType: row.measurement_type,
      expectedTrialCount: asNullableNumber(row.expected_trial_count),
      masteryCriteria: asString(row.mastery_criteria),
      notes: asString(row.notes),
      templateId: row.template_id ? asString(row.template_id) : null,
      configurationVersion: Number(row.configuration_version),
      goals: goals.map((goal) => ({
        id: asString(goal.id), statement: asString(goal.statement), objective: asString(goal.objective),
        assessmentId: goal.assessment_id ? asString(goal.assessment_id) : null, status: goal.status,
        reviewOn: goal.review_on ? asString(goal.review_on) : null,
      })),
      documents: documents.map((document) => ({
        id: asString(document.id),
        fileName: asString(document.file_name),
        contentType: asString(document.content_type),
        byteSize: Number(document.byte_size),
        scanStatus: document.scan_status === 'rejected' ? 'rejected' : 'not_configured',
      })),
      targets: targets.map(mapTarget),
      versions: versions.map((version) => ({
        id: asString(version.id), version: Number(version.version), measurementMethod: version.measurement_type,
        expectedTrialCount: asNullableNumber(version.expected_trial_count),
        masteryCriteria: asString(version.mastery_criteria), reason: asString(version.reason),
        createdAt: asDate(version.created_at).toISOString(),
      })),
    };
  }
}

interface ProgramRow {
  [key: string]: unknown;
  client_id: string;
  name: string;
  status: ProgramDetail['status'];
  measurement_type: MeasurementMethod;
  expected_trial_count: number | null;
  mastery_criteria: string;
  teaching_procedure: string;
  configuration_version: number;
}

const DOCUMENT_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);
const MAX_DOCUMENT_BYTES = 512 * 1024;

function normalizeProgramMeasurement(
  method?: MeasurementMethod,
  procedure?: MeasurementProcedure,
  count?: number,
): { method: MeasurementMethod; procedure: MeasurementProcedure; trials: number | null } {
  const proc: MeasurementProcedure = procedure || (method === 'trial' ? 'Step by Step' : 'Probe');
  const mMethod: MeasurementMethod = method || (proc === 'Step by Step' ? 'trial' : 'probe');
  const trials = count && count >= 1 && count <= 30 ? count : null;
  return { method: mMethod, procedure: proc, trials };
}

function normalizeMeasurement(method: MeasurementMethod, count: number | undefined): { method: MeasurementMethod; trials: number | null } {
  if (method === 'trial' || method === 'probe') {
    if (!count || count < 1 || count > 30) {
      throw new BadRequestException('Enter an expected trial count from 1 to 30 for trial or probe measurement.');
    }
    return { method, trials: count };
  }
  return { method, trials: null };
}


async function insertProgramVersion(
  tx: Queryable,
  organizationId: string,
  programId: string,
  version: number,
  measurement: { method: MeasurementMethod; trials: number | null },
  teaching: string,
  mastery: string,
  reason: string,
  userId: string,
): Promise<void> {
  await tx.query(
    `INSERT INTO program_configuration_versions (
       organization_id, program_id, version, measurement_type, expected_trial_count, mastery_criteria, teaching_procedure, reason, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [organizationId, programId, version, measurement.method, measurement.trials, mastery.trim(), teaching.trim(), reason, userId],
  );
}

async function insertTarget(
  tx: Queryable,
  organizationId: string,
  clientId: string,
  programId: string,
  input: TargetWrite,
  userId: string,
  sortOrder: number,
): Promise<void> {
  const measurement = normalizeMeasurement(input.measurementMethod, input.expectedTrialCount);
  const id = randomUUID();
  await tx.query(
    `INSERT INTO client_targets (
       id, organization_id, client_id, program_id, name, description, operational_definition, measurement_method,
       expected_trial_count, baseline_note, teaching_instructions, prompt_hierarchy, mastery_criteria, phase, status,
       started_on, review_on, clinical_notes, sort_order, created_by,
       sd, mastery_sessions, mastery_probe, baseline_sessions, baseline_probe, prompt_used
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'in_treatment',$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`,
    [
      id, organizationId, clientId, programId, input.title.trim(), input.description?.trim() ?? '', input.operationalDefinition?.trim() ?? '',
      measurement.method, measurement.trials, input.baselineNote?.trim() ?? '', input.teachingInstructions?.trim() ?? '',
      input.promptHierarchy?.trim() ?? '', input.masteryCriteria?.trim() ?? '', input.phase ?? 'baseline',
      input.startedOn || null, input.reviewOn || null, input.clinicalNotes?.trim() ?? '', sortOrder, userId,
      input.sd?.trim() ?? '', input.masterySessions ?? null, input.masteryProbe ?? null,
      input.baselineSessions ?? null, input.baselineProbe ?? null, input.promptUsed ?? false,
    ],
  );
  await insertTargetVersion(tx, organizationId, id, 1, measurement, input, 'Initial configuration', userId);
  await recordAudit(tx, { organizationId, actorUserId: userId, action: 'target.created', targetType: 'target', targetId: id, metadata: { clientId, programId } });
}

async function insertTargetVersion(
  tx: Queryable,
  organizationId: string,
  targetId: string,
  version: number,
  measurement: { method: MeasurementMethod; trials: number | null },
  input: Pick<TargetWrite, 'masteryCriteria' | 'baselineNote' | 'promptHierarchy' | 'teachingInstructions'>,
  reason: string,
  userId: string,
): Promise<void> {
  await tx.query(
    `INSERT INTO target_configuration_versions (
       organization_id, target_id, version, measurement_method, expected_trial_count, mastery_criteria,
       baseline_note, prompt_hierarchy, teaching_instructions, reason, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      organizationId, targetId, version, measurement.method, measurement.trials, input.masteryCriteria?.trim() ?? '',
      input.baselineNote?.trim() ?? '', input.promptHierarchy?.trim() ?? '', input.teachingInstructions?.trim() ?? '', reason, userId,
    ],
  );
}

interface TargetRow {
  measurement_method: MeasurementMethod;
  expected_trial_count: number | null;
  mastery_criteria: string;
  prompt_hierarchy: string;
  teaching_instructions: string;
  baseline_note: string;
  phase: string;
  status: TargetStatus;
  configuration_version: number;
  sd: string;
  mastery_sessions: number | null;
  mastery_probe: number | null;
  baseline_sessions: number | null;
  baseline_probe: number | null;
  prompt_used: boolean;
}

async function targetRow(tx: Queryable, programId: string, targetId: string): Promise<TargetRow> {
  const rows = await tx.query<{ [key: string]: unknown } & TargetRow>(
    `SELECT measurement_method, expected_trial_count, mastery_criteria, prompt_hierarchy, teaching_instructions,
            baseline_note, phase, status, configuration_version,
            sd, mastery_sessions, mastery_probe, baseline_sessions, baseline_probe, prompt_used
     FROM client_targets WHERE id = $1 AND program_id = $2`,
    [targetId, programId],
  );
  const row = rows[0];
  if (!row) throw new NotFoundException('That target was not found.');
  return {
    ...row,
    expected_trial_count: asNullableNumber(row.expected_trial_count),
    configuration_version: Number(row.configuration_version),
    mastery_criteria: asString(row.mastery_criteria),
    prompt_hierarchy: asString(row.prompt_hierarchy),
    teaching_instructions: asString(row.teaching_instructions),
    baseline_note: asString(row.baseline_note),
    sd: asString(row.sd),
    mastery_sessions: asNullableNumber(row.mastery_sessions),
    mastery_probe: asNullableNumber(row.mastery_probe),
    baseline_sessions: asNullableNumber(row.baseline_sessions),
    baseline_probe: asNullableNumber(row.baseline_probe),
    prompt_used: row.prompt_used === true,
  };
}

const TARGET_COLUMNS = `t.id, t.name, t.description, t.operational_definition, t.measurement_method, t.expected_trial_count,
  t.baseline_note, t.teaching_instructions, t.prompt_hierarchy, t.mastery_criteria, t.phase, t.status,
  to_char(t.started_on, 'YYYY-MM-DD') AS started_on, to_char(t.review_on, 'YYYY-MM-DD') AS review_on,
  t.clinical_notes, t.sd, t.mastery_sessions, t.mastery_probe, t.baseline_sessions, t.baseline_probe, t.prompt_used,
  t.sort_order, t.configuration_version`;

interface TargetSelectRow {
  [key: string]: unknown;
  id: string; name: string; description: string; operational_definition: string; measurement_method: MeasurementMethod;
  expected_trial_count: number | null; baseline_note: string; teaching_instructions: string; prompt_hierarchy: string;
  mastery_criteria: string; phase: string; status: TargetStatus; started_on: string | null; review_on: string | null;
  clinical_notes: string; sd: string; mastery_sessions: number | null; mastery_probe: number | null;
  baseline_sessions: number | null; baseline_probe: number | null; prompt_used: boolean; sort_order: number; configuration_version: number;
}

/** Lists targets with their program and client. `where` may refer to `t` (target) and `p` (program). */
async function queryTargets(tx: Queryable, where: string, params: unknown[]): Promise<TargetListItem[]> {
  const rows = await tx.query<TargetSelectRow & { program_id: string; program_title: string; client_id: string; client_name: string }>(
    `SELECT ${TARGET_COLUMNS}, t.program_id, p.name AS program_title, t.client_id, c.display_name AS client_name
     FROM client_targets t
     JOIN client_programs p ON p.id = t.program_id
     JOIN clients c ON c.id = t.client_id
     WHERE ${where}
     ORDER BY c.display_name, p.name, t.sort_order, t.created_at`,
    params,
  );
  return rows.map((row) => ({
    ...mapTarget(row),
    programId: asString(row.program_id),
    programTitle: asString(row.program_title),
    clientId: asString(row.client_id),
    clientName: asString(row.client_name),
  }));
}

function mapTarget(target: TargetSelectRow): TargetSummary {
  const id = asString(target.id);
  return {
    id, title: asString(target.name), description: asString(target.description),
    operationalDefinition: asString(target.operational_definition), measurementMethod: target.measurement_method,
    expectedTrialCount: asNullableNumber(target.expected_trial_count),
    baselineNote: asString(target.baseline_note), teachingInstructions: asString(target.teaching_instructions),
    promptHierarchy: asString(target.prompt_hierarchy), masteryCriteria: asString(target.mastery_criteria),
    phase: asString(target.phase), status: target.status,
    startedOn: target.started_on ? asString(target.started_on) : null,
    reviewOn: target.review_on ? asString(target.review_on) : null,
    clinicalNotes: asString(target.clinical_notes),
    sd: asString(target.sd),
    masterySessions: asNullableNumber(target.mastery_sessions),
    masteryProbe: asNullableNumber(target.mastery_probe),
    baselineSessions: asNullableNumber(target.baseline_sessions),
    baselineProbe: asNullableNumber(target.baseline_probe),
    promptUsed: target.prompt_used === true,
    sortOrder: Number(target.sort_order),
    configurationVersion: Number(target.configuration_version),
  };
}

async function assertAssessment(tx: Queryable, organizationId: string, clientId: string, assessmentId: string): Promise<void> {
  const rows = await tx.query(`SELECT 1 AS present FROM assessments WHERE id = $1 AND organization_id = $2 AND client_id = $3`, [assessmentId, organizationId, clientId]);
  if (rows.length === 0) throw new BadRequestException('Choose an assessment for this client.');
}
