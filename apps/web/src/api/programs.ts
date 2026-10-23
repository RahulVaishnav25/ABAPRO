import type {
  AssessmentDetail,
  AssessmentSummary,
  AssessmentTemplate,
  ProgramDetail,
  ProgramSummary,
  ProgramTemplate,
  SessionObservationView,
  TrialResult,
} from '@abapro/shared';
import { apiRequest } from './client';

export interface AssessmentBody {
  clientId: string;
  templateId?: string;
  name: string;
  assessmentType: string;
  status?: AssessmentDetail['status'];
  assessedOn?: string;
  reviewOn?: string;
  assignedClinicianId?: string;
  summary?: string;
  resultsNote?: string;
  changeReason?: string;
  items?: Array<{ label: string; responseKind: 'text' | 'yes_no' | 'rating' | 'count'; guidance?: string; responseText?: string }>;
}

export interface ProgramBody {
  clientId: string;
  title: string;
  description?: string;
  objective?: string;
  assessmentId?: string;
  goalStatement?: string;
  goalObjective?: string;
  teachingProcedure?: string;
  startedOn?: string;
  reviewOn?: string;
  responsibleClinicianId?: string;
  therapistIds?: string[];
  status?: ProgramDetail['status'];
  measurementType: ProgramDetail['measurementType'];
  expectedTrialCount?: number;
  masteryCriteria?: string;
  notes?: string;
  changeReason?: string;
}

export interface TargetBody {
  title: string;
  description?: string;
  operationalDefinition?: string;
  measurementMethod: ProgramDetail['measurementType'];
  expectedTrialCount?: number;
  baselineNote?: string;
  teachingInstructions?: string;
  promptHierarchy?: string;
  masteryCriteria?: string;
  phase?: string;
  status?: ProgramDetail['targets'][number]['status'];
  startedOn?: string;
  reviewOn?: string;
  clinicalNotes?: string;
  staffIds?: string[];
  changeReason?: string;
}

export function assessmentsRequest(clientId?: string): Promise<AssessmentSummary[]> {
  return apiRequest(`/assessments${clientId ? `?clientId=${clientId}` : ''}`);
}

export function assessmentRequest(id: string): Promise<AssessmentDetail> {
  return apiRequest(`/assessments/${id}`);
}

export function saveAssessmentRequest(body: AssessmentBody, id?: string): Promise<AssessmentDetail> {
  return apiRequest(id ? `/assessments/${id}` : '/assessments', { method: id ? 'PATCH' : 'POST', body });
}

export function assessmentTemplatesRequest(): Promise<AssessmentTemplate[]> {
  return apiRequest('/assessments/templates');
}

export function saveAssessmentTemplateRequest(body: {
  name: string;
  assessmentType: string;
  description?: string;
  items?: AssessmentBody['items'];
}): Promise<AssessmentTemplate> {
  return apiRequest('/assessments/templates', { method: 'POST', body });
}

export function programsRequest(clientId?: string): Promise<ProgramSummary[]> {
  return apiRequest(`/programs${clientId ? `?clientId=${clientId}` : ''}`);
}

export function programRequest(id: string): Promise<ProgramDetail> {
  return apiRequest(`/programs/${id}`);
}

export function saveProgramRequest(body: ProgramBody, id?: string): Promise<ProgramDetail> {
  return apiRequest(id ? `/programs/${id}` : '/programs', { method: id ? 'PATCH' : 'POST', body });
}

export function programTemplatesRequest(): Promise<ProgramTemplate[]> {
  return apiRequest('/programs/templates');
}

export function saveProgramTemplateRequest(body: {
  title: string;
  description?: string;
  objective?: string;
  teachingProcedure?: string;
  measurementType: ProgramDetail['measurementType'];
  expectedTrialCount?: number;
  masteryCriteria?: string;
  notes?: string;
  status?: 'active' | 'retired';
  targets?: TargetBody[];
}): Promise<ProgramTemplate> {
  const payload = {
    title: body.title,
    description: body.description,
    objective: body.objective,
    teachingProcedure: body.teachingProcedure,
    measurementType: body.measurementType,
    expectedTrialCount: body.expectedTrialCount,
    masteryCriteria: body.masteryCriteria,
    notes: body.notes,
    status: body.status,
    targets: body.targets,
  };
  return apiRequest('/programs/templates', { method: 'POST', body: payload });
}

export function copyProgramTemplateRequest(templateId: string, clientId: string): Promise<ProgramDetail> {
  return apiRequest(`/programs/templates/${templateId}/copy`, { method: 'POST', body: { clientId } });
}

export function saveTargetRequest(programId: string, body: TargetBody, targetId?: string): Promise<ProgramDetail> {
  return apiRequest(targetId ? `/programs/${programId}/targets/${targetId}` : `/programs/${programId}/targets`, {
    method: targetId ? 'PATCH' : 'POST',
    body,
  });
}

export function reorderTargetsRequest(programId: string, targetIds: string[]): Promise<ProgramDetail> {
  return apiRequest(`/programs/${programId}/targets/reorder`, { method: 'PATCH', body: { targetIds } });
}

export function assignProgramTherapistRequest(programId: string, userId: string): Promise<ProgramDetail> {
  return apiRequest(`/programs/${programId}/assignments`, { method: 'POST', body: { userId } });
}

export function recordObservationRequest(
  programId: string,
  targetId: string,
  body: {
    note?: string;
    frequencyCount?: number;
    durationSeconds?: number;
    antecedent?: string;
    behaviorNote?: string;
    consequence?: string;
    trials?: Array<{ trialNumber: number; result: TrialResult; promptLevel?: string }>;
  },
): Promise<SessionObservationView> {
  return apiRequest(`/programs/${programId}/targets/${targetId}/observations`, { method: 'POST', body });
}

export function uploadProgramDocumentRequest(programId: string, file: { fileName: string; contentType: string; contentBase64: string }): Promise<ProgramDetail> {
  return apiRequest(`/programs/${programId}/documents`, { method: 'POST', body: file });
}

export function uploadAssessmentDocumentRequest(assessmentId: string, file: { fileName: string; contentType: string; contentBase64: string }): Promise<{ id: string }> {
  return apiRequest(`/assessments/${assessmentId}/documents`, { method: 'POST', body: file });
}
