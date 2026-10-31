export type AssessmentStatus = 'draft' | 'in_progress' | 'completed' | 'reviewed';
export type AssessmentTemplateStatus = 'active' | 'retired';
export type ResponseKind = 'text' | 'yes_no' | 'rating' | 'count';
export type MeasurementMethod = 'trial' | 'probe' | 'frequency' | 'duration' | 'abc';
export type MeasurementProcedure = 'Probe' | 'Step by Step' | (string & {});
/** Statuses shared by programs and tasks. New records start In Treatment. */
export const CARE_STATUSES = ['in_treatment', 'maintenance', 'on_hold', 'mastered'] as const;
export type CareStatus = (typeof CARE_STATUSES)[number];
export type TargetStatus = CareStatus;

export const CARE_STATUS_OPTIONS: ReadonlyArray<{ value: CareStatus; label: string }> = [
  { value: 'in_treatment', label: 'In Treatment' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'mastered', label: 'Mastered' },
];

export function careStatusLabel(status: string): string {
  return CARE_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export interface AssessmentGroup {
  group: string;
  options: string[];
}

export const ASSESSMENT_TYPE_GROUPS: AssessmentGroup[] = [
  {
    group: 'Milestone & Language',
    options: ['VB-MAPP', 'ABLLS-R', 'PEAK'],
  },
  {
    group: 'Functional & Independent Living',
    options: ['AFLS', 'Essential for Living (EFL)'],
  },
  {
    group: 'Adaptive Behavior',
    options: ['Vineland-3', 'ABAS-3'],
  },
  {
    group: 'Behavior Function & Preference',
    options: [
      'Functional Behavior Assessment (FBA)',
      'Functional Analysis (FA)',
      'Preference Assessments (Paired Stimulus, MSWO, etc.)',
    ],
  },
  {
    group: 'Early Intervention',
    options: ['ESDM Checklist', 'DATA Model Skills Checklist'],
  },
  {
    group: 'Clinical Diagnostic & Screening',
    options: ['ADOS-2', 'ADI-R', 'CARS-2'],
  },
];

export interface AssessmentTemplateItem {
  id: string;
  label: string;
  responseKind: ResponseKind;
  guidance: string;
  sortOrder: number;
}

export interface AssessmentTemplate {
  id: string;
  name: string;
  assessmentType: string;
  description: string;
  status: AssessmentTemplateStatus;
  items: AssessmentTemplateItem[];
  updatedAt: string;
}

export interface AssessmentItem {
  id: string;
  label: string;
  responseKind: ResponseKind;
  responseText: string;
  sortOrder: number;
}

export interface AssessmentDocumentLink {
  id: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  scanStatus: 'not_configured' | 'rejected';
}

export interface AssessmentSummary {
  id: string;
  clientId: string;
  clientName: string;
  name: string;
  assessmentType: string;
  status: AssessmentStatus;
  assessedOn: string | null;
  reviewOn: string | null;
  clinicianName: string | null;
  programCount: number;
}

export interface AssessmentDetail extends AssessmentSummary {
  templateId: string | null;
  summary: string;
  resultsNote: string;
  items: AssessmentItem[];
  documents: AssessmentDocumentLink[];
  programs: Array<{ id: string; title: string; status: string }>;
}

export interface ProgramTemplate {
  id: string;
  title: string;
  description: string;
  objective: string;
  teachingProcedure: string;
  measurementType: MeasurementMethod;
  expectedTrialCount: number | null;
  masteryCriteria: string;
  notes: string;
  status: 'active' | 'retired';
  updatedAt: string;
}

export interface ProgramStaff {
  id: string;
  userId: string;
  name: string;
  role: 'therapist' | 'supervisor';
  endedAt: string | null;
}

export interface ProgramGoalView {
  id: string;
  statement: string;
  objective: string;
  assessmentId: string | null;
  status: 'active' | 'met' | 'discontinued';
  reviewOn: string | null;
}

export interface TargetSummary {
  id: string;
  title: string;
  description: string;
  operationalDefinition: string;
  measurementMethod: MeasurementMethod;
  expectedTrialCount: number | null;
  baselineNote: string;
  teachingInstructions: string;
  promptHierarchy: string;
  masteryCriteria: string;
  phase: string;
  status: TargetStatus;
  startedOn: string | null;
  reviewOn: string | null;
  clinicalNotes: string;
  sd: string;
  masterySessions: number | null;
  masteryProbe: number | null;
  baselineSessions: number | null;
  baselineProbe: number | null;
  promptUsed: boolean;
  sortOrder: number;
  configurationVersion: number;
}

/** A target listed outside its program, with the program and client it belongs to. */
export interface TargetListItem extends TargetSummary {
  programId: string;
  programTitle: string;
  clientId: string;
  clientName: string;
}

export interface ConfigurationVersion {
  id: string;
  version: number;
  measurementMethod: MeasurementMethod;
  expectedTrialCount: number | null;
  masteryCriteria: string;
  reason: string;
  createdAt: string;
}

export interface ProgramSummary {
  id: string;
  clientId: string;
  clientName: string;
  title: string;
  domain?: string;
  dateImplemented?: string | null;
  dateMastered?: string | null;
  status: CareStatus;
  measurementType: MeasurementMethod;
  measurementProcedure?: MeasurementProcedure | null;
  targetCount: number;
  reviewOn: string | null;
}

export interface ProgramDetail {
  id: string;
  clientId: string;
  clientName: string;
  title: string;
  domain: string;
  dateImplemented: string | null;
  dateMastered: string | null;
  assessmentType: string | null;
  sd: string;
  masterySteps: string;
  errorCorrectionProcedure: string;
  teachingMethod: string;
  netTeachingIdea: string;
  measurementProcedure: MeasurementProcedure;
  masteryCriteria: string;
  description: string;
  objective: string;
  assessmentId: string | null;
  assessmentName: string | null;
  teachingProcedure: string;
  reviewOn: string | null;
  status: ProgramSummary['status'];
  measurementType: MeasurementMethod;
  expectedTrialCount: number | null;
  notes: string;
  templateId: string | null;
  configurationVersion: number;
  goals: ProgramGoalView[];
  targets: TargetSummary[];
  versions: ConfigurationVersion[];
  documents: AssessmentDocumentLink[];
}

// Request bodies. The API validates each one with a DTO class that implements it.

export interface AssessmentItemWrite {
  label: string;
  responseKind: ResponseKind;
  guidance?: string;
  responseText?: string;
}

export interface AssessmentWrite {
  clientId: string;
  templateId?: string;
  name: string;
  assessmentType: string;
  status?: AssessmentStatus;
  assessedOn?: string;
  reviewOn?: string;
  assignedClinicianId?: string;
  summary?: string;
  resultsNote?: string;
  changeReason?: string;
  items?: AssessmentItemWrite[];
}

export interface AssessmentTemplateWrite {
  name: string;
  assessmentType: string;
  description?: string;
  status?: AssessmentTemplateStatus;
  items?: AssessmentItemWrite[];
}

export interface ProgramWrite {
  clientId: string;
  title: string;
  domain?: string;
  dateImplemented?: string;
  dateMastered?: string;
  assessmentType?: string;
  sd?: string;
  masterySteps?: string;
  errorCorrectionProcedure?: string;
  teachingMethod?: string;
  netTeachingIdea?: string;
  measurementProcedure?: MeasurementProcedure;
  description?: string;
  objective?: string;
  assessmentId?: string;
  goalStatement?: string;
  goalObjective?: string;
  /** Shown as "Teaching Steps". Versioned with the measurement configuration. */
  teachingProcedure?: string;
  reviewOn?: string;
  status?: ProgramSummary['status'];
  measurementType?: MeasurementMethod;
  expectedTrialCount?: number;
  masteryCriteria?: string;
  notes?: string;
  changeReason?: string;
}

export interface TargetWrite {
  title: string;
  description?: string;
  operationalDefinition?: string;
  measurementMethod: MeasurementMethod;
  expectedTrialCount?: number;
  baselineNote?: string;
  teachingInstructions?: string;
  promptHierarchy?: string;
  masteryCriteria?: string;
  phase?: string;
  status?: TargetStatus;
  startedOn?: string;
  reviewOn?: string;
  clinicalNotes?: string;
  sd?: string;
  masterySessions?: number | null;
  masteryProbe?: number | null;
  baselineSessions?: number | null;
  baselineProbe?: number | null;
  promptUsed?: boolean;
  changeReason?: string;
}

/** Changes a program's or task's status. Every status change records a reason. */
export interface StatusChange {
  status: CareStatus;
  changeReason: string;
}

export interface DocumentUpload {
  fileName: string;
  contentType: string;
  contentBase64: string;
}


// Task recording. A day holds up to sessionsPerDay sessions of trialsPerSession records,
// shared by every therapist assigned to the client.

export type RecordResponse = 'yes' | 'no';

/** Recorded instead of Yes or No on tasks with Prompt Used. A record may hold several. */
export const PROMPT_LEVELS = ['independent', 'full_prompt', 'partial_prompt', 'gesture_prompt', 'model_prompt', 'positional'] as const;
export type PromptLevel = (typeof PROMPT_LEVELS)[number];

export const PROMPT_LEVEL_OPTIONS: ReadonlyArray<{ value: PromptLevel; label: string }> = [
  { value: 'independent', label: 'Independent' },
  { value: 'full_prompt', label: 'Full Prompt' },
  { value: 'partial_prompt', label: 'Partial Prompt' },
  { value: 'gesture_prompt', label: 'Gesture Prompt' },
  { value: 'model_prompt', label: 'Model Prompt' },
  { value: 'positional', label: 'Positional' },
];

export function promptLevelLabel(level: string): string {
  return PROMPT_LEVEL_OPTIONS.find((option) => option.value === level)?.label ?? level;
}

/** Only tasks in these statuses take new records. Records already saved stay in the history. */
export const RECORDABLE_STATUSES: readonly CareStatus[] = ['in_treatment', 'maintenance'];

export interface TaskRecordingStatus {
  targetId: string;
  /** The client's current day, YYYY-MM-DD. */
  date: string;
  trialsPerSession: number;
  sessionsPerDay: number;
  recordedToday: number;
  remainingToday: number;
  /** The session and trial the next record fills, or null when today is full. */
  nextSession: number | null;
  nextTrial: number | null;
  /** The task's Prompt Used setting: records take prompt levels instead of Yes or No. */
  promptUsed: boolean;
  /** Whether the current user may record for this task: an assigned therapist, on a task In Treatment or Maintenance. */
  mayRecord: boolean;
}

export interface TaskRecord {
  id: string;
  targetId: string;
  clientId: string;
  therapistId: string;
  therapistName: string;
  /** Yes or No, or null when the record holds prompt levels. */
  response: RecordResponse | null;
  promptLevels: PromptLevel[];
  recordDate: string;
  sessionNumber: number;
  trialNumber: number;
  recordedAt: string;
}

export interface TaskRecordDay {
  date: string;
  yes: number;
  no: number;
  /** How many records that day selected each prompt level. */
  prompts: Record<PromptLevel, number>;
}

export interface TaskRecordHistory {
  status: TaskRecordingStatus;
  days: TaskRecordDay[];
  /** The most recent records in the requested range, newest first. */
  records: TaskRecord[];
}

export interface TaskRecordWrite {
  /** Generated when the Record popup opens, so a repeated submit saves once. */
  requestId: string;
  /** For tasks without Prompt Used. */
  response?: RecordResponse;
  /** For tasks with Prompt Used: one or more levels. */
  promptLevels?: PromptLevel[];
}

