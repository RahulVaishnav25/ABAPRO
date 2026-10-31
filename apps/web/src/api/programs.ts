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
  SessionHistory,
  SessionHistoryFilters,
  StatusChange,
  TargetListItem,
  TargetWrite,
  TaskRecordHistory,
  TaskRecordingStatus,
  TaskRecordWrite,
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

export function setProgramStatusRequest(programId: string, body: StatusChange): Promise<ProgramDetail> {
  return apiRequest(encodedPath`/programs/${programId}/status`, { method: 'PATCH', body });
}

export function setTaskStatusRequest(programId: string, taskId: string, body: StatusChange): Promise<ProgramDetail> {
  return apiRequest(encodedPath`/programs/${programId}/targets/${taskId}/status`, { method: 'PATCH', body });
}

export function targetsRequest(programId?: string): Promise<TargetListItem[]> {
  return apiRequest(`/programs/targets${programId ? `?${new URLSearchParams({ programId })}` : ''}`);
}

export function targetRequest(id: string): Promise<TargetListItem> {
  return apiRequest(encodedPath`/programs/targets/${id}`);
}

/** Today's remaining recording capacity for each of a client's tasks. */
export function recordingStatusesRequest(clientId: string): Promise<TaskRecordingStatus[]> {
  return apiRequest(`/programs/records/status?${new URLSearchParams({ clientId })}`);
}

export function taskRecordsRequest(taskId: string, from?: string): Promise<TaskRecordHistory> {
  return apiRequest(`${encodedPath`/programs/targets/${taskId}/records`}${from ? `?${new URLSearchParams({ from })}` : ''}`);
}

export function recordTaskRequest(taskId: string, body: TaskRecordWrite): Promise<TaskRecordingStatus> {
  return apiRequest(encodedPath`/programs/targets/${taskId}/records`, { method: 'POST', body });
}

/** Administrators only: every record saved on the program's tasks, newest first. */
export function sessionHistoryRequest(programId: string, filters: SessionHistoryFilters = {}): Promise<SessionHistory> {
  const query = new URLSearchParams(Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])));
  const search = query.toString();
  return apiRequest(`${encodedPath`/programs/${programId}/session-history`}${search ? `?${search}` : ''}`);
}

export function uploadProgramDocumentRequest(programId: string, file: DocumentUpload): Promise<ProgramDetail> {
  return apiRequest(encodedPath`/programs/${programId}/documents`, { method: 'POST', body: file });
}

export function uploadAssessmentDocumentRequest(assessmentId: string, file: DocumentUpload): Promise<{ id: string }> {
  return apiRequest(encodedPath`/assessments/${assessmentId}/documents`, { method: 'POST', body: file });
}
