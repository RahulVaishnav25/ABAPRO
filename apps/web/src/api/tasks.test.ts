import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProgramDetail, TargetListItem } from '@abapro/shared';
import { saveTargetRequest, targetRequest } from './programs';
import { apiPhase, createTaskRequest, displayPhase, getTaskRequest, taskCriteriaChanged, toTask, updateTaskRequest, type CreateTaskInput } from './tasks';

vi.mock('./programs', () => ({
  programsRequest: vi.fn(),
  targetsRequest: vi.fn(),
  targetRequest: vi.fn(),
  saveTargetRequest: vi.fn(),
}));

function target(overrides: Partial<TargetListItem> = {}): TargetListItem {
  return {
    id: 'target-1',
    title: 'Spoken request',
    description: 'Requests during play.',
    operationalDefinition: 'A spoken request for a visible item.',
    measurementMethod: 'trial',
    expectedTrialCount: 5,
    baselineNote: '',
    teachingInstructions: 'Wait five seconds.',
    promptHierarchy: 'Independent, gesture, model',
    masteryCriteria: 'Reviewed by the supervisor.',
    phase: 'intervention',
    status: 'in_treatment',
    startedOn: '2026-10-01',
    reviewOn: null,
    clinicalNotes: 'Prefers vehicles.',
    sd: 'What do you want?',
    masterySessions: 3,
    masteryProbe: 90,
    baselineSessions: null,
    baselineProbe: null,
    promptUsed: false,
    sortOrder: 0,
    configurationVersion: 1,
    programId: 'program-1',
    programTitle: 'Requesting',
    clientId: 'client-1',
    clientName: 'Avery Sample',
    ...overrides,
  };
}

function program(targets: TargetListItem[]): ProgramDetail {
  return {
    id: 'program-1',
    title: 'Requesting',
    clientId: 'client-1',
    clientName: 'Avery Sample',
    measurementType: 'trial',
    targets,
  } as unknown as ProgramDetail;
}

function input(overrides: Partial<CreateTaskInput> = {}): CreateTaskInput {
  return { name: 'Spoken request', desiredTrials: 5, phase: 'Treatment', masterySessions: 3, masteryProbe: 90, sd: 'What do you want?', ...overrides };
}

describe('tasks', () => {
  beforeEach(() => {
    vi.mocked(targetRequest).mockReset();
    vi.mocked(saveTargetRequest).mockReset();
  });

  it('maps API phases to labels and back', () => {
    for (const phase of ['baseline', 'intervention', 'maintenance', 'mastered']) {
      expect(apiPhase(displayPhase(phase))).toBe(phase);
    }
    expect(displayPhase('intervention')).toBe('Treatment');
    expect(displayPhase('')).toBe('Treatment');
  });

  it('shows defaults for targets saved before task criteria existed', () => {
    const task = toTask(target({ masterySessions: null, masteryProbe: null, phase: 'baseline', status: 'on_hold' }));
    expect(task).toMatchObject({ masterySessions: 3, masteryProbe: 100, baselineProbe: 100, phase: 'Baseline', status: 'on_hold' });
  });

  it('asks for a reason only when versioned criteria change', () => {
    const task = toTask(target());
    expect(taskCriteriaChanged(task, input({ name: 'Renamed', sd: 'New SD' }))).toBe(false);
    expect(taskCriteriaChanged(task, input({ desiredTrials: 6 }))).toBe(true);
    expect(taskCriteriaChanged(task, input({ masteryProbe: 80 }))).toBe(true);
    expect(taskCriteriaChanged(task, input({ status: 'in_treatment' }))).toBe(false);
    expect(taskCriteriaChanged(task, input({ status: 'on_hold' }))).toBe(true);
    const frequency = toTask(target({ measurementMethod: 'frequency', expectedTrialCount: null }));
    expect(taskCriteriaChanged(frequency, input({ desiredTrials: 9, masteryProbe: 90 }))).toBe(false);
  });

  it('creates a target in the chosen program and returns it as a task', async () => {
    vi.mocked(saveTargetRequest).mockResolvedValue(program([target({ id: 'old' }), target({ id: 'new', title: 'Echoic', sortOrder: 1 })]));
    const created = await createTaskRequest({ id: 'program-1', measurementType: 'trial' }, input({ name: ' Echoic ', phase: 'Baseline', baselineSessions: 2, baselineProbe: 80, promptUsed: true }));
    expect(saveTargetRequest).toHaveBeenCalledWith('program-1', {
      title: 'Echoic', measurementMethod: 'trial', expectedTrialCount: 5, phase: 'baseline',
      sd: 'What do you want?', masterySessions: 3, masteryProbe: 90, baselineSessions: 2, baselineProbe: 80, promptUsed: true,
    });
    expect(created.id).toBe('new');
  });

  it('sends a status chosen on the Edit form', async () => {
    vi.mocked(targetRequest).mockResolvedValue(target());
    vi.mocked(saveTargetRequest).mockResolvedValue(program([target({ status: 'maintenance' })]));
    const updated = await updateTaskRequest('target-1', input({ status: 'maintenance', changeReason: 'Skill moved to maintenance.' }));
    expect(saveTargetRequest).toHaveBeenCalledWith('program-1', expect.objectContaining({ status: 'maintenance' }), 'target-1');
    expect(updated.status).toBe('maintenance');
  });

  it('keeps fields the task screens do not edit and sends only changed criteria', async () => {
    const existing = target({ masterySessions: null, masteryProbe: null });
    vi.mocked(targetRequest).mockResolvedValue(existing);
    vi.mocked(saveTargetRequest).mockResolvedValue(program([target({ title: 'Renamed' })]));
    await updateTaskRequest('target-1', input({ name: 'Renamed', masteryProbe: 100, sd: 'New SD' }));
    expect(saveTargetRequest).toHaveBeenCalledWith('program-1', expect.objectContaining({
      title: 'Renamed',
      description: 'Requests during play.',
      teachingInstructions: 'Wait five seconds.',
      clinicalNotes: 'Prefers vehicles.',
      measurementMethod: 'trial',
      status: 'in_treatment',
      phase: 'intervention',
      sd: 'New SD',
      masterySessions: undefined,
      masteryProbe: undefined,
    }), 'target-1');
  });

  it('keeps Prompt Used unless the Edit form sends it', async () => {
    vi.mocked(targetRequest).mockResolvedValue(target({ promptUsed: true }));
    vi.mocked(saveTargetRequest).mockResolvedValue(program([target({ promptUsed: true })]));
    expect((await getTaskRequest('target-1')).promptUsed).toBe(true);
    await updateTaskRequest('target-1', input());
    expect(saveTargetRequest).toHaveBeenLastCalledWith('program-1', expect.objectContaining({ promptUsed: true }), 'target-1');
    await updateTaskRequest('target-1', input({ promptUsed: false }));
    expect(saveTargetRequest).toHaveBeenLastCalledWith('program-1', expect.objectContaining({ promptUsed: false }), 'target-1');
  });
});
