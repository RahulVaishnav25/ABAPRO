import type { CollectedObservation, SessionGraphPoint, TherapySessionDetail, TherapySessionSummary } from '@abapro/shared';
import { apiRequest } from './client';

export interface ObservationPayload {
  idempotencyKey: string;
  targetId: string;
  note?: string;
  trials?: Array<{ idempotencyKey: string; trialNumber: number; result: 'correct' | 'incorrect' | 'prompted' | 'no_response'; promptLevel?: string }>;
  frequencyCount?: number;
  windowStartedAt?: string;
  windowEndedAt?: string;
  occurredAt?: string;
  durationSeconds?: number;
  durationUnit?: 'seconds' | 'minutes';
  startedAt?: string;
  endedAt?: string;
  antecedent?: string;
  behaviorNote?: string;
  consequence?: string;
  contextNote?: string;
  reason?: string;
}

export function sessionsRequest(clientId?: string, status?: string): Promise<TherapySessionSummary[]> {
  const params = new URLSearchParams();
  if (clientId) params.set('clientId', clientId);
  if (status) params.set('status', status);
  const query = params.toString();
  return apiRequest(`/sessions${query ? `?${query}` : ''}`);
}

export function sessionRequest(sessionId: string): Promise<TherapySessionDetail> {
  return apiRequest(`/sessions/${sessionId}`);
}

export function startSessionRequest(body: {
  clientId: string;
  therapistId?: string;
  startedAt?: string;
  setting?: string;
  location?: string;
  note?: string;
}): Promise<TherapySessionDetail> {
  return apiRequest('/sessions', { method: 'POST', body });
}

export function recordSessionObservationRequest(sessionId: string, body: ObservationPayload): Promise<CollectedObservation> {
  return apiRequest(`/sessions/${sessionId}/observations`, { method: 'POST', body });
}

export function addSessionTrialRequest(
  sessionId: string,
  observationId: string,
  body: { idempotencyKey: string; trialNumber: number; result: 'correct' | 'incorrect' | 'prompted' | 'no_response'; promptLevel?: string },
): Promise<CollectedObservation> {
  return apiRequest(`/sessions/${sessionId}/observations/${observationId}/trials`, { method: 'POST', body });
}

export function undoSessionTrialRequest(sessionId: string, observationId: string, trialId: string, reason: string): Promise<CollectedObservation> {
  return apiRequest(`/sessions/${sessionId}/observations/${observationId}/trials/${trialId}/undo`, { method: 'POST', body: { reason } });
}

export function voidSessionObservationRequest(sessionId: string, observationId: string, reason: string): Promise<CollectedObservation> {
  return apiRequest(`/sessions/${sessionId}/observations/${observationId}/void`, { method: 'POST', body: { reason } });
}

export function completeSessionRequest(sessionId: string, note?: string): Promise<TherapySessionDetail> {
  return apiRequest(`/sessions/${sessionId}/complete`, { method: 'POST', body: { note } });
}

export function interruptSessionRequest(sessionId: string): Promise<TherapySessionDetail> {
  return apiRequest(`/sessions/${sessionId}/interrupt`, { method: 'POST', body: {} });
}

export function resumeSessionRequest(sessionId: string): Promise<TherapySessionDetail> {
  return apiRequest(`/sessions/${sessionId}/resume`, { method: 'POST', body: {} });
}

export function sessionGraphRequest(clientId: string): Promise<SessionGraphPoint[]> {
  return apiRequest(`/sessions/graph?clientId=${clientId}`);
}

export function submissionKey(): string {
  return crypto.randomUUID().replace(/-/g, '');
}
