import type { TherapySessionStatus } from './clients';
import type { MeasurementMethod, TrialResult } from './programs';

export type ObservationStatus = 'draft' | 'recorded' | 'amended' | 'voided';
export type ObservationEntryMode = 'summary' | 'event' | 'timer' | 'entered';
export type DurationUnit = 'seconds' | 'minutes';
export type SaveDisposition = 'saved' | 'failed' | 'queued' | 'conflict';

export interface SessionTargetOption {
  id: string;
  programId: string;
  programTitle: string;
  title: string;
  phase: string;
  measurementMethod: MeasurementMethod;
  expectedTrialCount: number | null;
  operationalDefinition: string;
  teachingInstructions: string;
  promptHierarchy: string;
  configurationVersion: number;
}

export interface CollectedTrial {
  id: string;
  trialNumber: number;
  result: TrialResult;
  promptLevel: string | null;
  voidedAt: string | null;
}

export interface CollectedObservation {
  id: string;
  sessionId: string;
  targetId: string;
  targetTitle: string;
  configurationVersion: number;
  measurementMethod: MeasurementMethod;
  status: ObservationStatus;
  entryMode: ObservationEntryMode;
  note: string;
  frequencyCount: number | null;
  durationSeconds: number | null;
  durationUnit: DurationUnit;
  windowStartedAt: string | null;
  windowEndedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  occurredAt: string | null;
  antecedent: string | null;
  behaviorNote: string | null;
  consequence: string | null;
  contextNote: string;
  ratePerMinute: number | null;
  amendedFromId: string | null;
  trials: CollectedTrial[];
  recordedAt: string;
}

export interface SessionIncomplete {
  observationId: string;
  targetId: string;
  targetTitle: string;
  recordedTrials: number;
  expectedTrials: number;
}

export interface SessionSummaryCounts {
  recordedTargetCount: number;
  observationCount: number;
  byMethod: Record<MeasurementMethod, number>;
  incomplete: SessionIncomplete[];
  canComplete: boolean;
}

export interface TherapySessionSummary {
  id: string;
  clientId: string;
  clientName: string;
  therapistId: string | null;
  therapistName: string | null;
  startedAt: string;
  endedAt: string | null;
  interruptedAt: string | null;
  status: TherapySessionStatus;
  setting: string;
  location: string;
  observationCount: number;
}

export interface TherapySessionDetail extends TherapySessionSummary {
  note: string;
  targets: SessionTargetOption[];
  observations: CollectedObservation[];
  summary: SessionSummaryCounts;
}

export interface SessionGraphPoint {
  observationId: string;
  sessionId: string;
  targetId: string;
  targetTitle: string;
  measurementMethod: MeasurementMethod;
  recordedOn: string;
  percentCorrect: number | null;
  frequencyCount: number | null;
  durationSeconds: number | null;
  ratePerMinute: number | null;
}

export function classifySubmission(status: number | null): SaveDisposition {
  if (status == null) return 'queued';
  if (status === 409) return 'conflict';
  if (status >= 200 && status < 300) return 'saved';
  return 'failed';
}
