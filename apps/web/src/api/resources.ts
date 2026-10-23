import type {
  AuditEventView,
  AuthProviderInfo,
  AuthUser,
  SignInAccount,
  CreateOrganizationRequest,
  DashboardResponse,
  PlatformDashboard,
  InvitationCreated,
  InvitationDraft,
  LogoutResult,
  OrganizationDirectoryItem,
  OrganizationSettingsView,
  RolePermissionState,
  TeamDirectory,
  TeamMember,
  UnimplementedModuleResponse,
} from '@abapro/shared';
import { apiRequest } from './client';

export function authConfigRequest(): Promise<AuthProviderInfo> {
  return apiRequest<AuthProviderInfo>('/auth/config');
}

export function currentUserRequest(): Promise<AuthUser> {
  return apiRequest<AuthUser>('/auth/me', { quiet: true });
}

export function logoutRequest(): Promise<LogoutResult> {
  return apiRequest<LogoutResult>('/auth/logout', { method: 'POST' });
}

export function switchOrganizationRequest(organizationId: string, clinicId?: string): Promise<AuthUser> {
  return apiRequest<AuthUser>('/auth/switch-organization', {
    method: 'POST',
    body: { organizationId, clinicId },
  });
}

export function switchClinicRequest(clinicId: string): Promise<AuthUser> {
  return apiRequest<AuthUser>('/auth/switch-clinic', { method: 'POST', body: { clinicId } });
}

export function passwordLoginRequest(email: string, password: string): Promise<AuthUser> {
  return apiRequest<AuthUser>('/auth/login', { method: 'POST', body: { email, password }, quiet: true });
}

export function signInAccountsRequest(): Promise<SignInAccount[]> {
  return apiRequest<SignInAccount[]>('/auth/accounts');
}

export function createOrganizationMemberRequest(
  organizationId: string,
  body: { name: string; email: string; password: string; role: string },
): Promise<OrganizationDirectoryItem> {
  return apiRequest<OrganizationDirectoryItem>(`/organizations/${organizationId}/members`, { method: 'POST', body });
}

export function createSignInAccountRequest(body: { name: string; email: string; password: string; platformAdmin?: boolean }): Promise<SignInAccount> {
  return apiRequest<SignInAccount>('/auth/accounts', { method: 'POST', body });
}

export function createOrganizationRequest(body: CreateOrganizationRequest): Promise<AuthUser> {
  return apiRequest<AuthUser>('/organizations', { method: 'POST', body });
}

export function acceptInvitationRequest(token: string): Promise<AuthUser> {
  return apiRequest<AuthUser>('/invitations/accept', { method: 'POST', body: { token } });
}

export function organizationSettingsRequest(): Promise<OrganizationSettingsView> {
  return apiRequest<OrganizationSettingsView>('/organization/settings');
}

export function invitationsRequest(): Promise<Array<{ id: string; email: string; role: string; expiresAt: string }>> {
  return apiRequest('/organization/invitations');
}

export function createInvitationRequest(body: InvitationDraft): Promise<InvitationCreated> {
  return apiRequest<InvitationCreated>('/organization/invitations', { method: 'POST', body });
}

export function dashboardRequest(): Promise<DashboardResponse> {
  return apiRequest<DashboardResponse>('/dashboard');
}

export function platformDashboardRequest(): Promise<PlatformDashboard> {
  return apiRequest<PlatformDashboard>('/platform/dashboard');
}

export function platformRolesRequest(): Promise<RolePermissionState[]> {
  return apiRequest<RolePermissionState[]>('/platform/roles');
}

export function updatePlatformRoleRequest(role: string, permissions: string[]): Promise<RolePermissionState> {
  return apiRequest<RolePermissionState>('/platform/roles', { method: 'PUT', body: { role, permissions } });
}

export function moduleStatusRequest(apiPath: string): Promise<UnimplementedModuleResponse> {
  return apiRequest<UnimplementedModuleResponse>(`/${apiPath}`);
}

export function teamDirectoryRequest(): Promise<TeamDirectory> {
  return apiRequest<TeamDirectory>('/team');
}

export function updateRolePermissionsRequest(role: string, permissions: string[]): Promise<unknown> {
  return apiRequest('/team/permissions', { method: 'PUT', body: { role, permissions } });
}

export function changeMemberRoleRequest(membershipId: string, role: string): Promise<TeamMember> {
  return apiRequest<TeamMember>(`/team/members/${membershipId}`, { method: 'PATCH', body: { role } });
}

export function revokeMemberRequest(membershipId: string): Promise<{ status: string }> {
  return apiRequest(`/team/members/${membershipId}/revoke`, { method: 'POST' });
}

export function revokeInvitationRequest(invitationId: string): Promise<{ status: string }> {
  return apiRequest(`/team/invitations/${invitationId}/revoke`, { method: 'POST' });
}

export function auditHistoryRequest(): Promise<AuditEventView[]> {
  return apiRequest<AuditEventView[]>('/audit');
}
