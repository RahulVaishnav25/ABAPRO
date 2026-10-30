import type {
  AssessmentDetail,
  AssessmentSummary,
  AssessmentTemplate,
  AssessmentTemplateWrite,
  AssessmentWrite,
  DocumentUpload,
  ProgramDetail,
  ProgramSummary,
  ProgramWrite,
  TargetListItem,
  TargetWrite,
} from '@abapro/shared';
import { apiRequest, encodedPath } from './client';

export function assessmentsRequest(clientId?: string): Promise<AssessmentSummary[]> {
  return apiRequest(`/assessments${clientId ? `?${new URLSearchParams({ clientId })}` : ''}`);
}

export function assessmentRequest(id: string): Promise<AssessmentDetail> {
  return apiRequest(encodedPath`/assessments/${id}`);
}

export function saveAssessmentRequest(body: AssessmentWrite, id?: string): Promise<AssessmentDetail> {
  return apiRequest(id ? encodedPath`/assessments/${id}` : '/assessments', { method: id ? 'PATCH' : 'POST', body });
}

export function assessmentTemplatesRequest(): Promise<AssessmentTemplate[]> {
  return apiRequest('/assessments/templates');
}

export function saveAssessmentTemplateRequest(body: AssessmentTemplateWrite): Promise<AssessmentTemplate> {
  return apiRequest('/assessments/templates', { method: 'POST', body });
}

export function programsRequest(clientId?: string): Promise<ProgramSummary[]> {
  return apiRequest(`/programs${clientId ? `?${new URLSearchParams({ clientId })}` : ''}`);
}

export function programRequest(id: string): Promise<ProgramDetail> {
  return apiRequest(encodedPath`/programs/${id}`);
}

export function saveProgramRequest(body: ProgramWrite, id?: string): Promise<ProgramDetail> {
  return apiRequest(id ? encodedPath`/programs/${id}` : '/programs', { method: id ? 'PATCH' : 'POST', body });
}

export function saveTargetRequest(programId: string, body: TargetWrite, targetId?: string): Promise<ProgramDetail> {
  return apiRequest(targetId ? encodedPath`/programs/${programId}/targets/${targetId}` : encodedPath`/programs/${programId}/targets`, {
    method: targetId ? 'PATCH' : 'POST',
    body,
  });
}

export function targetsRequest(programId?: string): Promise<TargetListItem[]> {
  return apiRequest(`/programs/targets${programId ? `?${new URLSearchParams({ programId })}` : ''}`);
}

export function targetRequest(id: string): Promise<TargetListItem> {
  return apiRequest(encodedPath`/programs/targets/${id}`);
}

export function uploadProgramDocumentRequest(programId: string, file: DocumentUpload): Promise<ProgramDetail> {
  return apiRequest(encodedPath`/programs/${programId}/documents`, { method: 'POST', body: file });
}

export function uploadAssessmentDocumentRequest(assessmentId: string, file: DocumentUpload): Promise<{ id: string }> {
  return apiRequest(encodedPath`/assessments/${assessmentId}/documents`, { method: 'POST', body: file });
}
