import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  PERMISSIONS,
  type AuthUser,
  type CollectedObservation,
  type DurationUnit,
  type MeasurementMethod,
  type ObservationEntryMode,
  type ObservationStatus,
  type SessionGraphPoint,
  type TherapySessionDetail,
  type TherapySessionSummary,
  type TrialResult,
} from '@abapro/shared';
import { recordAudit } from '../common/audit';
import { asDate, asString } from '../common/http';
import type { Queryable } from '../db/database';
import { AuthorizationService } from '../access/authorization.service';

const RESULTS = new Set<TrialResult>(['correct', 'incorrect', 'prompted', 'no_response']);
const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface TrialWrite {
  idempotencyKey: string;
  trialNumber: number;
  result: TrialResult;
  promptLevel?: string;
}

export interface ObservationWrite {
  idempotencyKey: string;
  targetId: string;
  note?: string;
  trials?: TrialWrite[];
  frequencyCount?: number;
  windowStartedAt?: string;
  windowEndedAt?: string;
  occurredAt?: string;
  durationSeconds?: number;
  durationUnit?: DurationUnit;
  startedAt?: string;
  endedAt?: string;
  antecedent?: string;
  behaviorNote?: string;
  consequence?: string;
  contextNote?: string;
}

interface PreparedObservation {
  entryMode: ObservationEntryMode;
  note: string;
  frequencyCount: number | null;
  durationSeconds: number | null;
  durationUnit: DurationUnit;
  windowStartedAt: Date | null;
  windowEndedAt: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
  occurredAt: Date | null;
  antecedent: string | null;
  behaviorNote: string | null;
  consequence: string | null;
  contextNote: string;
  ratePerMinute: number | null;
  trials: TrialWrite[];
  status: ObservationStatus;
}

@Injectable()
export class SessionCollectionService {
  constructor(@Inject(AuthorizationService) private readonly authorization: AuthorizationService) {}

  async list(user: AuthUser, clientId?: string, status?: string): Promise<TherapySessionSummary[]> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const params: unknown[] = [organizationId];
      let clientClause = '';
      if (clientId) {
        const client = await this.authorization.findClient(tx, organizationId, clientId);
        await this.authorization.assertClientAccess(tx, user, client, 'view', PERMISSIONS.sessionsView);
        params.push(client.id);
        clientClause = `AND s.client_id = $${params.length}`;
      }
      const scope = assignmentScope(user, params);
      let statusClause = '';
      if (status) {
        if (!['scheduled', 'in_progress', 'completed', 'cancelled'].includes(status)) {
          throw new BadRequestException('Choose a valid session status.');
        }
        params.push(status);
        statusClause = `AND s.status = $${params.length}`;
      }
      const rows = await tx.query<{
        id: string;
        client_id: string;
        client_name: string;
        therapist_id: string | null;
        therapist_name: string | null;
        started_at: Date | string;
        ended_at: Date | string | null;
        interrupted_at: Date | string | null;
        status: TherapySessionSummary['status'];
        setting: string;
        location: string;
        observation_count: number | string;
      }>(
        `SELECT s.id, s.client_id, c.display_name AS client_name, s.therapist_id, therapist.name AS therapist_name,
                s.started_at, s.ended_at, s.interrupted_at, s.status, s.setting, s.location,
                (SELECT count(*) FROM session_observations o WHERE o.session_id = s.id AND o.status = 'recorded') AS observation_count
         FROM therapy_sessions s
         JOIN clients c ON c.id = s.client_id
         LEFT JOIN users therapist ON therapist.id = s.therapist_id
         WHERE s.organization_id = $1 ${clientClause} ${statusClause} ${scope}
         ORDER BY s.started_at DESC
         LIMIT 100`,
        params,
      );
      return rows.map(summarize);
    });
  }

  async graph(user: AuthUser, clientId: string): Promise<SessionGraphPoint[]> {
    if (!clientId) throw new BadRequestException('Choose a client.');
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.authorization.findClient(tx, organizationId, clientId);
      await this.authorization.assertClientAccess(tx, user, client, 'view', PERMISSIONS.graphsView);
      const rows = await tx.query<{
        id: string;
        session_id: string;
        target_id: string;
        target_title: string;
        measurement_method: MeasurementMethod;
        recorded_on: string;
        frequency_count: number | null;
        duration_seconds: number | null;
        rate_per_minute: number | string | null;
        correct_count: number | string;
        trial_count: number | string;
      }>(
        `SELECT o.id, o.session_id, o.target_id, t.name AS target_title, o.measurement_method,
                to_char(o.created_at AT TIME ZONE org.timezone, 'YYYY-MM-DD') AS recorded_on,
                o.frequency_count, o.duration_seconds, o.rate_per_minute,
                (SELECT count(*) FROM observation_trials trial
                  WHERE trial.observation_id = o.id AND trial.voided_at IS NULL AND trial.result = 'correct') AS correct_count,
                (SELECT count(*) FROM observation_trials trial
                  WHERE trial.observation_id = o.id AND trial.voided_at IS NULL) AS trial_count
         FROM session_observations o
         JOIN therapy_sessions s ON s.id = o.session_id
         JOIN client_targets t ON t.id = o.target_id
         JOIN organizations org ON org.id = o.organization_id
         WHERE o.client_id = $1 AND o.organization_id = $2 AND o.status = 'recorded' AND s.status = 'completed'
         ORDER BY o.created_at`,
        [client.id, organizationId],
      );
      return rows.map((row) => {
        const trials = Number(row.trial_count);
        const correct = Number(row.correct_count);
        const method = row.measurement_method;
        return {
          observationId: asString(row.id),
          sessionId: asString(row.session_id),
          targetId: asString(row.target_id),
          targetTitle: asString(row.target_title),
          measurementMethod: method,
          recordedOn: asString(row.recorded_on),
          percentCorrect: (method === 'trial' || method === 'probe') && trials > 0 ? Math.round((correct / trials) * 1000) / 10 : null,
          frequencyCount: row.frequency_count == null ? null : Number(row.frequency_count),
          durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
          ratePerMinute: row.rate_per_minute == null ? null : Number(row.rate_per_minute),
        };
      });
    });
  }

  async start(
    user: AuthUser,
    input: { clientId: string; therapistId?: string; startedAt?: string; setting?: string; location?: string; note?: string },
  ): Promise<TherapySessionDetail> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.authorization.findClient(tx, organizationId, input.clientId);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.observationsRecord);
      const open = await tx.query<{ id: string }>(
        `SELECT id FROM therapy_sessions WHERE client_id = $1 AND organization_id = $2 AND status = 'in_progress' LIMIT 1`,
        [client.id, organizationId],
      );
      if (open.length > 0) {
        throw new ConflictException('This client already has an open session. Resume it instead of starting another.');
      }
      const therapistId = input.therapistId || user.id;
      await assertCollector(tx, organizationId, therapistId);
      const startedAt = parseTime(input.startedAt, 'start time') ?? new Date();
      assertStartTime(startedAt);
      const id = randomUUID();
      await tx.query(
        `INSERT INTO therapy_sessions (
           id, organization_id, clinic_id, client_id, therapist_id, started_at, status, setting, location, note, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,'in_progress',$7,$8,$9,$10)`,
        [
          id, organizationId, user.clinic?.id ?? null, client.id, therapistId, startedAt.toISOString(),
          input.setting?.trim() ?? '', input.location?.trim() ?? '', input.note?.trim() ?? '', user.id,
        ],
      );
      await recordAudit(tx, {
        organizationId, actorUserId: user.id, action: 'session.started', targetType: 'session', targetId: id,
        metadata: { clientId: client.id },
      });
      return this.load(tx, user, organizationId, id);
    });
  }

  async get(user: AuthUser, sessionId: string): Promise<TherapySessionDetail> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => this.load(tx, user, organizationId, sessionId));
  }

  async update(
    user: AuthUser,
    sessionId: string,
    input: { setting?: string; location?: string; note?: string; therapistId?: string },
  ): Promise<TherapySessionDetail> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const session = await this.lockOpen(tx, organizationId, sessionId);
      const client = await this.authorization.findClient(tx, organizationId, session.client_id);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.observationsRecord);
      if (input.therapistId) await assertCollector(tx, organizationId, input.therapistId);
      await tx.query(
        `UPDATE therapy_sessions
         SET setting = $2, location = $3, note = $4, therapist_id = COALESCE($5, therapist_id), updated_at = now()
         WHERE id = $1`,
        [sessionId, input.setting?.trim() ?? session.setting, input.location?.trim() ?? session.location, input.note?.trim() ?? session.note, input.therapistId ?? null],
      );
      return this.load(tx, user, organizationId, sessionId);
    });
  }

  async interrupt(user: AuthUser, sessionId: string): Promise<TherapySessionDetail> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const session = await this.lockOpen(tx, organizationId, sessionId);
      const client = await this.authorization.findClient(tx, organizationId, session.client_id);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.observationsRecord);
      await tx.query(`UPDATE therapy_sessions SET interrupted_at = now(), updated_at = now() WHERE id = $1`, [sessionId]);
      await recordAudit(tx, {
        organizationId, actorUserId: user.id, action: 'session.interrupted', targetType: 'session', targetId: sessionId,
        metadata: { clientId: client.id },
      });
      return this.load(tx, user, organizationId, sessionId);
    });
  }

  async resume(user: AuthUser, sessionId: string): Promise<TherapySessionDetail> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const session = await this.lockOpen(tx, organizationId, sessionId);
      const client = await this.authorization.findClient(tx, organizationId, session.client_id);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.observationsRecord);
      await tx.query(`UPDATE therapy_sessions SET interrupted_at = NULL, updated_at = now() WHERE id = $1`, [sessionId]);
      await recordAudit(tx, {
        organizationId, actorUserId: user.id, action: 'session.resumed', targetType: 'session', targetId: sessionId,
        metadata: { clientId: client.id },
      });
      return this.load(tx, user, organizationId, sessionId);
    });
  }

  async complete(user: AuthUser, sessionId: string, note?: string): Promise<TherapySessionDetail> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const session = await this.lockOpen(tx, organizationId, sessionId);
      const client = await this.authorization.findClient(tx, organizationId, session.client_id);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.observationsRecord);
      const detail = await this.load(tx, user, organizationId, sessionId);
      if (!detail.summary.canComplete) {
        throw new BadRequestException('Finish or remove incomplete trial sets before completing the session. Targets with no data can stay unrecorded.');
      }
      await tx.query(
        `UPDATE therapy_sessions
         SET status = 'completed', ended_at = now(), interrupted_at = NULL, note = $2, updated_at = now()
         WHERE id = $1`,
        [sessionId, note?.trim() || session.note],
      );
      await recordAudit(tx, {
        organizationId, actorUserId: user.id, action: 'session.completed', targetType: 'session', targetId: sessionId,
        metadata: { clientId: client.id, observationCount: detail.summary.observationCount },
      });
      return this.load(tx, user, organizationId, sessionId);
    });
  }

  async cancel(user: AuthUser, sessionId: string, reason: string | undefined): Promise<TherapySessionDetail> {
    const text = requireReason(reason);
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const session = await this.lockOpen(tx, organizationId, sessionId);
      const client = await this.authorization.findClient(tx, organizationId, session.client_id);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.observationsRecord);
      await tx.query(
        `INSERT INTO clinical_change_reasons (organization_id, record_type, record_id, reason, created_by) VALUES ($1, 'session', $2, $3, $4)`,
        [organizationId, sessionId, text, user.id],
      );
      await tx.query(`UPDATE therapy_sessions SET status = 'cancelled', ended_at = now(), updated_at = now() WHERE id = $1`, [sessionId]);
      await recordAudit(tx, {
        organizationId, actorUserId: user.id, action: 'session.cancelled', targetType: 'session', targetId: sessionId,
        metadata: { clientId: client.id },
      });
      return this.load(tx, user, organizationId, sessionId);
    });
  }

  async record(user: AuthUser, sessionId: string, input: ObservationWrite): Promise<CollectedObservation> {
    const key = requireKey(input.idempotencyKey);
    const print = fingerprint(input);
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const existing = await findByKey(tx, organizationId, key);
      if (existing) return replay(tx, existing, print);
      const session = await this.lockOpen(tx, organizationId, sessionId);
      const client = await this.authorization.findClient(tx, organizationId, session.client_id);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.observationsRecord);
      const target = await activeTarget(tx, client.id, input.targetId);
      const version = await configuration(tx, target.id, target.configuration_version);
      const prepared = prepareObservation(version.measurement_method, version.expected_trial_count, input);
      const id = randomUUID();
      await insertObservation(tx, {
        id, organizationId, clientId: client.id, sessionId, targetId: target.id, versionId: version.id,
        method: version.measurement_method, prepared, key, print, userId: user.id, amendedFromId: null, reason: '',
      });
      await insertTrials(tx, organizationId, id, prepared.trials);
      await recordAudit(tx, {
        organizationId, actorUserId: user.id, action: 'session_observation.recorded', targetType: 'observation', targetId: id,
        metadata: { clientId: client.id, sessionId, targetId: target.id },
      });
      return loadObservation(tx, id);
    });
  }

  async addTrial(user: AuthUser, sessionId: string, observationId: string, input: TrialWrite): Promise<CollectedObservation> {
    const key = requireKey(input.idempotencyKey);
    const print = fingerprint(input);
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const prior = await tx.query<{ id: string; request_fingerprint: string | null; observation_id: string }>(
        `SELECT id, request_fingerprint, observation_id FROM observation_trials WHERE organization_id = $1 AND idempotency_key = $2`,
        [organizationId, key],
      );
      if (prior[0]) {
        if (prior[0].request_fingerprint !== print || asString(prior[0].observation_id) !== observationId) {
          throw new ConflictException('This trial was already saved with different data. Review the saved trial before trying again.');
        }
        return loadObservation(tx, observationId);
      }
      const session = await this.lockOpen(tx, organizationId, sessionId);
      const client = await this.authorization.findClient(tx, organizationId, session.client_id);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.observationsRecord);
      const observation = await observationRow(tx, sessionId, observationId);
      if (observation.status !== 'draft') {
        throw new BadRequestException('This trial set is already complete. Undo a trial or amend the observation before adding another.');
      }
      const version = await tx.query<{ measurement_method: MeasurementMethod; expected_trial_count: number | null }>(
        `SELECT measurement_method, expected_trial_count FROM target_configuration_versions WHERE id = $1`,
        [observation.configuration_version_id],
      );
      const expected = version[0]?.expected_trial_count == null ? null : Number(version[0].expected_trial_count);
      assertTrial(input, expected);
      const taken = await tx.query(
        `SELECT 1 AS present FROM observation_trials WHERE observation_id = $1 AND trial_number = $2 AND voided_at IS NULL`,
        [observationId, input.trialNumber],
      );
      if (taken.length > 0) throw new BadRequestException('That trial number is already recorded.');
      await insertTrials(tx, organizationId, observationId, [{ ...input, idempotencyKey: key }]);
      await tx.query(`UPDATE observation_trials SET request_fingerprint = $2 WHERE idempotency_key = $1`, [key, print]);
      await refreshTrialStatus(tx, observationId, expected);
      await recordAudit(tx, {
        organizationId, actorUserId: user.id, action: 'session_observation.trial_recorded', targetType: 'observation', targetId: observationId,
        metadata: { clientId: client.id, sessionId, trialNumber: input.trialNumber },
      });
      return loadObservation(tx, observationId);
    });
  }

  async undoTrial(user: AuthUser, sessionId: string, observationId: string, trialId: string, reason: string | undefined): Promise<CollectedObservation> {
    const text = requireReason(reason);
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const session = await this.lockOpen(tx, organizationId, sessionId);
      const client = await this.authorization.findClient(tx, organizationId, session.client_id);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.observationsRecord);
      const observation = await observationRow(tx, sessionId, observationId);
      if (observation.status === 'amended' || observation.status === 'voided') {
        throw new BadRequestException('This observation can no longer be changed in place.');
      }
      const updated = await tx.query(
        `UPDATE observation_trials SET voided_at = now(), void_reason = $3
         WHERE id = $1 AND observation_id = $2 AND voided_at IS NULL RETURNING id`,
        [trialId, observationId, text],
      );
      if (updated.length === 0) throw new NotFoundException('That trial was not found.');
      const version = await tx.query<{ expected_trial_count: number | null }>(
        `SELECT expected_trial_count FROM target_configuration_versions WHERE id = $1`,
        [observation.configuration_version_id],
      );
      const expected = version[0]?.expected_trial_count == null ? null : Number(version[0].expected_trial_count);
      await refreshTrialStatus(tx, observationId, expected);
      await tx.query(
        `INSERT INTO clinical_change_reasons (organization_id, record_type, record_id, reason, created_by) VALUES ($1, 'observation', $2, $3, $4)`,
        [organizationId, observationId, text, user.id],
      );
      await recordAudit(tx, {
        organizationId, actorUserId: user.id, action: 'session_observation.trial_removed', targetType: 'observation', targetId: observationId,
        metadata: { clientId: client.id, sessionId, trialId },
      });
      return loadObservation(tx, observationId);
    });
  }

  async voidObservation(user: AuthUser, sessionId: string, observationId: string, reason: string | undefined): Promise<CollectedObservation> {
    const text = requireReason(reason);
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const session = await this.lockOpen(tx, organizationId, sessionId);
      const client = await this.authorization.findClient(tx, organizationId, session.client_id);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.observationsRecord);
      const observation = await observationRow(tx, sessionId, observationId);
      if (observation.status === 'amended' || observation.status === 'voided') {
        throw new BadRequestException('This observation can no longer be changed in place.');
      }
      await tx.query(`UPDATE session_observations SET status = 'voided', amendment_reason = $2 WHERE id = $1`, [observationId, text]);
      await tx.query(
        `INSERT INTO clinical_change_reasons (organization_id, record_type, record_id, reason, created_by) VALUES ($1, 'observation', $2, $3, $4)`,
        [organizationId, observationId, text, user.id],
      );
      await recordAudit(tx, {
        organizationId, actorUserId: user.id, action: 'session_observation.voided', targetType: 'observation', targetId: observationId,
        metadata: { clientId: client.id, sessionId },
      });
      return loadObservation(tx, observationId);
    });
  }

  async amend(user: AuthUser, sessionId: string, observationId: string, input: ObservationWrite & { reason?: string }): Promise<CollectedObservation> {
    const text = requireReason(input.reason);
    const key = requireKey(input.idempotencyKey);
    const print = fingerprint({ ...input, reason: text });
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const existing = await findByKey(tx, organizationId, key);
      if (existing) return replay(tx, existing, print);
      const session = await lockSession(tx, organizationId, sessionId);
      const client = await this.authorization.findClient(tx, organizationId, session.client_id);
      await this.authorization.assertClientAccess(tx, user, client, 'write', PERMISSIONS.observationsRecord);
      const canAmend = user.permissions.includes(PERMISSIONS.observationsAmend) || session.status === 'in_progress';
      if (!canAmend) {
        throw new ForbiddenException('Amending a completed session requires permission to amend observations.');
      }
      if (session.status !== 'in_progress' && session.status !== 'completed') {
        throw new BadRequestException('Cancelled sessions cannot be amended.');
      }
      const original = await observationRow(tx, sessionId, observationId);
      if (original.status !== 'recorded') throw new BadRequestException('Only a recorded observation can be amended.');
      if (input.targetId !== original.target_id) throw new BadRequestException('An amendment stays on the same target.');
      const version = await tx.query<{ id: string; measurement_method: MeasurementMethod; expected_trial_count: number | null }>(
        `SELECT id, measurement_method, expected_trial_count FROM target_configuration_versions WHERE id = $1`,
        [original.configuration_version_id],
      );
      const snapshot = version[0];
      if (!snapshot) throw new BadRequestException('The original measurement configuration is missing.');
      const prepared = prepareObservation(snapshot.measurement_method, snapshot.expected_trial_count == null ? null : Number(snapshot.expected_trial_count), input);
      if (prepared.status !== 'recorded') {
        throw new BadRequestException('An amendment must be a complete observation.');
      }
      const id = randomUUID();
      await insertObservation(tx, {
        id, organizationId, clientId: client.id, sessionId, targetId: original.target_id, versionId: snapshot.id,
        method: snapshot.measurement_method, prepared, key, print, userId: user.id, amendedFromId: observationId, reason: text,
      });
      await insertTrials(tx, organizationId, id, prepared.trials);
      await tx.query(`UPDATE session_observations SET status = 'amended' WHERE id = $1`, [observationId]);
      await tx.query(
        `INSERT INTO clinical_change_reasons (organization_id, record_type, record_id, reason, created_by) VALUES ($1, 'observation', $2, $3, $4)`,
        [organizationId, observationId, text, user.id],
      );
      await recordAudit(tx, {
        organizationId, actorUserId: user.id, action: 'session_observation.amended', targetType: 'observation', targetId: id,
        metadata: { clientId: client.id, sessionId, amendedFromId: observationId },
      });
      return loadObservation(tx, id);
    });
  }

  async history(user: AuthUser, sessionId: string, observationId: string): Promise<CollectedObservation[]> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      await this.load(tx, user, organizationId, sessionId);
      const origin = await observationRow(tx, sessionId, observationId);
      const root = origin.amended_from_id ?? origin.id;
      const rows = await tx.query<{ id: string }>(
        `SELECT id FROM session_observations
         WHERE session_id = $1 AND (id = $2 OR amended_from_id = $2)
         ORDER BY created_at`,
        [sessionId, root],
      );
      const items: CollectedObservation[] = [];
      for (const row of rows) items.push(await loadObservation(tx, asString(row.id)));
      return items;
    });
  }

  private async lockOpen(tx: Queryable, organizationId: string, sessionId: string): Promise<SessionRow> {
    const session = await lockSession(tx, organizationId, sessionId);
    if (session.status !== 'in_progress') {
      throw new BadRequestException('This session is no longer open.');
    }
    return session;
  }

  private async load(tx: Queryable, user: AuthUser, organizationId: string, sessionId: string): Promise<TherapySessionDetail> {
    const rows = await tx.query<{
      id: string; client_id: string; client_name: string; therapist_id: string | null; therapist_name: string | null;
      started_at: Date | string; ended_at: Date | string | null; interrupted_at: Date | string | null;
      status: TherapySessionSummary['status']; setting: string; location: string; note: string;
    }>(
      `SELECT s.id, s.client_id, c.display_name AS client_name, s.therapist_id, therapist.name AS therapist_name,
              s.started_at, s.ended_at, s.interrupted_at, s.status, s.setting, s.location, s.note
       FROM therapy_sessions s
       JOIN clients c ON c.id = s.client_id
       LEFT JOIN users therapist ON therapist.id = s.therapist_id
       WHERE s.id = $1 AND s.organization_id = $2`,
      [sessionId, organizationId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('That session was not found.');
    const client = await this.authorization.findClient(tx, organizationId, asString(row.client_id));
    await this.authorization.assertClientAccess(tx, user, client, 'view', PERMISSIONS.sessionsView);
    const targets = await tx.query<{
      id: string; program_id: string; program_title: string; name: string; phase: string; measurement_method: MeasurementMethod;
      expected_trial_count: number | null; operational_definition: string; teaching_instructions: string; prompt_hierarchy: string;
      configuration_version: number | string;
    }>(
      `SELECT t.id, t.program_id, p.name AS program_title, t.name, t.phase, t.measurement_method, t.expected_trial_count,
              t.operational_definition, t.teaching_instructions, t.prompt_hierarchy, t.configuration_version
       FROM client_targets t
       JOIN client_programs p ON p.id = t.program_id
       WHERE t.client_id = $1 AND t.status = 'active' AND p.status = 'active'
       ORDER BY p.name, t.sort_order, t.created_at`,
      [client.id],
    );
    const observationIds = await tx.query<{ id: string }>(
      `SELECT id FROM session_observations WHERE session_id = $1 ORDER BY created_at`,
      [sessionId],
    );
    const observations: CollectedObservation[] = [];
    for (const item of observationIds) observations.push(await loadObservation(tx, asString(item.id)));
    const mappedTargets = targets.map((target) => ({
      id: asString(target.id),
      programId: asString(target.program_id),
      programTitle: asString(target.program_title),
      title: asString(target.name),
      phase: asString(target.phase),
      measurementMethod: target.measurement_method,
      expectedTrialCount: target.expected_trial_count == null ? null : Number(target.expected_trial_count),
      operationalDefinition: asString(target.operational_definition),
      teachingInstructions: asString(target.teaching_instructions),
      promptHierarchy: asString(target.prompt_hierarchy),
      configurationVersion: Number(target.configuration_version),
    }));
    const summary = buildSummary(observations, mappedTargets);
    return {
      ...summarize({ ...row, observation_count: summary.observationCount }),
      note: asString(row.note),
      targets: mappedTargets,
      observations,
      summary,
    };
  }
}

interface SessionRow {
  id: string;
  client_id: string;
  status: TherapySessionSummary['status'];
  setting: string;
  location: string;
  note: string;
}

async function lockSession(tx: Queryable, organizationId: string, sessionId: string): Promise<SessionRow> {
  const rows = await tx.query<SessionRow & { [key: string]: unknown }>(
    `SELECT id, client_id, status, setting, location, note
     FROM therapy_sessions WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
    [sessionId, organizationId],
  );
  const row = rows[0];
  if (!row) throw new NotFoundException('That session was not found.');
  return {
    id: asString(row.id),
    client_id: asString(row.client_id),
    status: row.status,
    setting: asString(row.setting),
    location: asString(row.location),
    note: asString(row.note),
  };
}

function assignmentScope(user: AuthUser, params: unknown[]): string {
  if (user.role !== 'therapist' && user.role !== 'parent') return '';
  params.push(user.id);
  const relationship = user.role === 'parent' ? 'guardian' : 'therapist';
  return `AND EXISTS (
    SELECT 1 FROM client_assignments assigned
    WHERE assigned.client_id = s.client_id AND assigned.user_id = $${params.length}
      AND assigned.relationship = '${relationship}' AND assigned.ended_at IS NULL
  )`;
}

function summarize(row: {
  id: string;
  client_id: string;
  client_name: string;
  therapist_id: string | null;
  therapist_name: string | null;
  started_at: Date | string;
  ended_at: Date | string | null;
  interrupted_at: Date | string | null;
  status: TherapySessionSummary['status'];
  setting: string;
  location: string;
  observation_count: number | string;
}): TherapySessionSummary {
  return {
    id: asString(row.id),
    clientId: asString(row.client_id),
    clientName: asString(row.client_name),
    therapistId: row.therapist_id ? asString(row.therapist_id) : null,
    therapistName: row.therapist_name ? asString(row.therapist_name) : null,
    startedAt: asDate(row.started_at).toISOString(),
    endedAt: row.ended_at ? asDate(row.ended_at).toISOString() : null,
    interruptedAt: row.interrupted_at ? asDate(row.interrupted_at).toISOString() : null,
    status: row.status,
    setting: asString(row.setting),
    location: asString(row.location),
    observationCount: Number(row.observation_count),
  };
}

function buildSummary(observations: CollectedObservation[], targets: Array<{ id: string; expectedTrialCount: number | null }>): TherapySessionDetail['summary'] {
  const recorded = observations.filter((item) => item.status === 'recorded');
  const byMethod: TherapySessionDetail['summary']['byMethod'] = { trial: 0, probe: 0, frequency: 0, duration: 0, abc: 0 };
  for (const item of recorded) byMethod[item.measurementMethod] += 1;
  const expected = new Map(targets.map((target) => [target.id, target.expectedTrialCount ?? 0]));
  const incomplete = observations.filter((item) => item.status === 'draft').map((item) => ({
    observationId: item.id,
    targetId: item.targetId,
    targetTitle: item.targetTitle,
    recordedTrials: item.trials.filter((trial) => !trial.voidedAt).length,
    expectedTrials: expected.get(item.targetId) ?? 0,
  }));
  return {
    recordedTargetCount: new Set(recorded.map((item) => item.targetId)).size,
    observationCount: recorded.length,
    byMethod,
    incomplete,
    canComplete: incomplete.length === 0,
  };
}

async function findByKey(tx: Queryable, organizationId: string, key: string): Promise<{ id: string; request_fingerprint: string | null } | null> {
  const rows = await tx.query<{ id: string; request_fingerprint: string | null }>(
    `SELECT id, request_fingerprint FROM session_observations WHERE organization_id = $1 AND idempotency_key = $2`,
    [organizationId, key],
  );
  return rows[0] ?? null;
}

async function replay(tx: Queryable, existing: { id: string; request_fingerprint: string | null }, print: string): Promise<CollectedObservation> {
  if (existing.request_fingerprint !== print) {
    throw new ConflictException('This submission was already saved with different data. Review the saved observation instead of overwriting it.');
  }
  return loadObservation(tx, asString(existing.id));
}

async function activeTarget(tx: Queryable, clientId: string, targetId: string): Promise<{ id: string; configuration_version: number }> {
  const rows = await tx.query<{ id: string; configuration_version: number | string; status: string }>(
    `SELECT t.id, t.configuration_version, t.status
     FROM client_targets t
     JOIN client_programs p ON p.id = t.program_id
     WHERE t.id = $1 AND t.client_id = $2 AND t.status = 'active' AND p.status = 'active'`,
    [targetId, clientId],
  );
  const row = rows[0];
  if (!row) throw new NotFoundException('That active target was not found.');
  return { id: asString(row.id), configuration_version: Number(row.configuration_version) };
}

async function configuration(tx: Queryable, targetId: string, version: number): Promise<{ id: string; measurement_method: MeasurementMethod; expected_trial_count: number | null }> {
  const rows = await tx.query<{ id: string; measurement_method: MeasurementMethod; expected_trial_count: number | null }>(
    `SELECT id, measurement_method, expected_trial_count FROM target_configuration_versions WHERE target_id = $1 AND version = $2`,
    [targetId, version],
  );
  const row = rows[0];
  if (!row) throw new BadRequestException('This target has no saved measurement configuration.');
  return { id: asString(row.id), measurement_method: row.measurement_method, expected_trial_count: row.expected_trial_count == null ? null : Number(row.expected_trial_count) };
}

async function observationRow(tx: Queryable, sessionId: string, observationId: string): Promise<{
  id: string;
  target_id: string;
  status: ObservationStatus;
  configuration_version_id: string;
  amended_from_id: string | null;
}> {
  const rows = await tx.query<{ id: string; target_id: string; status: ObservationStatus; configuration_version_id: string; amended_from_id: string | null }>(
    `SELECT id, target_id, status, configuration_version_id, amended_from_id
     FROM session_observations WHERE id = $1 AND session_id = $2`,
    [observationId, sessionId],
  );
  const row = rows[0];
  if (!row) throw new NotFoundException('That observation was not found.');
  return {
    id: asString(row.id),
    target_id: asString(row.target_id),
    status: row.status,
    configuration_version_id: asString(row.configuration_version_id),
    amended_from_id: row.amended_from_id ? asString(row.amended_from_id) : null,
  };
}

async function insertObservation(tx: Queryable, input: {
  id: string;
  organizationId: string;
  clientId: string;
  sessionId: string;
  targetId: string;
  versionId: string;
  method: MeasurementMethod;
  prepared: PreparedObservation;
  key: string;
  print: string;
  userId: string;
  amendedFromId: string | null;
  reason: string;
}): Promise<void> {
  const value = input.prepared;
  await tx.query(
    `INSERT INTO session_observations (
       id, organization_id, client_id, session_id, target_id, configuration_version_id, measurement_method,
       note, frequency_count, duration_seconds, antecedent, behavior_note, consequence, recorded_by,
       idempotency_key, request_fingerprint, status, entry_mode, window_started_at, window_ended_at,
       duration_unit, started_at, ended_at, occurred_at, context_note, rate_per_minute, amended_from_id, amendment_reason
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28
     )`,
    [
      input.id, input.organizationId, input.clientId, input.sessionId, input.targetId, input.versionId, input.method,
      value.note, value.frequencyCount, value.durationSeconds, value.antecedent, value.behaviorNote, value.consequence, input.userId,
      input.key, input.print, value.status, value.entryMode, value.windowStartedAt?.toISOString() ?? null, value.windowEndedAt?.toISOString() ?? null,
      value.durationUnit, value.startedAt?.toISOString() ?? null, value.endedAt?.toISOString() ?? null, value.occurredAt?.toISOString() ?? null,
      value.contextNote, value.ratePerMinute, input.amendedFromId, input.reason,
    ],
  );
}

async function insertTrials(tx: Queryable, organizationId: string, observationId: string, trials: TrialWrite[]): Promise<void> {
  for (const trial of trials) {
    await tx.query(
      `INSERT INTO observation_trials (organization_id, observation_id, trial_number, result, prompt_level, idempotency_key, request_fingerprint)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [organizationId, observationId, trial.trialNumber, trial.result, trial.promptLevel?.trim() || null, trial.idempotencyKey || null, trial.idempotencyKey ? fingerprint(trial) : null],
    );
  }
}

async function refreshTrialStatus(tx: Queryable, observationId: string, expected: number | null): Promise<void> {
  const rows = await tx.query<{ count: number | string }>(
    `SELECT count(*) AS count FROM observation_trials WHERE observation_id = $1 AND voided_at IS NULL`,
    [observationId],
  );
  const count = Number(rows[0]?.count ?? 0);
  const status = expected != null && count >= expected ? 'recorded' : 'draft';
  await tx.query(`UPDATE session_observations SET status = $2 WHERE id = $1 AND status IN ('draft', 'recorded')`, [observationId, status]);
}

async function loadObservation(tx: Queryable, observationId: string): Promise<CollectedObservation> {
  const rows = await tx.query<{
    id: string; session_id: string; target_id: string; target_title: string; configuration_version: number | string;
    measurement_method: MeasurementMethod; status: ObservationStatus; entry_mode: ObservationEntryMode; note: string;
    frequency_count: number | null; duration_seconds: number | null; duration_unit: DurationUnit;
    window_started_at: Date | string | null; window_ended_at: Date | string | null; started_at: Date | string | null;
    ended_at: Date | string | null; occurred_at: Date | string | null; antecedent: string | null; behavior_note: string | null;
    consequence: string | null; context_note: string; rate_per_minute: number | string | null; amended_from_id: string | null;
    created_at: Date | string;
  }>(
    `SELECT o.id, o.session_id, o.target_id, t.name AS target_title, v.version AS configuration_version,
            o.measurement_method, o.status, o.entry_mode, o.note, o.frequency_count, o.duration_seconds, o.duration_unit,
            o.window_started_at, o.window_ended_at, o.started_at, o.ended_at, o.occurred_at, o.antecedent, o.behavior_note,
            o.consequence, o.context_note, o.rate_per_minute, o.amended_from_id, o.created_at
     FROM session_observations o
     JOIN client_targets t ON t.id = o.target_id
     JOIN target_configuration_versions v ON v.id = o.configuration_version_id
     WHERE o.id = $1`,
    [observationId],
  );
  const row = rows[0];
  if (!row) throw new NotFoundException('That observation was not found.');
  const trials = await tx.query<{ id: string; trial_number: number | string; result: TrialResult; prompt_level: string | null; voided_at: Date | string | null }>(
    `SELECT id, trial_number, result, prompt_level, voided_at FROM observation_trials WHERE observation_id = $1 ORDER BY trial_number`,
    [observationId],
  );
  return {
    id: asString(row.id),
    sessionId: asString(row.session_id),
    targetId: asString(row.target_id),
    targetTitle: asString(row.target_title),
    configurationVersion: Number(row.configuration_version),
    measurementMethod: row.measurement_method,
    status: row.status,
    entryMode: row.entry_mode,
    note: asString(row.note),
    frequencyCount: row.frequency_count == null ? null : Number(row.frequency_count),
    durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
    durationUnit: row.duration_unit,
    windowStartedAt: row.window_started_at ? asDate(row.window_started_at).toISOString() : null,
    windowEndedAt: row.window_ended_at ? asDate(row.window_ended_at).toISOString() : null,
    startedAt: row.started_at ? asDate(row.started_at).toISOString() : null,
    endedAt: row.ended_at ? asDate(row.ended_at).toISOString() : null,
    occurredAt: row.occurred_at ? asDate(row.occurred_at).toISOString() : null,
    antecedent: row.antecedent ? asString(row.antecedent) : null,
    behaviorNote: row.behavior_note ? asString(row.behavior_note) : null,
    consequence: row.consequence ? asString(row.consequence) : null,
    contextNote: asString(row.context_note),
    ratePerMinute: row.rate_per_minute == null ? null : Number(row.rate_per_minute),
    amendedFromId: row.amended_from_id ? asString(row.amended_from_id) : null,
    trials: trials.map((trial) => ({
      id: asString(trial.id),
      trialNumber: Number(trial.trial_number),
      result: trial.result,
      promptLevel: trial.prompt_level ? asString(trial.prompt_level) : null,
      voidedAt: trial.voided_at ? asDate(trial.voided_at).toISOString() : null,
    })),
    recordedAt: asDate(row.created_at).toISOString(),
  };
}

function prepareObservation(method: MeasurementMethod, expected: number | null, input: ObservationWrite): PreparedObservation {
  const trials = input.trials ?? [];
  if (method === 'trial' || method === 'probe') {
    if (trials.length === 0) throw new BadRequestException('Record at least one trial.');
    if (expected == null) throw new BadRequestException('This target is missing an expected trial count.');
    const numbers = new Set<number>();
    for (const trial of trials) {
      assertTrial(trial, expected);
      if (numbers.has(trial.trialNumber)) throw new BadRequestException('Number each trial once.');
      numbers.add(trial.trialNumber);
    }
    rejectForeign(input, 'trial');
    return blank({
      entryMode: 'summary',
      trials,
      status: trials.length === expected ? 'recorded' : 'draft',
      note: input.note?.trim() ?? '',
    });
  }
  if (trials.length > 0) throw new BadRequestException('This measurement method does not use trials.');
  if (method === 'frequency') return prepareFrequency(input);
  if (method === 'duration') return prepareDuration(input);
  return prepareAbc(input);
}

function prepareFrequency(input: ObservationWrite): PreparedObservation {
  if (input.frequencyCount == null || !Number.isInteger(input.frequencyCount) || input.frequencyCount < 0) {
    throw new BadRequestException('Enter a frequency count of zero or more.');
  }
  const window = readWindow(input.windowStartedAt, input.windowEndedAt);
  const occurredAt = parseTime(input.occurredAt, 'event time');
  const entryMode: ObservationEntryMode = input.frequencyCount === 1 && occurredAt && !window.start ? 'event' : 'summary';
  if (entryMode === 'event' && !occurredAt) throw new BadRequestException('Enter the time of the event.');
  let rate: number | null = null;
  if (window.start && window.end) {
    const minutes = (window.end.getTime() - window.start.getTime()) / 60000;
    rate = Math.round((input.frequencyCount / minutes) * 10000) / 10000;
  }
  return blank({
    entryMode,
    frequencyCount: input.frequencyCount,
    windowStartedAt: window.start,
    windowEndedAt: window.end,
    occurredAt,
    ratePerMinute: rate,
    note: input.note?.trim() ?? '',
    status: 'recorded',
  });
}

function prepareDuration(input: ObservationWrite): PreparedObservation {
  const startedAt = parseTime(input.startedAt, 'duration start');
  const endedAt = parseTime(input.endedAt, 'duration end');
  const unit: DurationUnit = input.durationUnit === 'minutes' ? 'minutes' : 'seconds';
  if (startedAt || endedAt) {
    if (!startedAt || !endedAt) throw new BadRequestException('Enter both the duration start and end.');
    if (endedAt.getTime() <= startedAt.getTime()) throw new BadRequestException('The duration end must be after the start.');
    const seconds = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);
    if (seconds <= 0 || seconds > 86400) throw new BadRequestException('Duration must be between 1 second and 24 hours.');
    if (input.durationSeconds != null && Math.abs(input.durationSeconds - seconds) > 1) {
      throw new BadRequestException('The entered duration does not match the start and end times.');
    }
    return blank({ entryMode: 'timer', startedAt, endedAt, durationSeconds: seconds, durationUnit: 'seconds', note: input.note?.trim() ?? '', status: 'recorded' });
  }
  if (input.durationSeconds == null || !Number.isInteger(input.durationSeconds) || input.durationSeconds <= 0) {
    throw new BadRequestException('Enter a duration greater than zero.');
  }
  const seconds = unit === 'minutes' ? input.durationSeconds * 60 : input.durationSeconds;
  if (seconds > 86400) throw new BadRequestException('Duration must be 24 hours or less.');
  return blank({ entryMode: 'entered', durationSeconds: seconds, durationUnit: unit, note: input.note?.trim() ?? '', status: 'recorded' });
}

function prepareAbc(input: ObservationWrite): PreparedObservation {
  const antecedent = input.antecedent?.trim() ?? '';
  const behaviorNote = input.behaviorNote?.trim() ?? '';
  const consequence = input.consequence?.trim() ?? '';
  if (!antecedent || !behaviorNote || !consequence) {
    throw new BadRequestException('Enter the antecedent, behavior, and consequence.');
  }
  const occurredAt = parseTime(input.occurredAt, 'ABC timestamp');
  if (!occurredAt) throw new BadRequestException('Enter the time of the ABC observation.');
  const duration = input.durationSeconds != null || input.startedAt || input.endedAt ? prepareDuration(input) : null;
  return blank({
    entryMode: duration?.entryMode === 'timer' ? 'timer' : 'summary',
    antecedent,
    behaviorNote,
    consequence,
    occurredAt,
    contextNote: input.contextNote?.trim() ?? '',
    note: input.note?.trim() ?? '',
    durationSeconds: duration?.durationSeconds ?? null,
    durationUnit: duration?.durationUnit ?? 'seconds',
    startedAt: duration?.startedAt ?? null,
    endedAt: duration?.endedAt ?? null,
    status: 'recorded',
  });
}

function rejectForeign(input: ObservationWrite, kind: 'trial'): void {
  if (kind === 'trial' && (input.frequencyCount != null || input.durationSeconds != null || input.antecedent || input.behaviorNote || input.consequence)) {
    throw new BadRequestException('Trial and probe observations do not include frequency, duration, or ABC fields.');
  }
}

function readWindow(startValue: string | undefined, endValue: string | undefined): { start: Date | null; end: Date | null } {
  const start = parseTime(startValue, 'observation start');
  const end = parseTime(endValue, 'observation end');
  if (Boolean(start) !== Boolean(end)) throw new BadRequestException('Enter both the observation start and end.');
  if (start && end) {
    if (end.getTime() <= start.getTime()) throw new BadRequestException('The observation end must be after the start.');
    if (end.getTime() - start.getTime() > MAX_WINDOW_MS) throw new BadRequestException('An observation window must be 24 hours or less.');
  }
  return { start, end };
}

function assertTrial(trial: TrialWrite, expected: number | null): void {
  if (!Number.isInteger(trial.trialNumber) || trial.trialNumber < 1 || (expected != null && trial.trialNumber > expected)) {
    throw new BadRequestException('That trial number is outside the configured set.');
  }
  if (!RESULTS.has(trial.result)) throw new BadRequestException('Choose a configured trial outcome.');
  requireKey(trial.idempotencyKey);
}

function blank(partial: Partial<PreparedObservation> & Pick<PreparedObservation, 'entryMode' | 'status'>): PreparedObservation {
  return {
    entryMode: partial.entryMode,
    note: partial.note ?? '',
    frequencyCount: partial.frequencyCount ?? null,
    durationSeconds: partial.durationSeconds ?? null,
    durationUnit: partial.durationUnit ?? 'seconds',
    windowStartedAt: partial.windowStartedAt ?? null,
    windowEndedAt: partial.windowEndedAt ?? null,
    startedAt: partial.startedAt ?? null,
    endedAt: partial.endedAt ?? null,
    occurredAt: partial.occurredAt ?? null,
    antecedent: partial.antecedent ?? null,
    behaviorNote: partial.behaviorNote ?? null,
    consequence: partial.consequence ?? null,
    contextNote: partial.contextNote ?? '',
    ratePerMinute: partial.ratePerMinute ?? null,
    trials: partial.trials ?? [],
    status: partial.status,
  };
}

function parseTime(value: string | undefined, label: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`Enter a valid ${label}.`);
  return date;
}

function assertStartTime(startedAt: Date): void {
  const now = Date.now();
  if (startedAt.getTime() > now + 2 * 60 * 1000) throw new BadRequestException('The session start cannot be in the future.');
  if (now - startedAt.getTime() > 12 * 60 * 60 * 1000) throw new BadRequestException('The session start must be within the last 12 hours.');
}

function requireKey(value: string | undefined): string {
  const key = value?.trim() ?? '';
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new BadRequestException('Each submission needs a stable idempotency key.');
  return key;
}

function requireReason(reason: string | undefined): string {
  const text = reason?.trim() ?? '';
  if (text.length < 12) throw new BadRequestException('Enter a reason of at least 12 characters for this clinical change.');
  return text;
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(stable(value)).digest('hex');
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stable(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

async function assertCollector(tx: Queryable, organizationId: string, userId: string): Promise<void> {
  const rows = await tx.query(
    `SELECT 1 AS present FROM organization_memberships
     WHERE organization_id = $1 AND user_id = $2 AND status = 'active' AND role IN ('therapist', 'clinical_supervisor', 'organization_admin')`,
    [organizationId, userId],
  );
  if (rows.length === 0) throw new BadRequestException('The session therapist must be an active clinician in this organization.');
}
