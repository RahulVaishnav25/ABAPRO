import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  PERMISSIONS,
  type AuthUser,
  type MeasurementMethod,
  type ProgramDetail,
  type ProgramSummary,
  type ProgramTemplate,
  type SessionObservationView,
  type TargetStatus,
} from '@abapro/shared';
import { recordAudit } from '../common/audit';
import { asDate, asString } from '../common/http';
import type { Queryable } from '../db/database';
import { AuthorizationService } from '../access/authorization.service';
import type { ObservationDto, ProgramDto, ProgramTemplateDto, TargetDto } from './clinical.dto';

@Injectable()
export class ProgramService {
  constructor(@Inject(AuthorizationService) private readonly authorization: AuthorizationService) {}

  async list(user: AuthUser, clientId?: string): Promise<ProgramSummary[]> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const params: unknown[] = [organizationId];
      let clientClause = '';
      if (clientId) {
        const client = await this.authorization.findClient(tx, organizationId, clientId);
        await this.authorization.assertClientAccess(tx, user, client, 'view', PERMISSIONS.programsView);
        params.push(client.id);
        clientClause = `AND p.client_id = $${params.length}`;
      }
      const scope = assignmentScope(user, params);
      const rows = await tx.query<{
        id: string;
        client_id: string;
        client_name: string;
        name: string;
        status: ProgramSummary['status'];
        measurement_type: MeasurementMethod;
        target_count: number | string;
        started_on: string | null;
        review_on: string | null;
      }>(
        `SELECT p.id, p.client_id, c.display_name AS client_name, p.name, p.status, p.measurement_type,
                (SELECT count(*) FROM client_targets t WHERE t.program_id = p.id) AS target_count,
                to_char(p.started_on, 'YYYY-MM-DD') AS started_on,
                to_char(p.review_on, 'YYYY-MM-DD') AS review_on
         FROM client_programs p
         JOIN clients c ON c.id = p.client_id
         WHERE p.organization_id = $1 ${clientClause} ${scope}
         ORDER BY c.display_name, p.name`,
        params,
      );
      return rows.map((row) => ({
        id: asString(row.id),
        clientId: asString(row.client_id),
        clientName: asString(row.client_name),
        title: asString(row.name),
        status: row.status,
        measurementType: row.measurement_type,
        targetCount: Number(row.target_count ?? 0),
        startedOn: row.started_on ? asString(row.started_on) : null,
        reviewOn: row.review_on ? asString(row.review_on) : null,
      }));
    });
  }

  async get(user: AuthUser, programId: string): Promise<ProgramDetail> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => this.load(tx, user, organizationId, programId));
  }

  async create(user: AuthUser, input: ProgramDto): Promise<ProgramDetail> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.authorization.findClient(tx, organizationId, input.clientId);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.programsEdit);
      const measurement = normalizeMeasurement(input.measurementType, input.expectedTrialCount);
      if (input.assessmentId) {
        await assertAssessment(tx, organizationId, client.id, input.assessmentId);
      }
      if (input.responsibleClinicianId) {
        await assertClinician(tx, organizationId, input.responsibleClinicianId);
      }
      const id = randomUUID();
      await tx.query(
        `INSERT INTO client_programs (
           id, organization_id, client_id, name, description, objective, assessment_id, teaching_procedure,
           started_on, review_on, responsible_clinician_id, status, measurement_type, expected_trial_count,
           mastery_criteria, notes, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          id, organizationId, client.id, input.title.trim(), input.description?.trim() ?? '', input.objective?.trim() ?? '',
          input.assessmentId ?? null, input.teachingProcedure?.trim() ?? '', input.startedOn || null, input.reviewOn || null,
          input.responsibleClinicianId ?? null, input.status ?? 'active', measurement.method, measurement.trials,
          input.masteryCriteria?.trim() ?? '', input.notes?.trim() ?? '', user.id,
        ],
      );
      await insertProgramVersion(tx, organizationId, id, 1, measurement, input.teachingProcedure ?? '', input.masteryCriteria ?? '', 'Initial configuration', user.id);
      if (input.goalStatement?.trim()) {
        await tx.query(
          `INSERT INTO program_goals (organization_id, client_id, program_id, assessment_id, statement, objective, review_on, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [organizationId, client.id, id, input.assessmentId ?? null, input.goalStatement.trim(), input.goalObjective?.trim() ?? '', input.reviewOn || null, user.id],
        );
      }
      for (const therapistId of input.therapistIds ?? []) {
        await assignStaff(tx, organizationId, id, therapistId, user.id);
      }
      await recordAudit(tx, {
        organizationId, actorUserId: user.id, action: 'program.created', targetType: 'program', targetId: id, metadata: { clientId: client.id },
      });
      return this.load(tx, user, organizationId, id);
    });
  }

  async update(user: AuthUser, programId: string, input: ProgramDto): Promise<ProgramDetail> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const current = await this.programRow(tx, organizationId, programId);
      const client = await this.authorization.findClient(tx, organizationId, current.client_id);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.programsEdit);
      const measurement = normalizeMeasurement(input.measurementType, input.expectedTrialCount);
      const configChanged = measurement.method !== current.measurement_type
        || measurement.trials !== current.expected_trial_count
        || (input.masteryCriteria?.trim() ?? '') !== current.mastery_criteria
        || (input.teachingProcedure?.trim() ?? '') !== current.teaching_procedure;
      const status = input.status ?? current.status;
      const statusChanged = status !== current.status;
      if (configChanged || statusChanged) {
        const reason = requireReason(input.changeReason);
        await tx.query(
          `INSERT INTO clinical_change_reasons (organization_id, record_type, record_id, reason, created_by) VALUES ($1, 'program', $2, $3, $4)`,
          [organizationId, programId, reason, user.id],
        );
        if (configChanged) {
          const version = current.configuration_version + 1;
          await insertProgramVersion(tx, organizationId, programId, version, measurement, input.teachingProcedure ?? '', input.masteryCriteria ?? '', reason, user.id);
          await tx.query(`UPDATE client_programs SET configuration_version = $2 WHERE id = $1`, [programId, version]);
        }
      }
      if (input.assessmentId) await assertAssessment(tx, organizationId, client.id, input.assessmentId);
      if (input.responsibleClinicianId) await assertClinician(tx, organizationId, input.responsibleClinicianId);
      await tx.query(
        `UPDATE client_programs
         SET name = $2, description = $3, objective = $4, assessment_id = $5, teaching_procedure = $6,
             started_on = $7, review_on = $8, responsible_clinician_id = $9, status = $10,
             measurement_type = $11, expected_trial_count = $12, mastery_criteria = $13, notes = $14, updated_at = now()
         WHERE id = $1`,
        [
          programId, input.title.trim(), input.description?.trim() ?? '', input.objective?.trim() ?? '', input.assessmentId ?? null,
          input.teachingProcedure?.trim() ?? '', input.startedOn || null, input.reviewOn || null, input.responsibleClinicianId ?? null,
          status, measurement.method, measurement.trials, input.masteryCriteria?.trim() ?? '', input.notes?.trim() ?? '',
        ],
      );
      await recordAudit(tx, {
        organizationId, actorUserId: user.id, action: configChanged ? 'program.configuration_changed' : 'program.updated',
        targetType: 'program', targetId: programId, metadata: { clientId: client.id, status },
      });
      return this.load(tx, user, organizationId, programId);
    });
  }

  async templates(user: AuthUser): Promise<ProgramTemplate[]> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const rows = await tx.query<{ id: string }>(`SELECT id FROM program_templates WHERE organization_id = $1 ORDER BY title`, [organizationId]);
      const templates: ProgramTemplate[] = [];
      for (const row of rows) templates.push(await loadTemplate(tx, asString(row.id)));
      return templates;
    });
  }

  async saveTemplate(user: AuthUser, input: ProgramTemplateDto, templateId?: string): Promise<ProgramTemplate> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      if (!user.permissions.includes(PERMISSIONS.programsEdit)) {
        throw new BadRequestException('Program templates require permission to edit programs.');
      }
      const measurement = normalizeMeasurement(input.measurementType, input.expectedTrialCount);
      const id = templateId ?? randomUUID();
      if (templateId) {
        const existing = await tx.query(`SELECT 1 AS present FROM program_templates WHERE id = $1 AND organization_id = $2`, [templateId, organizationId]);
        if (existing.length === 0) throw new NotFoundException('That program template was not found.');
        await tx.query(
          `UPDATE program_templates
           SET title = $2, description = $3, objective = $4, teaching_procedure = $5, measurement_type = $6,
               expected_trial_count = $7, mastery_criteria = $8, notes = $9, status = $10, updated_at = now()
           WHERE id = $1`,
          [id, input.title.trim(), input.description?.trim() ?? '', input.objective?.trim() ?? '', input.teachingProcedure?.trim() ?? '', measurement.method, measurement.trials, input.masteryCriteria?.trim() ?? '', input.notes?.trim() ?? '', input.status ?? 'active'],
        );
        await tx.query(`DELETE FROM program_template_targets WHERE template_id = $1`, [id]);
      } else {
        await tx.query(
          `INSERT INTO program_templates (
             id, organization_id, title, description, objective, teaching_procedure, measurement_type,
             expected_trial_count, mastery_criteria, notes, status, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [id, organizationId, input.title.trim(), input.description?.trim() ?? '', input.objective?.trim() ?? '', input.teachingProcedure?.trim() ?? '', measurement.method, measurement.trials, input.masteryCriteria?.trim() ?? '', input.notes?.trim() ?? '', input.status ?? 'active', user.id],
        );
      }
      let order = 0;
      for (const target of input.targets ?? []) {
        const targetMeasurement = normalizeMeasurement(target.measurementMethod, target.expectedTrialCount);
        await insertTemplateTarget(tx, organizationId, id, target, targetMeasurement, order);
        order += 1;
      }
      await recordAudit(tx, { organizationId, actorUserId: user.id, action: 'program_template.updated', targetType: 'program_template', targetId: id });
      return loadTemplate(tx, id);
    });
  }

  async copyTemplate(user: AuthUser, templateId: string, clientId: string): Promise<ProgramDetail> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.authorization.findClient(tx, organizationId, clientId);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.programsEdit);
      const template = await loadTemplate(tx, templateId);
      const owned = await tx.query(`SELECT 1 AS present FROM program_templates WHERE id = $1 AND organization_id = $2`, [templateId, organizationId]);
      if (owned.length === 0) throw new NotFoundException('That program template was not found.');
      const id = randomUUID();
      await tx.query(
        `INSERT INTO client_programs (
           id, organization_id, client_id, name, description, objective, teaching_procedure, status,
           measurement_type, expected_trial_count, mastery_criteria, notes, template_id, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8,$9,$10,$11,$12,$13)`,
        [id, organizationId, client.id, template.title, template.description, template.objective, template.teachingProcedure, template.measurementType, template.expectedTrialCount, template.masteryCriteria, template.notes, templateId, user.id],
      );
      await insertProgramVersion(tx, organizationId, id, 1, { method: template.measurementType, trials: template.expectedTrialCount }, template.teachingProcedure, template.masteryCriteria, 'Copied from template', user.id);
      for (const target of template.targets) {
        await insertTarget(tx, organizationId, client.id, id, {
          title: target.title,
          description: target.description,
          operationalDefinition: target.operationalDefinition,
          measurementMethod: target.measurementMethod,
          expectedTrialCount: target.expectedTrialCount ?? undefined,
          baselineNote: target.baselineNote,
          teachingInstructions: target.teachingInstructions,
          promptHierarchy: target.promptHierarchy,
          masteryCriteria: target.masteryCriteria,
        }, user.id, target.sortOrder);
      }
      await recordAudit(tx, { organizationId, actorUserId: user.id, action: 'program.copied', targetType: 'program', targetId: id, metadata: { clientId: client.id, templateId } });
      return this.load(tx, user, organizationId, id);
    });
  }

  async addTarget(user: AuthUser, programId: string, input: TargetDto): Promise<ProgramDetail> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const program = await this.programRow(tx, organizationId, programId);
      const client = await this.authorization.findClient(tx, organizationId, program.client_id);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.targetsEdit);
      const orderRows = await tx.query<{ next_order: number | string }>(`SELECT COALESCE(max(sort_order), -1) + 1 AS next_order FROM client_targets WHERE program_id = $1`, [programId]);
      await insertTarget(tx, organizationId, client.id, programId, input, user.id, Number(orderRows[0]?.next_order ?? 0));
      return this.load(tx, user, organizationId, programId);
    });
  }

  async updateTarget(user: AuthUser, programId: string, targetId: string, input: TargetDto): Promise<ProgramDetail> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const program = await this.programRow(tx, organizationId, programId);
      const client = await this.authorization.findClient(tx, organizationId, program.client_id);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.targetsEdit);
      const current = await targetRow(tx, programId, targetId);
      const nextPhase = input.phase ?? current.phase;
      if (nextPhase !== current.phase && !user.permissions.includes(PERMISSIONS.phasesApprove)) {
        throw new ForbiddenException('Approving a phase change requires the phase approval permission.');
      }
      const measurement = normalizeMeasurement(input.measurementMethod, input.expectedTrialCount);
      const configChanged = measurement.method !== current.measurement_method
        || measurement.trials !== current.expected_trial_count
        || (input.masteryCriteria?.trim() ?? '') !== current.mastery_criteria
        || (input.promptHierarchy?.trim() ?? '') !== current.prompt_hierarchy
        || (input.teachingInstructions?.trim() ?? '') !== current.teaching_instructions
        || (input.baselineNote?.trim() ?? '') !== current.baseline_note;
      const status = input.status ?? current.status;
      if (configChanged || status !== current.status) {
        const reason = requireReason(input.changeReason);
        await tx.query(
          `INSERT INTO clinical_change_reasons (organization_id, record_type, record_id, reason, created_by) VALUES ($1, 'target', $2, $3, $4)`,
          [organizationId, targetId, reason, user.id],
        );
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
             phase = $11, status = $12, started_on = $13, review_on = $14, clinical_notes = $15, updated_at = now()
         WHERE id = $1`,
        [
          targetId, input.title.trim(), input.description?.trim() ?? '', input.operationalDefinition?.trim() ?? '',
          measurement.method, measurement.trials, input.baselineNote?.trim() ?? '', input.teachingInstructions?.trim() ?? '',
          input.promptHierarchy?.trim() ?? '', input.masteryCriteria?.trim() ?? '', nextPhase, status,
          input.startedOn || null, input.reviewOn || null, input.clinicalNotes?.trim() ?? '',
        ],
      );
      if (input.staffIds) {
        await tx.query(`UPDATE target_assignments SET ended_at = now() WHERE target_id = $1 AND ended_at IS NULL`, [targetId]);
        for (const staffId of input.staffIds) {
          await assertTherapist(tx, organizationId, staffId);
          await tx.query(
            `INSERT INTO target_assignments (organization_id, target_id, user_id, created_by) VALUES ($1, $2, $3, $4)`,
            [organizationId, targetId, staffId, user.id],
          );
        }
      }
      await recordAudit(tx, {
        organizationId, actorUserId: user.id, action: configChanged ? 'target.configuration_changed' : 'target.updated',
        targetType: 'target', targetId, metadata: { clientId: client.id, programId, status },
      });
      return this.load(tx, user, organizationId, programId);
    });
  }

  async reorder(user: AuthUser, programId: string, targetIds: string[]): Promise<ProgramDetail> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const program = await this.programRow(tx, organizationId, programId);
      const client = await this.authorization.findClient(tx, organizationId, program.client_id);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.targetsEdit);
      const existing = await tx.query<{ id: string }>(`SELECT id FROM client_targets WHERE program_id = $1`, [programId]);
      const known = new Set(existing.map((row) => asString(row.id)));
      if (targetIds.length !== known.size || targetIds.some((id) => !known.has(id))) {
        throw new BadRequestException('Include every target for this program when reordering.');
      }
      for (let index = 0; index < targetIds.length; index += 1) {
        await tx.query(`UPDATE client_targets SET sort_order = $2 WHERE id = $1`, [targetIds[index], index]);
      }
      await recordAudit(tx, { organizationId, actorUserId: user.id, action: 'target.reordered', targetType: 'program', targetId: programId, metadata: { clientId: client.id } });
      return this.load(tx, user, organizationId, programId);
    });
  }

  async assign(user: AuthUser, programId: string, userId: string): Promise<ProgramDetail> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const program = await this.programRow(tx, organizationId, programId);
      const client = await this.authorization.findClient(tx, organizationId, program.client_id);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.assignmentsManage);
      await assignStaff(tx, organizationId, programId, userId, user.id);
      await recordAudit(tx, { organizationId, actorUserId: user.id, action: 'program.assignment_changed', targetType: 'program', targetId: programId, metadata: { clientId: client.id, userId } });
      return this.load(tx, user, organizationId, programId);
    });
  }

  async endAssignment(user: AuthUser, programId: string, assignmentId: string): Promise<ProgramDetail> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const program = await this.programRow(tx, organizationId, programId);
      const client = await this.authorization.findClient(tx, organizationId, program.client_id);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.assignmentsManage);
      const updated = await tx.query(
        `UPDATE program_assignments SET ended_at = now() WHERE id = $1 AND program_id = $2 AND ended_at IS NULL RETURNING id`,
        [assignmentId, programId],
      );
      if (updated.length === 0) throw new NotFoundException('That assignment was not found.');
      return this.load(tx, user, organizationId, programId);
    });
  }

  async recordObservation(user: AuthUser, programId: string, targetId: string, input: ObservationDto): Promise<SessionObservationView> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const program = await this.programRow(tx, organizationId, programId);
      const client = await this.authorization.findClient(tx, organizationId, program.client_id);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.observationsRecord);
      const target = await targetRow(tx, programId, targetId);
      if (target.status !== 'active') {
        throw new BadRequestException('Record data on an active target.');
      }
      const version = await tx.query<{ id: string; measurement_method: MeasurementMethod; expected_trial_count: number | null }>(
        `SELECT id, measurement_method, expected_trial_count FROM target_configuration_versions
         WHERE target_id = $1 AND version = $2`,
        [targetId, target.configuration_version],
      );
      const snapshot = version[0];
      if (!snapshot) throw new BadRequestException('This target has no saved measurement configuration.');
      validateObservation(snapshot.measurement_method, snapshot.expected_trial_count, input);
      const sessionRows = await tx.query<{ id: string }>(
        `INSERT INTO therapy_sessions (organization_id, client_id, started_at, ended_at, status, created_by)
         VALUES ($1, $2, now(), now(), 'completed', $3) RETURNING id`,
        [organizationId, client.id, user.id],
      );
      const sessionId = asString(sessionRows[0]?.id);
      const observationId = randomUUID();
      await tx.query(
        `INSERT INTO session_observations (
           id, organization_id, client_id, session_id, target_id, configuration_version_id, measurement_method,
           note, frequency_count, duration_seconds, antecedent, behavior_note, consequence, recorded_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          observationId, organizationId, client.id, sessionId, targetId, snapshot.id, snapshot.measurement_method,
          input.note?.trim() ?? '', input.frequencyCount ?? null, input.durationSeconds ?? null,
          input.antecedent?.trim() || null, input.behaviorNote?.trim() || null, input.consequence?.trim() || null, user.id,
        ],
      );
      for (const trial of input.trials ?? []) {
        await tx.query(
          `INSERT INTO observation_trials (organization_id, observation_id, trial_number, result, prompt_level)
           VALUES ($1, $2, $3, $4, $5)`,
          [organizationId, observationId, trial.trialNumber, trial.result, trial.promptLevel?.trim() || null],
        );
      }
      await recordAudit(tx, {
        organizationId, actorUserId: user.id, action: 'session_observation.recorded', targetType: 'observation', targetId: observationId,
        metadata: { clientId: client.id, targetId, sessionId },
      });
      return {
        id: observationId,
        sessionId,
        targetId,
        configurationVersion: target.configuration_version,
        measurementMethod: snapshot.measurement_method,
        note: input.note?.trim() ?? '',
        frequencyCount: input.frequencyCount ?? null,
        durationSeconds: input.durationSeconds ?? null,
        antecedent: input.antecedent?.trim() || null,
        behaviorNote: input.behaviorNote?.trim() || null,
        consequence: input.consequence?.trim() || null,
        trials: (input.trials ?? []).map((trial) => ({ trialNumber: trial.trialNumber, result: trial.result, promptLevel: trial.promptLevel })),
        recordedAt: new Date().toISOString(),
      };
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
      const client = await this.authorization.findClient(tx, organizationId, program.client_id);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.documentsUpload);
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
      expected_trial_count: row.expected_trial_count == null ? null : Number(row.expected_trial_count),
      configuration_version: Number(row.configuration_version),
      mastery_criteria: asString(row.mastery_criteria),
      teaching_procedure: asString(row.teaching_procedure),
    };
  }

  private async load(tx: Queryable, user: AuthUser, organizationId: string, programId: string): Promise<ProgramDetail> {
    const rows = await tx.query<{
      id: string; client_id: string; client_name: string; name: string; description: string; objective: string;
      assessment_id: string | null; assessment_name: string | null; teaching_procedure: string;
      started_on: string | null; review_on: string | null; responsible_clinician_id: string | null; clinician_name: string | null;
      status: ProgramDetail['status']; measurement_type: MeasurementMethod; expected_trial_count: number | null;
      mastery_criteria: string; notes: string; template_id: string | null; configuration_version: number;
    }>(
      `SELECT p.id, p.client_id, c.display_name AS client_name, p.name, p.description, p.objective, p.assessment_id,
              a.name AS assessment_name, p.teaching_procedure, to_char(p.started_on, 'YYYY-MM-DD') AS started_on,
              to_char(p.review_on, 'YYYY-MM-DD') AS review_on, p.responsible_clinician_id, clinician.name AS clinician_name,
              p.status, p.measurement_type, p.expected_trial_count, p.mastery_criteria, p.notes, p.template_id, p.configuration_version
       FROM client_programs p
       JOIN clients c ON c.id = p.client_id
       LEFT JOIN assessments a ON a.id = p.assessment_id
       LEFT JOIN users clinician ON clinician.id = p.responsible_clinician_id
       WHERE p.id = $1 AND p.organization_id = $2`,
      [programId, organizationId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('That program was not found.');
    const client = await this.authorization.findClient(tx, organizationId, asString(row.client_id));
    await this.authorization.assertClientAccess(tx, user, client, 'view', PERMISSIONS.programsView);
    const goals = await tx.query<{ id: string; statement: string; objective: string; assessment_id: string | null; status: ProgramDetail['goals'][number]['status']; review_on: string | null }>(
      `SELECT id, statement, objective, assessment_id, status, to_char(review_on, 'YYYY-MM-DD') AS review_on FROM program_goals WHERE program_id = $1`,
      [programId],
    );
    const targets = await tx.query<{
      id: string; name: string; description: string; operational_definition: string; measurement_method: MeasurementMethod;
      expected_trial_count: number | null; baseline_note: string; teaching_instructions: string; prompt_hierarchy: string;
      mastery_criteria: string; phase: string; status: TargetStatus; started_on: string | null; review_on: string | null;
      clinical_notes: string; sort_order: number; configuration_version: number;
    }>(
      `SELECT id, name, description, operational_definition, measurement_method, expected_trial_count, baseline_note,
              teaching_instructions, prompt_hierarchy, mastery_criteria, phase, status,
              to_char(started_on, 'YYYY-MM-DD') AS started_on, to_char(review_on, 'YYYY-MM-DD') AS review_on,
              clinical_notes, sort_order, configuration_version
       FROM client_targets WHERE program_id = $1 ORDER BY sort_order, created_at`,
      [programId],
    );
    const staff = await tx.query<{ id: string; user_id: string; name: string; role: 'therapist' | 'supervisor'; ended_at: Date | string | null }>(
      `SELECT a.id, a.user_id, u.name, a.role, a.ended_at
       FROM program_assignments a JOIN users u ON u.id = a.user_id
       WHERE a.program_id = $1 ORDER BY a.ended_at NULLS FIRST, u.name`,
      [programId],
    );
    const targetStaff = await tx.query<{ id: string; target_id: string; user_id: string; name: string }>(
      `SELECT a.id, a.target_id, a.user_id, u.name
       FROM target_assignments a JOIN users u ON u.id = a.user_id
       WHERE a.ended_at IS NULL AND a.target_id IN (SELECT id FROM client_targets WHERE program_id = $1)`,
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
      description: asString(row.description),
      objective: asString(row.objective),
      assessmentId: row.assessment_id ? asString(row.assessment_id) : null,
      assessmentName: row.assessment_name ? asString(row.assessment_name) : null,
      teachingProcedure: asString(row.teaching_procedure),
      startedOn: row.started_on ? asString(row.started_on) : null,
      reviewOn: row.review_on ? asString(row.review_on) : null,
      responsibleClinicianId: row.responsible_clinician_id ? asString(row.responsible_clinician_id) : null,
      responsibleClinicianName: row.clinician_name ? asString(row.clinician_name) : null,
      status: row.status,
      measurementType: row.measurement_type,
      expectedTrialCount: row.expected_trial_count == null ? null : Number(row.expected_trial_count),
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
      targets: targets.map((target) => ({
        id: asString(target.id), title: asString(target.name), description: asString(target.description),
        operationalDefinition: asString(target.operational_definition), measurementMethod: target.measurement_method,
        expectedTrialCount: target.expected_trial_count == null ? null : Number(target.expected_trial_count),
        baselineNote: asString(target.baseline_note), teachingInstructions: asString(target.teaching_instructions),
        promptHierarchy: asString(target.prompt_hierarchy), masteryCriteria: asString(target.mastery_criteria),
        phase: asString(target.phase), status: target.status,
        startedOn: target.started_on ? asString(target.started_on) : null,
        reviewOn: target.review_on ? asString(target.review_on) : null,
        clinicalNotes: asString(target.clinical_notes), sortOrder: Number(target.sort_order),
        configurationVersion: Number(target.configuration_version),
        staff: targetStaff.filter((person) => asString(person.target_id) === asString(target.id)).map((person) => ({
          id: asString(person.id), userId: asString(person.user_id), name: asString(person.name),
        })),
      })),
      staff: staff.map((person) => ({
        id: asString(person.id), userId: asString(person.user_id), name: asString(person.name), role: person.role,
        endedAt: person.ended_at ? asDate(person.ended_at).toISOString() : null,
      })),
      versions: versions.map((version) => ({
        id: asString(version.id), version: Number(version.version), measurementMethod: version.measurement_type,
        expectedTrialCount: version.expected_trial_count == null ? null : Number(version.expected_trial_count),
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

function assignmentScope(user: AuthUser, params: unknown[]): string {
  if (user.role !== 'therapist' && user.role !== 'parent') return '';
  params.push(user.id);
  const relationship = user.role === 'parent' ? 'guardian' : 'therapist';
  return `AND EXISTS (
    SELECT 1 FROM client_assignments assigned
    WHERE assigned.client_id = p.client_id AND assigned.user_id = $${params.length}
      AND assigned.relationship = '${relationship}' AND assigned.ended_at IS NULL
  )`;
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

function requireReason(reason: string | undefined): string {
  const text = reason?.trim() ?? '';
  if (text.length < 12) {
    throw new BadRequestException('Enter a reason of at least 12 characters for this clinical change.');
  }
  return text;
}

function validateObservation(method: MeasurementMethod, expected: number | null, input: ObservationDto): void {
  if (method === 'trial' || method === 'probe') {
    const trials = input.trials ?? [];
    if (trials.length !== expected) {
      throw new BadRequestException(`Record all ${expected} configured trials. Do not leave a trial blank.`);
    }
    const numbers = new Set(trials.map((trial) => trial.trialNumber));
    if (numbers.size !== trials.length || [...numbers].some((number) => number < 1 || number > (expected ?? 0))) {
      throw new BadRequestException('Number each configured trial once.');
    }
    return;
  }
  if ((input.trials?.length ?? 0) > 0) {
    throw new BadRequestException('This measurement method does not use trials.');
  }
  if (method === 'frequency' && input.frequencyCount == null) {
    throw new BadRequestException('Enter the frequency count.');
  }
  if (method === 'duration' && input.durationSeconds == null) {
    throw new BadRequestException('Enter the duration in seconds.');
  }
  if (method === 'abc' && (!input.antecedent?.trim() || !input.behaviorNote?.trim() || !input.consequence?.trim())) {
    throw new BadRequestException('Enter the antecedent, behavior, and consequence.');
  }
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
  input: TargetDto,
  userId: string,
  sortOrder: number,
): Promise<void> {
  const measurement = normalizeMeasurement(input.measurementMethod, input.expectedTrialCount);
  const id = randomUUID();
  await tx.query(
    `INSERT INTO client_targets (
       id, organization_id, client_id, program_id, name, description, operational_definition, measurement_method,
       expected_trial_count, baseline_note, teaching_instructions, prompt_hierarchy, mastery_criteria, phase, status,
       started_on, review_on, clinical_notes, sort_order, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'active',$15,$16,$17,$18,$19)`,
    [
      id, organizationId, clientId, programId, input.title.trim(), input.description?.trim() ?? '', input.operationalDefinition?.trim() ?? '',
      measurement.method, measurement.trials, input.baselineNote?.trim() ?? '', input.teachingInstructions?.trim() ?? '',
      input.promptHierarchy?.trim() ?? '', input.masteryCriteria?.trim() ?? '', input.phase ?? 'baseline',
      input.startedOn || null, input.reviewOn || null, input.clinicalNotes?.trim() ?? '', sortOrder, userId,
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
  input: Pick<TargetDto, 'masteryCriteria' | 'baselineNote' | 'promptHierarchy' | 'teachingInstructions'>,
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

async function targetRow(tx: Queryable, programId: string, targetId: string): Promise<{
  measurement_method: MeasurementMethod;
  expected_trial_count: number | null;
  mastery_criteria: string;
  prompt_hierarchy: string;
  teaching_instructions: string;
  baseline_note: string;
  phase: string;
  status: TargetStatus;
  configuration_version: number;
}> {
  const rows = await tx.query<{
    measurement_method: MeasurementMethod;
    expected_trial_count: number | null;
    mastery_criteria: string;
    prompt_hierarchy: string;
    teaching_instructions: string;
    baseline_note: string;
    phase: string;
    status: TargetStatus;
    configuration_version: number;
  }>(
    `SELECT measurement_method, expected_trial_count, mastery_criteria, prompt_hierarchy, teaching_instructions,
            baseline_note, phase, status, configuration_version
     FROM client_targets WHERE id = $1 AND program_id = $2`,
    [targetId, programId],
  );
  const row = rows[0];
  if (!row) throw new NotFoundException('That target was not found.');
  return {
    ...row,
    expected_trial_count: row.expected_trial_count == null ? null : Number(row.expected_trial_count),
    configuration_version: Number(row.configuration_version),
    mastery_criteria: asString(row.mastery_criteria),
    prompt_hierarchy: asString(row.prompt_hierarchy),
    teaching_instructions: asString(row.teaching_instructions),
    baseline_note: asString(row.baseline_note),
  };
}

async function assignStaff(tx: Queryable, organizationId: string, programId: string, userId: string, actorId: string): Promise<void> {
  await assertTherapist(tx, organizationId, userId);
  await tx.query(
    `INSERT INTO program_assignments (organization_id, program_id, user_id, role, created_by)
     VALUES ($1, $2, $3, 'therapist', $4)
     ON CONFLICT (program_id, user_id, role) WHERE ended_at IS NULL DO NOTHING`,
    [organizationId, programId, userId, actorId],
  );
}

async function assertTherapist(tx: Queryable, organizationId: string, userId: string): Promise<void> {
  const rows = await tx.query(
    `SELECT 1 AS present FROM organization_memberships
     WHERE organization_id = $1 AND user_id = $2 AND status = 'active' AND role IN ('therapist', 'clinical_supervisor')`,
    [organizationId, userId],
  );
  if (rows.length === 0) throw new BadRequestException('Assign an active therapist or supervisor.');
}

async function assertClinician(tx: Queryable, organizationId: string, userId: string): Promise<void> {
  const rows = await tx.query(
    `SELECT 1 AS present FROM organization_memberships
     WHERE organization_id = $1 AND user_id = $2 AND status = 'active' AND role IN ('clinical_supervisor', 'organization_admin')`,
    [organizationId, userId],
  );
  if (rows.length === 0) throw new BadRequestException('The responsible clinician must be an active supervisor or organization administrator.');
}

async function assertAssessment(tx: Queryable, organizationId: string, clientId: string, assessmentId: string): Promise<void> {
  const rows = await tx.query(`SELECT 1 AS present FROM assessments WHERE id = $1 AND organization_id = $2 AND client_id = $3`, [assessmentId, organizationId, clientId]);
  if (rows.length === 0) throw new BadRequestException('Choose an assessment for this client.');
}

async function insertTemplateTarget(
  tx: Queryable,
  organizationId: string,
  templateId: string,
  target: TargetDto,
  measurement: { method: MeasurementMethod; trials: number | null },
  sortOrder: number,
): Promise<void> {
  await tx.query(
    `INSERT INTO program_template_targets (
       organization_id, template_id, title, description, operational_definition, measurement_method, expected_trial_count,
       baseline_note, teaching_instructions, prompt_hierarchy, mastery_criteria, sort_order
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      organizationId, templateId, target.title.trim(), target.description?.trim() ?? '', target.operationalDefinition?.trim() ?? '',
      measurement.method, measurement.trials, target.baselineNote?.trim() ?? '', target.teachingInstructions?.trim() ?? '',
      target.promptHierarchy?.trim() ?? '', target.masteryCriteria?.trim() ?? '', sortOrder,
    ],
  );
}

async function loadTemplate(tx: Queryable, templateId: string): Promise<ProgramTemplate> {
  const rows = await tx.query<{
    id: string; title: string; description: string; objective: string; teaching_procedure: string;
    measurement_type: MeasurementMethod; expected_trial_count: number | null; mastery_criteria: string; notes: string;
    status: ProgramTemplate['status']; updated_at: Date | string;
  }>(
    `SELECT id, title, description, objective, teaching_procedure, measurement_type, expected_trial_count, mastery_criteria, notes, status, updated_at
     FROM program_templates WHERE id = $1`,
    [templateId],
  );
  const row = rows[0];
  if (!row) throw new NotFoundException('That program template was not found.');
  const targets = await tx.query<{
    id: string; title: string; description: string; operational_definition: string; measurement_method: MeasurementMethod;
    expected_trial_count: number | null; baseline_note: string; teaching_instructions: string; prompt_hierarchy: string;
    mastery_criteria: string; sort_order: number;
  }>(
    `SELECT id, title, description, operational_definition, measurement_method, expected_trial_count, baseline_note,
            teaching_instructions, prompt_hierarchy, mastery_criteria, sort_order
     FROM program_template_targets WHERE template_id = $1 ORDER BY sort_order`,
    [templateId],
  );
  return {
    id: asString(row.id),
    title: asString(row.title),
    description: asString(row.description),
    objective: asString(row.objective),
    teachingProcedure: asString(row.teaching_procedure),
    measurementType: row.measurement_type,
    expectedTrialCount: row.expected_trial_count == null ? null : Number(row.expected_trial_count),
    masteryCriteria: asString(row.mastery_criteria),
    notes: asString(row.notes),
    status: row.status,
    updatedAt: asDate(row.updated_at).toISOString(),
    targets: targets.map((target) => ({
      id: asString(target.id), title: asString(target.title), description: asString(target.description),
      operationalDefinition: asString(target.operational_definition), measurementMethod: target.measurement_method,
      expectedTrialCount: target.expected_trial_count == null ? null : Number(target.expected_trial_count),
      baselineNote: asString(target.baseline_note), teachingInstructions: asString(target.teaching_instructions),
      promptHierarchy: asString(target.prompt_hierarchy), masteryCriteria: asString(target.mastery_criteria),
      sortOrder: Number(target.sort_order),
    })),
  };
}
