export type AssessmentStatus = 'draft' | 'in_progress' | 'completed' | 'reviewed';
export type AssessmentTemplateStatus = 'active' | 'retired';
export type ResponseKind = 'text' | 'yes_no' | 'rating' | 'count';
export type MeasurementMethod = 'trial' | 'probe' | 'frequency' | 'duration' | 'abc';
export type TargetStatus = 'active' | 'inactive' | 'mastered' | 'discontinued';
export type TrialResult = 'correct' | 'incorrect' | 'prompted' | 'no_response';

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

export interface ProgramTemplateTarget {
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
  sortOrder: number;
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
  targets: ProgramTemplateTarget[];
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
  sortOrder: number;
  configurationVersion: number;
  staff: Array<{ id: string; userId: string; name: string }>;
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
  status: 'active' | 'paused' | 'completed' | 'discontinued';
  measurementType: MeasurementMethod;
  targetCount: number;
  startedOn: string | null;
  reviewOn: string | null;
}

export interface ProgramDetail {
  id: string;
  clientId: string;
  clientName: string;
  title: string;
  description: string;
  objective: string;
  assessmentId: string | null;
  assessmentName: string | null;
  teachingProcedure: string;
  startedOn: string | null;
  reviewOn: string | null;
  responsibleClinicianId: string | null;
  responsibleClinicianName: string | null;
  status: ProgramSummary['status'];
  measurementType: MeasurementMethod;
  expectedTrialCount: number | null;
  masteryCriteria: string;
  notes: string;
  templateId: string | null;
  configurationVersion: number;
  goals: ProgramGoalView[];
  targets: TargetSummary[];
  staff: ProgramStaff[];
  versions: ConfigurationVersion[];
  documents: AssessmentDocumentLink[];
}

export interface TrialEntry {
  trialNumber: number;
  result: TrialResult;
  promptLevel?: string;
}

export interface SessionObservationView {
  id: string;
  sessionId: string;
  targetId: string;
  configurationVersion: number;
  measurementMethod: MeasurementMethod;
  note: string;
  frequencyCount: number | null;
  durationSeconds: number | null;
  antecedent: string | null;
  behaviorNote: string | null;
  consequence: string | null;
  trials: TrialEntry[];
  recordedAt: string;
}
