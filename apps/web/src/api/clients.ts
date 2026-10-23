import type {
  AssessmentReference,
  ClientActivity,
  ClientBehavior,
  ClientDirectoryPage,
  ClientPlacement,
  ClientDocumentView,
  ClientGoal,
  ClientGuardian,
  ClientProfile,
  ClientProgramView,
  ClientSessionView,
  ClientSummary,
  ClinicalProfile,
  DemoSeedResult,
  StaffOption,
} from '@abapro/shared';
import { apiRequest } from './client';

export interface ClientWriteBody {
  displayName: string;
  clientCode?: string;
  preferredName?: string;
  language?: string;
  timezone?: string;
  dateOfBirth?: string;
  clinicId?: string;
  status?: 'active' | 'inactive';
  confirmDeactivation?: boolean;
}

export interface DirectoryQuery {
  q?: string;
  status?: string;
  therapistId?: string;
  supervisorId?: string;
  programStatus?: string;
  sort?: string;
  direction?: string;
  page?: number;
  pageSize?: number;
}

function queryString(query: DirectoryQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

export function clientCodeAvailableRequest(code: string, exceptClientId?: string, organizationId?: string): Promise<{ available: boolean }> {
  const params = new URLSearchParams({ code });
  if (exceptClientId) params.set('except', exceptClientId);
  if (organizationId) params.set('organizationId', organizationId);
  return apiRequest(`/clients/code-available?${params.toString()}`);
}

export function clientPlacementRequest(): Promise<ClientPlacement> {
  return apiRequest('/clients/placement');
}

export function clientDirectoryRequest(query: DirectoryQuery = {}): Promise<ClientDirectoryPage> {
  return apiRequest(`/clients${queryString(query)}`);
}

export function clientAssigneesRequest(): Promise<StaffOption[]> {
  return apiRequest('/clients/assignees');
}

export function parentMembersRequest(): Promise<StaffOption[]> {
  return apiRequest('/clients/parent-members');
}

export function createClientRequest(body: ClientWriteBody): Promise<ClientSummary> {
  return apiRequest('/clients', { method: 'POST', body });
}

export function updateClientRequest(clientId: string, body: ClientWriteBody): Promise<ClientSummary> {
  return apiRequest(`/clients/${clientId}`, { method: 'PATCH', body });
}

export function clientProfileRequest(clientId: string): Promise<ClientProfile> {
  return apiRequest(`/clients/${clientId}`);
}

export function seedDemoClientsRequest(): Promise<DemoSeedResult> {
  return apiRequest('/clients/demo', { method: 'POST' });
}

export function clinicalProfileRequest(clientId: string): Promise<ClinicalProfile> {
  return apiRequest(`/clients/${clientId}/sensitive`);
}

export function saveClinicalProfileRequest(clientId: string, body: ClinicalProfile): Promise<ClinicalProfile> {
  return apiRequest(`/clients/${clientId}/sensitive`, { method: 'PUT', body });
}

export function assignClientRequest(clientId: string, userId: string, relationship: string): Promise<{ id: string }> {
  return apiRequest(`/clients/${clientId}/assignments`, { method: 'POST', body: { userId, relationship } });
}

export function endAssignmentRequest(clientId: string, assignmentId: string): Promise<{ id: string }> {
  return apiRequest(`/clients/${clientId}/assignments/${assignmentId}/end`, { method: 'POST' });
}

export function saveGuardianRequest(clientId: string, body: unknown, guardianId?: string): Promise<ClientGuardian> {
  if (guardianId) {
    return apiRequest(`/clients/${clientId}/guardians/${guardianId}`, { method: 'PATCH', body });
  }
  return apiRequest(`/clients/${clientId}/guardians`, { method: 'POST', body });
}

export function endGuardianRequest(clientId: string, guardianId: string): Promise<{ id: string }> {
  return apiRequest(`/clients/${clientId}/guardians/${guardianId}/end`, { method: 'POST' });
}

export function behaviorsRequest(clientId: string): Promise<ClientBehavior[]> {
  return apiRequest(`/clients/${clientId}/behaviors`);
}

export function saveBehaviorRequest(clientId: string, body: unknown, behaviorId?: string): Promise<ClientBehavior> {
  if (behaviorId) {
    return apiRequest(`/clients/${clientId}/behaviors/${behaviorId}`, { method: 'PATCH', body });
  }
  return apiRequest(`/clients/${clientId}/behaviors`, { method: 'POST', body });
}

export function goalsRequest(clientId: string): Promise<ClientGoal[]> {
  return apiRequest(`/clients/${clientId}/goals`);
}

export function saveGoalRequest(clientId: string, body: unknown, goalId?: string): Promise<ClientGoal> {
  if (goalId) {
    return apiRequest(`/clients/${clientId}/goals/${goalId}`, { method: 'PATCH', body });
  }
  return apiRequest(`/clients/${clientId}/goals`, { method: 'POST', body });
}

export function assessmentsRequest(clientId: string): Promise<AssessmentReference[]> {
  return apiRequest(`/clients/${clientId}/assessments`);
}

export function saveAssessmentRequest(clientId: string, body: unknown): Promise<AssessmentReference> {
  return apiRequest(`/clients/${clientId}/assessments`, { method: 'POST', body });
}

export function programsRequest(clientId: string): Promise<ClientProgramView[]> {
  return apiRequest(`/clients/${clientId}/programs`);
}

export function sessionsRequest(clientId: string): Promise<ClientSessionView[]> {
  return apiRequest(`/clients/${clientId}/sessions`);
}

export function documentsRequest(clientId: string): Promise<ClientDocumentView[]> {
  return apiRequest(`/clients/${clientId}/documents`);
}

export function uploadDocumentRequest(
  clientId: string,
  body: { fileName: string; contentType: string; contentBase64: string; category?: string },
): Promise<unknown> {
  return apiRequest(`/clients/${clientId}/documents`, { method: 'POST', body });
}

export function activityRequest(clientId: string): Promise<ClientActivity[]> {
  return apiRequest(`/clients/${clientId}/activity`);
}

export function uploadAvatarRequest(clientId: string, contentType: string, contentBase64: string): Promise<{ id: string }> {
  return apiRequest(`/clients/${clientId}/avatar`, { method: 'POST', body: { contentType, contentBase64 } });
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'));
    reader.readAsDataURL(file);
  });
}
