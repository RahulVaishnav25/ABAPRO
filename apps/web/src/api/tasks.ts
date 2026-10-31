import type { CareStatus, MeasurementMethod, ProgramDetail, ProgramSummary, TargetListItem, TargetWrite } from '@abapro/shared';
import { programsRequest, saveTargetRequest, targetRequest, targetsRequest } from './programs';

/** A program target, shaped for the task screens. */
export interface TaskItem {
  id: string;
  name: string;
  measurementMethod: MeasurementMethod;
  desiredTrials: number;
  phase: string;
  masterySessions: number;
  masteryProbe: number;
  baselineSessions?: number;
  baselineProbe?: number;
  sd: string;
  promptUsed: boolean;
  programId: string;
  programTitle: string;
  clientId: string;
  clientName: string;
  status: CareStatus;
}

export interface CreateTaskInput {
  name: string;
  desiredTrials: number;
  phase: string;
  masterySessions: number;
  masteryProbe: number;
  baselineSessions?: number;
  baselineProbe?: number;
  sd: string;
  promptUsed?: boolean;
  /** Chosen in the modal when it is not opened from a program. */
  programId?: string;
  /** Set only from the Edit form. New tasks always start In Treatment. */
  status?: CareStatus;
  /** The API requires a reason when trial count, mastery criteria or status change. */
  changeReason?: string;
}

const DEFAULT_MASTERY_SESSIONS = 3;
const DEFAULT_MASTERY_PROBE = 100;

const PHASE_LABELS: Record<string, string> = {
  baseline: 'Baseline',
  intervention: 'Treatment',
  maintenance: 'Maintenance',
  mastered: 'Mastered',
};

export function displayPhase(phase?: string): string {
  return PHASE_LABELS[phase?.trim().toLowerCase() ?? ''] ?? 'Treatment';
}

export function apiPhase(label: string): string {
  return Object.keys(PHASE_LABELS).find((phase) => PHASE_LABELS[phase] === label) ?? 'intervention';
}

function usesTrials(method: MeasurementMethod): boolean {
  return method === 'trial' || method === 'probe';
}

export function toTask(target: TargetListItem): TaskItem {
  return {
    id: target.id,
    name: target.title,
    measurementMethod: target.measurementMethod,
    desiredTrials: target.expectedTrialCount ?? 1,
    phase: displayPhase(target.phase),
    masterySessions: target.masterySessions ?? DEFAULT_MASTERY_SESSIONS,
    masteryProbe: target.masteryProbe ?? DEFAULT_MASTERY_PROBE,
    baselineSessions: target.baselineSessions ?? undefined,
    // The modal fills a blank baseline probe with 100%, so show the same default.
    baselineProbe: target.baselineProbe ?? (target.phase === 'baseline' ? DEFAULT_MASTERY_PROBE : undefined),
    sd: target.sd,
    promptUsed: target.promptUsed,
    programId: target.programId,
    programTitle: target.programTitle,
    clientId: target.clientId,
    clientName: target.clientName,
    status: target.status,
  };
}

export function programTasks(program: ProgramDetail): TaskItem[] {
  return program.targets.map((target) =>
    toTask({ ...target, programId: program.id, programTitle: program.title, clientId: program.clientId, clientName: program.clientName }),
  );
}

/** Whether saving `input` changes criteria or status, which the API asks a reason for. */
export function taskCriteriaChanged(task: TaskItem, input: CreateTaskInput): boolean {
  const criteria = taskCriteria(input);
  return (usesTrials(task.measurementMethod) && input.desiredTrials !== task.desiredTrials)
    || criteria.masterySessions !== task.masterySessions
    || criteria.masteryProbe !== task.masteryProbe
    || criteria.baselineSessions !== (task.baselineSessions ?? null)
    || criteria.baselineProbe !== (task.baselineProbe ?? null)
    || (input.status !== undefined && input.status !== task.status);
}

function taskCriteria(input: CreateTaskInput) {
  const baseline = input.phase === 'Baseline';
  return {
    sd: input.sd.trim(),
    masterySessions: input.masterySessions,
    masteryProbe: input.masteryProbe,
    baselineSessions: baseline ? input.baselineSessions ?? null : null,
    baselineProbe: baseline ? input.baselineProbe ?? null : null,
  };
}

export async function tasksRequest(): Promise<{ tasks: TaskItem[]; programs: ProgramSummary[] }> {
  const [targets, programs] = await Promise.all([targetsRequest(), programsRequest()]);
  return { tasks: targets.map(toTask), programs };
}

export async function getTaskRequest(taskId: string): Promise<TaskItem> {
  return toTask(await targetRequest(taskId));
}

export async function createTaskRequest(
  program: Pick<ProgramSummary, 'id' | 'measurementType'>,
  input: CreateTaskInput,
): Promise<TaskItem> {
  const detail = await saveTargetRequest(program.id, {
    title: input.name.trim(),
    measurementMethod: program.measurementType,
    expectedTrialCount: usesTrials(program.measurementType) ? input.desiredTrials : undefined,
    phase: apiPhase(input.phase),
    ...taskCriteria(input),
    promptUsed: input.promptUsed ?? false,
  });
  // A new target is placed after the program's existing targets.
  const created = detail.targets.reduce((latest, target) => (target.sortOrder > latest.sortOrder ? target : latest));
  return findTask(detail, created.id);
}

export async function updateTaskRequest(taskId: string, input: CreateTaskInput): Promise<TaskItem> {
  const target = await targetRequest(taskId);
  const current = toTask(target);
  const criteria = taskCriteria(input);
  // The target endpoint replaces every field, so carry over what the task screens do not edit.
  const body: TargetWrite = {
    title: input.name.trim(),
    description: target.description,
    operationalDefinition: target.operationalDefinition,
    measurementMethod: target.measurementMethod,
    expectedTrialCount: usesTrials(target.measurementMethod) ? input.desiredTrials : undefined,
    baselineNote: target.baselineNote,
    teachingInstructions: target.teachingInstructions,
    promptHierarchy: target.promptHierarchy,
    masteryCriteria: target.masteryCriteria,
    phase: apiPhase(input.phase),
    status: input.status ?? target.status,
    startedOn: target.startedOn ?? undefined,
    reviewOn: target.reviewOn ?? undefined,
    clinicalNotes: target.clinicalNotes,
    sd: criteria.sd,
    // Targets saved before these fields existed show defaults; only send values the user changed.
    masterySessions: criteria.masterySessions === current.masterySessions ? undefined : criteria.masterySessions,
    masteryProbe: criteria.masteryProbe === current.masteryProbe ? undefined : criteria.masteryProbe,
    baselineSessions: criteria.baselineSessions === (current.baselineSessions ?? null) ? undefined : criteria.baselineSessions,
    baselineProbe: criteria.baselineProbe === (current.baselineProbe ?? null) ? undefined : criteria.baselineProbe,
    promptUsed: input.promptUsed ?? target.promptUsed,
    changeReason: input.changeReason?.trim() || undefined,
  };
  return findTask(await saveTargetRequest(target.programId, body, target.id), target.id);
}

function findTask(program: ProgramDetail, targetId: string): TaskItem {
  const task = programTasks(program).find((item) => item.id === targetId);
  if (!task) throw new Error('The saved task was not returned.');
  return task;
}
