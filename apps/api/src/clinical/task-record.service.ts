import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  PERMISSIONS,
  PROMPT_LEVELS,
  RECORDABLE_STATUSES,
  type AuthUser,
  type CareStatus,
  type PromptLevel,
  type RecordPhaseGroup,
  type SessionHistory,
  type SessionHistoryEntry,
  type SessionHistoryFilters,
  type RecordResponse,
  type TaskRecord,
  type TaskRecordDay,
  type TaskRecordHistory,
  type TaskRecordingStatus,
  type TaskRecordWrite,
} from '@abapro/shared';
import { recordAudit } from '../common/audit';
import { asDate, asNullableNumber, asString } from '../common/http';
import type { Queryable } from '../db/database';
import { AuthorizationService } from '../access/authorization.service';

/** Mastery Sessions when a task has none set, as the task forms default it. */
const DEFAULT_SESSIONS_PER_DAY = 3;
const HISTORY_RECORD_LIMIT = 200;

interface TargetLimits {
  id: string;
  programId: string;
  clientId: string;
  phase: string;
  status: CareStatus;
  programStatus: CareStatus;
  promptUsed: boolean;
  trialsPerSession: number;
  sessionsPerDay: number;
}

interface LastRecord {
  session: number;
  trial: number;
  recorded: number;
}

/**
 * Yes/No records on tasks. Desired Trials caps the records in a session (Treatment phase only; other phases record
 * one trial per session) and Mastery Sessions caps the sessions in a day. Every therapist on the client shares them.
 */
@Injectable()
export class TaskRecordService {
  constructor(@Inject(AuthorizationService) private readonly authorization: AuthorizationService) {}

  async statuses(user: AuthUser, clientId: string): Promise<TaskRecordingStatus[]> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const client = await this.authorization.findAccessibleClient(tx, user, organizationId, clientId, 'view', PERMISSIONS.programsView);
      const targets = await targetLimits(tx, organizationId, 't.client_id = $2', [client.id]);
      const date = await clientToday(tx, client.id);
      const last = await lastRecords(tx, client.id, date);
      return targets.map((target) => recordingStatus(target, date, last.get(target.id), mayRecord(user, target)));
    });
  }

  async history(user: AuthUser, targetId: string, from?: string): Promise<TaskRecordHistory> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const target = await findTarget(tx, organizationId, targetId);
      await this.authorization.findAccessibleClient(tx, user, organizationId, target.clientId, 'view', PERMISSIONS.programsView);
      const date = await clientToday(tx, target.clientId);
      const last = await lastRecords(tx, target.clientId, date);
      const params: unknown[] = [target.id];
      let range = '';
      if (from) {
        params.push(from);
        range = `AND r.record_date >= $${params.length}::date`;
      }
      const days = await tx.query<{ day: string; yes: number | string; no: number | string }>(
        `SELECT to_char(r.record_date, 'YYYY-MM-DD') AS day,
                count(*) FILTER (WHERE r.response = 'yes') AS yes,
                count(*) FILTER (WHERE r.response = 'no') AS no
         FROM task_records r
         WHERE r.target_id = $1 ${range}
         GROUP BY r.record_date
         ORDER BY r.record_date`,
        params,
      );
      const records = await tx.query<{
        id: string; target_id: string; client_id: string; therapist_id: string; therapist_name: string; response: RecordResponse | null;
        prompt_levels: string;
        record_date: string; session_number: number; trial_number: number; recorded_at: unknown;
      }>(
        `SELECT r.id, r.target_id, r.client_id, r.therapist_id, u.name AS therapist_name, r.response,
                array_to_string(r.prompt_levels, ',') AS prompt_levels,
                to_char(r.record_date, 'YYYY-MM-DD') AS record_date, r.session_number, r.trial_number, r.recorded_at
         FROM task_records r
         JOIN users u ON u.id = r.therapist_id
         WHERE r.target_id = $1 ${range}
         ORDER BY r.recorded_at DESC, r.session_number DESC, r.trial_number DESC
         LIMIT ${HISTORY_RECORD_LIMIT}`,
        params,
      );
      const promptCounts = await tx.query<{ day: string; level: PromptLevel; selected: number | string }>(
        `SELECT to_char(r.record_date, 'YYYY-MM-DD') AS day, level, count(*) AS selected
         FROM task_records r, unnest(r.prompt_levels) AS level
         WHERE r.target_id = $1 ${range}
         GROUP BY r.record_date, level`,
        params,
      );
      const prompts = new Map<string, Record<PromptLevel, number>>();
      for (const row of promptCounts) {
        const day = asString(row.day);
        const counts = prompts.get(day) ?? emptyPromptCounts();
        counts[row.level] = Number(row.selected);
        prompts.set(day, counts);
      }
      return {
        status: recordingStatus(target, date, last.get(target.id), mayRecord(user, target)),
        days: days.map((row): TaskRecordDay => ({
          date: asString(row.day),
          yes: Number(row.yes),
          no: Number(row.no),
          prompts: prompts.get(asString(row.day)) ?? emptyPromptCounts(),
        })),
        records: records.map((row): TaskRecord => ({
          id: asString(row.id),
          targetId: asString(row.target_id),
          clientId: asString(row.client_id),
          therapistId: asString(row.therapist_id),
          therapistName: asString(row.therapist_name),
          response: row.response ?? null,
          promptLevels: row.prompt_levels ? (asString(row.prompt_levels).split(',') as PromptLevel[]) : [],
          recordDate: asString(row.record_date),
          sessionNumber: Number(row.session_number),
          trialNumber: Number(row.trial_number),
          recordedAt: asDate(row.recorded_at).toISOString(),
        })),
      };
    });
  }

  /**
   * Every record saved on a program's tasks, for organisation administrators (super admins act as one inside an
   * organisation). Read-only: records are never changed or removed.
   */
  async sessionHistory(user: AuthUser, programId: string, filters: SessionHistoryFilters): Promise<SessionHistory> {
    if (user.role !== 'organization_admin') {
      throw new ForbiddenException('Only organisation administrators can view session history.');
    }
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      const programs = await tx.query<{ id: string; name: string; client_id: string; client_name: string }>(
        `SELECT p.id, p.name, p.client_id, c.display_name AS client_name
         FROM client_programs p JOIN clients c ON c.id = p.client_id
         WHERE p.id = $1 AND p.organization_id = $2`,
        [programId, organizationId],
      );
      const program = programs[0];
      if (!program) throw new NotFoundException('That program was not found.');
      await this.authorization.findAccessibleClient(tx, user, organizationId, asString(program.client_id), 'view', PERMISSIONS.programsView);

      const tasks = await tx.query<{ id: string; name: string }>(
        `SELECT id, name FROM client_targets WHERE program_id = $1 ORDER BY sort_order, created_at`,
        [programId],
      );
      const therapists = await tx.query<{ id: string; name: string }>(
        `SELECT DISTINCT u.id, u.name FROM task_records r JOIN users u ON u.id = r.therapist_id
         WHERE r.program_id = $1 ORDER BY u.name`,
        [programId],
      );

      const params: unknown[] = [programId];
      const conditions = ['r.program_id = $1'];
      const add = (sql: string, value: unknown) => {
        params.push(value);
        conditions.push(sql.replace('?', `$${params.length}`));
      };
      if (filters.taskId) add('r.target_id = ?::uuid', filters.taskId);
      if (filters.therapistId) add('r.therapist_id = ?::uuid', filters.therapistId);
      if (filters.phase) add(`r.phase = ANY(string_to_array(?, ','))`, PHASE_GROUPS[filters.phase].join(','));
      if (filters.from) add('r.record_date >= ?::date', filters.from);
      if (filters.to) add('r.record_date <= ?::date', filters.to);
      const where = conditions.join(' AND ');

      const rows = await tx.query<{
        id: string; recorded_at: unknown; record_date: string; therapist_id: string; therapist_name: string;
        client_id: string; client_name: string; target_id: string; task_title: string; phase: string;
        session_number: number; trial_number: number; trials_per_session: number; sessions_per_day: number;
        response: RecordResponse | null; prompt_levels: string; task_status: CareStatus; program_status: CareStatus;
      }>(
        `SELECT r.id, r.recorded_at, to_char(r.record_date, 'YYYY-MM-DD') AS record_date,
                r.therapist_id, u.name AS therapist_name, r.client_id, c.display_name AS client_name,
                r.target_id, t.name AS task_title, r.phase, r.session_number, r.trial_number,
                r.trials_per_session, r.sessions_per_day, r.response,
                array_to_string(r.prompt_levels, ',') AS prompt_levels, r.task_status, r.program_status
         FROM task_records r
         JOIN users u ON u.id = r.therapist_id
         JOIN clients c ON c.id = r.client_id
         JOIN client_targets t ON t.id = r.target_id
         WHERE ${where}
         ORDER BY r.recorded_at DESC, r.session_number DESC, r.trial_number DESC
         LIMIT ${SESSION_HISTORY_LIMIT}`,
        params,
      );
      const counted = await tx.query<{ total: number | string }>(`SELECT count(*) AS total FROM task_records r WHERE ${where}`, params);
      const totals = await tx.query<{ target_id: string; task_title: string; therapist_id: string; therapist_name: string; trials: number | string }>(
        `SELECT r.target_id, t.name AS task_title, r.therapist_id, u.name AS therapist_name, count(*) AS trials
         FROM task_records r
         JOIN users u ON u.id = r.therapist_id
         JOIN client_targets t ON t.id = r.target_id
         WHERE ${where}
         GROUP BY r.target_id, t.name, t.sort_order, r.therapist_id, u.name
         ORDER BY t.sort_order, t.name, u.name`,
        params,
      );

      return {
        programId: asString(program.id),
        programTitle: asString(program.name),
        clientName: asString(program.client_name),
        tasks: tasks.map((row) => ({ id: asString(row.id), title: asString(row.name) })),
        therapists: therapists.map((row) => ({ id: asString(row.id), name: asString(row.name) })),
        entries: rows.map((row): SessionHistoryEntry => ({
          id: asString(row.id),
          recordedAt: asDate(row.recorded_at).toISOString(),
          recordDate: asString(row.record_date),
          therapistId: asString(row.therapist_id),
          therapistName: asString(row.therapist_name),
          clientId: asString(row.client_id),
          clientName: asString(row.client_name),
          taskId: asString(row.target_id),
          taskTitle: asString(row.task_title),
          phase: phaseGroup(asString(row.phase)),
          sessionNumber: Number(row.session_number),
          trialNumber: Number(row.trial_number),
          trialsPerSession: Number(row.trials_per_session),
          sessionsPerDay: Number(row.sessions_per_day),
          response: row.response ?? null,
          promptLevels: row.prompt_levels ? (asString(row.prompt_levels).split(',') as PromptLevel[]) : [],
          taskStatus: row.task_status,
          programStatus: row.program_status,
        })),
        total: Number(counted[0]?.total ?? 0),
        totals: totals.map((row) => ({
          taskId: asString(row.target_id),
          taskTitle: asString(row.task_title),
          therapistId: asString(row.therapist_id),
          therapistName: asString(row.therapist_name),
          trials: Number(row.trials),
        })),
      };
    });
  }

  async record(user: AuthUser, targetId: string, input: TaskRecordWrite): Promise<TaskRecordingStatus> {
    return this.authorization.withOrganization(user, async (tx, organizationId) => {
      // Locking the task makes concurrent records for it wait, so each one sees the previous one's trial.
      const target = await findTarget(tx, organizationId, targetId, true);
      if (user.role !== 'therapist') {
        throw new ForbiddenException('Only therapists assigned to this client can record.');
      }
      await this.authorization.findAccessibleClient(tx, user, organizationId, target.clientId, 'view', PERMISSIONS.programsView);

      const repeated = await tx.query<{ target_id: string; therapist_id: string }>(
        `SELECT target_id, therapist_id FROM task_records WHERE id = $1`,
        [input.requestId],
      );
      const date = await clientToday(tx, target.clientId);
      if (repeated[0]) {
        // The same submit arriving twice saves once.
        if (asString(repeated[0].target_id) !== target.id || asString(repeated[0].therapist_id) !== user.id) {
          throw new ConflictException('That record was already saved.');
        }
        const last = await lastRecords(tx, target.clientId, date);
        return recordingStatus(target, date, last.get(target.id), mayRecord(user, target));
      }
      // Read under the lock, so a status change saved at the same time is seen.
      if (!RECORDABLE_STATUSES.includes(target.status)) {
        throw new ConflictException('Only tasks In Treatment or Maintenance can be recorded.');
      }
      const { response, promptLevels } = recordedValue(target, input);

      const before = recordingStatus(target, date, (await lastRecords(tx, target.clientId, date)).get(target.id), true);
      if (before.nextSession === null || before.nextTrial === null) {
        throw new ConflictException(
          `Today's limit for this task is reached: ${plural(target.sessionsPerDay, 'session')} of ${plural(target.trialsPerSession, 'trial')}.`,
        );
      }
      try {
        await tx.query(
          `INSERT INTO task_records (
             id, organization_id, client_id, program_id, target_id, therapist_id, response, record_date,
             session_number, trial_number, trials_per_session, sessions_per_day, phase, prompt_levels,
             task_status, program_status
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9,$10,$11,$12,$13,COALESCE(string_to_array(NULLIF($14, ''), ','), '{}'),$15,$16)`,
          [
            input.requestId, organizationId, target.clientId, target.programId, target.id, user.id, response, date,
            before.nextSession, before.nextTrial, target.trialsPerSession, target.sessionsPerDay, target.phase,
            promptLevels.join(','), target.status, target.programStatus,
          ],
        );
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new ConflictException('Another record for this task was saved at the same moment. Try again.');
        }
        throw error;
      }
      await recordAudit(tx, {
        organizationId, actorUserId: user.id, action: 'target.recorded', targetType: 'target', targetId: target.id,
        metadata: { clientId: target.clientId, programId: target.programId, session: before.nextSession, trial: before.nextTrial, promptLevels },
      });
      const last = await lastRecords(tx, target.clientId, date);
      return recordingStatus(target, date, last.get(target.id), true);
    });
  }
}

/** Raw phases saved on records, by the group Session History shows. */
const PHASE_GROUPS: Record<RecordPhaseGroup, string[]> = {
  baseline: ['baseline'],
  treatment: ['intervention'],
  mastery: ['maintenance', 'mastered'],
};
const SESSION_HISTORY_LIMIT = 500;

function phaseGroup(phase: string): RecordPhaseGroup {
  if (PHASE_GROUPS.baseline.includes(phase)) return 'baseline';
  if (PHASE_GROUPS.mastery.includes(phase)) return 'mastery';
  return 'treatment';
}

/**
 * Assigned therapists record tasks In Treatment or Maintenance; supervisors and administrators only view.
 * Client access is checked separately.
 */
function mayRecord(user: AuthUser, target: TargetLimits): boolean {
  return user.role === 'therapist' && RECORDABLE_STATUSES.includes(target.status);
}

/** A Prompt Used task takes one or more prompt levels; any other task takes Yes or No. */
function recordedValue(target: TargetLimits, input: TaskRecordWrite): { response: RecordResponse | null; promptLevels: PromptLevel[] } {
  const chosen = input.promptLevels ?? [];
  if (target.promptUsed) {
    if (input.response !== undefined || chosen.length === 0 || chosen.some((level) => !PROMPT_LEVELS.includes(level))) {
      throw new BadRequestException('This task uses prompts. Choose one or more prompt levels.');
    }
    return { response: null, promptLevels: PROMPT_LEVELS.filter((level) => chosen.includes(level)) };
  }
  if (input.response === undefined || chosen.length > 0) {
    throw new BadRequestException('Choose + (Yes) or − (No).');
  }
  return { response: input.response, promptLevels: [] };
}

function emptyPromptCounts(): Record<PromptLevel, number> {
  return Object.fromEntries(PROMPT_LEVELS.map((level) => [level, 0])) as Record<PromptLevel, number>;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

async function findTarget(tx: Queryable, organizationId: string, targetId: string, lock = false): Promise<TargetLimits> {
  const [target] = await targetLimits(tx, organizationId, 't.id = $2', [targetId], lock);
  if (!target) throw new NotFoundException('That task was not found.');
  return target;
}

async function targetLimits(tx: Queryable, organizationId: string, where: string, params: unknown[], lock = false): Promise<TargetLimits[]> {
  const rows = await tx.query<{
    id: string; program_id: string; client_id: string; phase: string; status: CareStatus; program_status: CareStatus;
    prompt_used: boolean; expected_trial_count: number | null; mastery_sessions: number | null;
  }>(
    `SELECT t.id, t.program_id, t.client_id, t.phase, t.status, p.status AS program_status, t.prompt_used,
            t.expected_trial_count, t.mastery_sessions
     FROM client_targets t
     JOIN client_programs p ON p.id = t.program_id
     WHERE t.organization_id = $1 AND ${where}
     ORDER BY t.sort_order, t.created_at
     ${lock ? 'FOR UPDATE OF t' : ''}`,
    [organizationId, ...params],
  );
  return rows.map((row) => {
    const phase = asString(row.phase);
    const trials = asNullableNumber(row.expected_trial_count);
    return {
      id: asString(row.id),
      programId: asString(row.program_id),
      clientId: asString(row.client_id),
      phase,
      status: row.status,
      programStatus: row.program_status,
      promptUsed: row.prompt_used === true,
      trialsPerSession: phase === 'intervention' ? Math.max(1, trials ?? 1) : 1,
      sessionsPerDay: Math.max(1, asNullableNumber(row.mastery_sessions) ?? DEFAULT_SESSIONS_PER_DAY),
    };
  });
}

/** Today's date where the client is: the client's time zone, else the organisation's. */
async function clientToday(tx: Queryable, clientId: string): Promise<string> {
  const rows = await tx.query<{ today: string }>(
    `SELECT to_char((now() AT TIME ZONE COALESCE(
              (SELECT z.name FROM pg_timezone_names z WHERE z.name = c.timezone),
              (SELECT z.name FROM pg_timezone_names z WHERE z.name = o.timezone),
              'UTC'))::date, 'YYYY-MM-DD') AS today
     FROM clients c
     JOIN organizations o ON o.id = c.organization_id
     WHERE c.id = $1`,
    [clientId],
  );
  if (!rows[0]) throw new NotFoundException('That client was not found.');
  return asString(rows[0].today);
}

/** The latest session and trial recorded today for each of the client's tasks. */
async function lastRecords(tx: Queryable, clientId: string, date: string): Promise<Map<string, LastRecord>> {
  const rows = await tx.query<{ target_id: string; session_number: number; trial_number: number; recorded: number | string }>(
    `SELECT DISTINCT ON (target_id) target_id, session_number, trial_number,
            count(*) OVER (PARTITION BY target_id) AS recorded
     FROM task_records
     WHERE client_id = $1 AND record_date = $2::date
     ORDER BY target_id, session_number DESC, trial_number DESC`,
    [clientId, date],
  );
  return new Map(rows.map((row) => [
    asString(row.target_id),
    { session: Number(row.session_number), trial: Number(row.trial_number), recorded: Number(row.recorded) },
  ]));
}

export function recordingStatus(target: TargetLimits, date: string, last: LastRecord | undefined, canRecord: boolean): TaskRecordingStatus {
  const { trialsPerSession, sessionsPerDay } = target;
  let nextSession = 1;
  let nextTrial = 1;
  if (last) {
    // Limits can change during a day; the next record continues from the last one under the current limits.
    if (last.trial < trialsPerSession) {
      nextSession = last.session;
      nextTrial = last.trial + 1;
    } else {
      nextSession = last.session + 1;
    }
  }
  const full = nextSession > sessionsPerDay;
  return {
    targetId: target.id,
    date,
    trialsPerSession,
    sessionsPerDay,
    recordedToday: last?.recorded ?? 0,
    remainingToday: full ? 0 : trialsPerSession - nextTrial + 1 + (sessionsPerDay - nextSession) * trialsPerSession,
    nextSession: full ? null : nextSession,
    nextTrial: full ? null : nextTrial,
    promptUsed: target.promptUsed,
    mayRecord: canRecord,
  };
}
