import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  EXCEPTIONAL_ACCESS_PERMISSIONS,
  ROLE_LABELS,
  ceilingForRole,
  grantViolation,
  isPermission,
  isRole,
  permissionsForRole,
  type AuditEventView,
  type AuthUser,
  type Permission,
  type Role,
  type RolePermissionState,
  type TeamDirectory,
  type TeamInvitation,
  type TeamMember,
} from '@abapro/shared';
import { recordAudit } from '../common/audit';
import { asDate, asNullableString, asString } from '../common/http';
import type { Queryable } from '../db/database';
import { AuthorizationService } from './authorization.service';
import type { ChangeRoleDto, GrantExceptionDto, UpdateRolePermissionsDto } from './access.dto';

const MAX_EXCEPTION_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class TeamService {
  constructor(@Inject(AuthorizationService) private readonly authorization: AuthorizationService) {}

  async directory(user: AuthUser): Promise<TeamDirectory> {
    const organizationId = this.authorization.requireOrganization(user);
    return this.authorization.withOrganization(user, async (tx) => {
      const members = await this.members(tx, organizationId, user.clinic?.id ?? null);
      const invitations = await this.invitations(tx, organizationId);
      const permissions = await this.permissionState(tx, organizationId);
      return { members, invitations, permissions };
    });
  }

  async updatePermissions(user: AuthUser, input: UpdateRolePermissionsDto): Promise<RolePermissionState> {
    const organizationId = this.authorization.requireOrganization(user);
    const role = input.role;
    const unique = [...new Set(input.permissions)];
    const violation = grantViolation(role, unique);
    if (violation) {
      throw new BadRequestException(violation);
    }
    const permissions = unique.filter(isPermission);
    return this.authorization.withOrganization(user, async (tx) => {
      await tx.query(
        `INSERT INTO organization_role_customizations (organization_id, role) VALUES ($1, $2)
         ON CONFLICT (organization_id, role) DO NOTHING`,
        [organizationId, role],
      );
      await tx.query(`DELETE FROM organization_role_grants WHERE organization_id = $1 AND role = $2`, [
        organizationId,
        role,
      ]);
      for (const permission of permissions) {
        await tx.query(
          `INSERT INTO organization_role_grants (organization_id, role, permission) VALUES ($1, $2, $3)`,
          [organizationId, role, permission],
        );
      }
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action: 'team.permissions_updated',
        targetType: 'role',
        targetId: role,
        metadata: { permissions },
      });
      return {
        role,
        label: ROLE_LABELS[role],
        ceiling: [...ceilingForRole(role)],
        granted: permissions,
        customizable: true,
      };
    });
  }

  async changeRole(user: AuthUser, membershipId: string, input: ChangeRoleDto): Promise<TeamMember> {
    const organizationId = this.authorization.requireOrganization(user);
    return this.authorization.withOrganization(user, async (tx) => {
      const current = await this.membership(tx, organizationId, membershipId);
      if (current.userId === user.id) {
        throw new ForbiddenException('You cannot change your own role.');
      }
      if ((input.role as string) === 'platform_admin' || !isRole(input.role)) {
        throw new ForbiddenException('That role cannot be assigned.');
      }
      await this.assertAdminRemains(tx, organizationId, current, input.role);
      await tx.query(`UPDATE organization_memberships SET role = $2 WHERE id = $1`, [membershipId, input.role]);
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action: 'team.role_changed',
        targetType: 'membership',
        targetId: membershipId,
        metadata: { from: current.role, to: input.role },
      });
      const members = await this.members(tx, organizationId, null);
      const updated = members.find((member) => member.membershipId === membershipId);
      if (!updated) {
        throw new BadRequestException('That membership is no longer available.');
      }
      return updated;
    });
  }

  async revoke(user: AuthUser, membershipId: string): Promise<{ status: 'revoked' }> {
    const organizationId = this.authorization.requireOrganization(user);
    return this.authorization.withOrganization(user, async (tx) => {
      const current = await this.membership(tx, organizationId, membershipId);
      if (current.userId === user.id) {
        throw new ForbiddenException('You cannot revoke your own access.');
      }
      if (current.status === 'revoked') {
        return { status: 'revoked' };
      }
      await this.assertAdminRemains(tx, organizationId, current, null);
      await tx.query(
        `UPDATE organization_memberships SET status = 'revoked', revoked_at = now() WHERE id = $1`,
        [membershipId],
      );
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action: 'team.access_revoked',
        targetType: 'membership',
        targetId: membershipId,
        metadata: { userId: current.userId, role: current.role },
      });
      return { status: 'revoked' };
    });
  }

  async revokeInvitation(user: AuthUser, invitationId: string): Promise<{ status: 'revoked' }> {
    const organizationId = this.authorization.requireOrganization(user);
    return this.authorization.withOrganization(user, async (tx) => {
      const rows = await tx.query(
        `UPDATE invitations SET revoked_at = now()
         WHERE id = $1 AND organization_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL
         RETURNING id`,
        [invitationId, organizationId],
      );
      if (rows.length === 0) {
        throw new BadRequestException('That invitation is no longer pending.');
      }
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action: 'invitation.revoked',
        targetType: 'invitation',
        targetId: invitationId,
      });
      return { status: 'revoked' };
    });
  }

  async grantException(user: AuthUser, input: GrantExceptionDto): Promise<{ id: string; expiresAt: string }> {
    const organizationId = this.authorization.requireOrganization(user);
    const justification = input.justification.trim();
    if (justification.length < 20) {
      throw new BadRequestException('Describe why this access is needed.');
    }
    const expiresAt = new Date(input.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now() || expiresAt.getTime() > Date.now() + MAX_EXCEPTION_MS) {
      throw new BadRequestException('Exceptional access must expire within 7 days.');
    }
    const permissions = [...new Set(input.permissions)];
    const exceptional = new Set<Permission>(EXCEPTIONAL_ACCESS_PERMISSIONS);
    if (permissions.length === 0 || permissions.some((permission) => !exceptional.has(permission as Permission))) {
      throw new BadRequestException('Exceptional access is limited to viewing a specific client.');
    }
    return this.authorization.withOrganization(user, async (tx) => {
      const client = await this.authorization.findClient(tx, organizationId, input.clientId);
      const grantee = await tx.query<{ role: string }>(
        `SELECT role FROM organization_memberships
         WHERE organization_id = $1 AND user_id = $2 AND status = 'active'`,
        [organizationId, input.granteeUserId],
      );
      if (grantee[0]?.role !== 'platform_admin') {
        throw new ForbiddenException('Exceptional access can only be granted to platform support staff.');
      }
      const rows = await tx.query<{ id: string }>(
        `INSERT INTO exceptional_access_grants (
           organization_id, client_id, grantee_user_id, permissions, justification, granted_by, expires_at
         ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
         RETURNING id`,
        [organizationId, client.id, input.granteeUserId, JSON.stringify(permissions), justification, user.id, expiresAt],
      );
      const id = asString(rows[0]?.id);
      await recordAudit(tx, {
        organizationId,
        actorUserId: user.id,
        action: 'access.exception_granted',
        targetType: 'client',
        targetId: client.id,
        metadata: { grantId: id, granteeUserId: input.granteeUserId, permissions, expiresAt: expiresAt.toISOString() },
      });
      return { id, expiresAt: expiresAt.toISOString() };
    });
  }

  async audit(user: AuthUser): Promise<AuditEventView[]> {
    const organizationId = this.authorization.requireOrganization(user);
    const rows = await this.authorization.withOrganization(user, (tx) =>
      tx.query<{
        id: string;
        action: string;
        actor_user_id: string | null;
        target_type: string | null;
        target_id: string | null;
        created_at: Date | string;
      }>(
        `SELECT id, action, actor_user_id, target_type, target_id, created_at
         FROM audit_events WHERE organization_id = $1
         ORDER BY created_at DESC LIMIT 100`,
        [organizationId],
      ),
    );
    return rows.map((row) => ({
      id: asString(row.id),
      action: asString(row.action),
      actorUserId: asNullableString(row.actor_user_id),
      targetType: asNullableString(row.target_type),
      targetId: asNullableString(row.target_id),
      createdAt: asDate(row.created_at).toISOString(),
    }));
  }

  private async members(tx: Queryable, organizationId: string, clinicId: string | null): Promise<TeamMember[]> {
    const rows = await tx.query<{
      id: string;
      user_id: string;
      name: string;
      email: string;
      role: Role;
      status: 'active' | 'revoked';
      last_active_at: Date | string | null;
    }>(
      `SELECT m.id, m.user_id, u.name, u.email, m.role, m.status, m.last_active_at
       FROM organization_memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = $1
         AND (
           $2::uuid IS NULL
           OR m.role = 'organization_admin'
           OR EXISTS (
             SELECT 1 FROM clinic_access access
             WHERE access.user_id = m.user_id AND access.clinic_id = $2::uuid AND access.organization_id = m.organization_id
           )
         )
       ORDER BY u.name`,
      [organizationId, clinicId],
    );
    const assignments = await tx.query<{ user_id: string; client_id: string; display_name: string }>(
      `SELECT a.user_id, c.id AS client_id, c.display_name
       FROM client_assignments a
       JOIN clients c ON c.id = a.client_id
       WHERE a.organization_id = $1 AND a.ended_at IS NULL
       ORDER BY c.display_name`,
      [organizationId],
    );
    return rows.map((row) => ({
      membershipId: asString(row.id),
      userId: asString(row.user_id),
      name: asString(row.name),
      email: asString(row.email),
      role: row.role,
      roleLabel: ROLE_LABELS[row.role],
      status: row.status,
      assignedClients: assignments
        .filter((assignment) => asString(assignment.user_id) === asString(row.user_id))
        .map((assignment) => ({ id: asString(assignment.client_id), name: asString(assignment.display_name) })),
      lastActiveAt: row.last_active_at ? asDate(row.last_active_at).toISOString() : null,
    }));
  }

  private async invitations(tx: Queryable, organizationId: string): Promise<TeamInvitation[]> {
    const rows = await tx.query<{
      id: string;
      email: string;
      role: Role;
      expires_at: Date | string;
      accepted_at: Date | string | null;
      revoked_at: Date | string | null;
    }>(
      `SELECT id, email, role, expires_at, accepted_at, revoked_at
       FROM invitations WHERE organization_id = $1 ORDER BY created_at DESC`,
      [organizationId],
    );
    return rows.map((row) => ({
      id: asString(row.id),
      email: asString(row.email),
      role: row.role,
      status: invitationStatus(row),
      expiresAt: asDate(row.expires_at).toISOString(),
    }));
  }

  private async permissionState(tx: Queryable, organizationId: string): Promise<RolePermissionState[]> {
    const roles = Object.keys(ROLE_LABELS) as Role[];
    const customizations = await tx.query<{ role: string }>(
      `SELECT role FROM organization_role_customizations WHERE organization_id = $1`,
      [organizationId],
    );
    const grants = await tx.query<{ role: string; permission: string }>(
      `SELECT role, permission FROM organization_role_grants WHERE organization_id = $1`,
      [organizationId],
    );
    const customized = new Set(customizations.map((row) => asString(row.role)));
    return roles.map((role) => ({
      role,
      label: ROLE_LABELS[role],
      ceiling: [...ceilingForRole(role)],
      granted: customized.has(role)
        ? grants.filter((row) => row.role === role).map((row) => asString(row.permission)).filter(isPermission)
        : [...permissionsForRole(role)],
      customizable: role !== 'platform_admin',
    }));
  }

  private async membership(tx: Queryable, organizationId: string, membershipId: string): Promise<TeamMember> {
    const members = await this.members(tx, organizationId, null);
    const member = members.find((item) => item.membershipId === membershipId);
    if (!member) {
      throw new BadRequestException('That membership was not found.');
    }
    return member;
  }

  private async assertAdminRemains(
    tx: Queryable,
    organizationId: string,
    current: TeamMember,
    nextRole: Role | null,
  ): Promise<void> {
    if (current.role !== 'organization_admin' || current.status !== 'active') {
      return;
    }
    if (nextRole === 'organization_admin') {
      return;
    }
    const rows = await tx.query(
      `SELECT 1 AS present FROM organization_memberships
       WHERE organization_id = $1 AND role = 'organization_admin' AND status = 'active' AND id <> $2`,
      [organizationId, current.membershipId],
    );
    if (rows.length === 0) {
      throw new ConflictException('The organization needs at least one active administrator.');
    }
  }
}

function invitationStatus(row: {
  accepted_at: Date | string | null;
  revoked_at: Date | string | null;
  expires_at: Date | string;
}): TeamInvitation['status'] {
  if (row.revoked_at) return 'revoked';
  if (row.accepted_at) return 'accepted';
  if (asDate(row.expires_at).getTime() <= Date.now()) return 'expired';
  return 'pending';
}
