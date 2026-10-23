import type { Permission, Role } from './permissions';

export interface AssignedClient {
  id: string;
  name: string;
}

export interface TeamMember {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  roleLabel: string;
  status: 'active' | 'revoked';
  assignedClients: AssignedClient[];
  lastActiveAt: string | null;
}

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface TeamInvitation {
  id: string;
  email: string;
  role: Role;
  status: InvitationStatus;
  expiresAt: string;
}

export interface RolePermissionState {
  role: Role;
  label: string;
  ceiling: Permission[];
  granted: Permission[];
  customizable: boolean;
}

export interface TeamDirectory {
  members: TeamMember[];
  invitations: TeamInvitation[];
  permissions: RolePermissionState[];
}

export interface AuditEventView {
  id: string;
  action: string;
  actorUserId: string | null;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
}

export interface ClientSummary {
  id: string;
  displayName: string;
  status: 'active' | 'inactive';
  clientCode?: string;
}

export interface ClientDocumentSummary {
  id: string;
  fileName: string;
  contentType: string;
  createdAt: string;
}
