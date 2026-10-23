import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  EXCEPTIONAL_ACCESS_PERMISSIONS,
  PERMISSIONS,
  effectivePermissions,
  isPermission,
  permissionsForRole,
  type AuthUser,
  type Permission,
  type Role,
} from '@abapro/shared';
import { asString } from '../common/http';
import { DATABASE } from '../db/database.module';
import type { Database, Queryable } from '../db/database';

export interface ClientRecord {
  id: string;
  displayName: string;
  status: 'active' | 'inactive';
}

type AccessMode = 'view' | 'sensitive' | 'write' | 'record';

@Injectable()
export class AuthorizationService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  requireOrganization(user: AuthUser): string {
    if (!user.organization || !user.role) {
      throw new ForbiddenException('Choose an organization before continuing.');
    }
    return user.organization.id;
  }

  withOrganization<T>(user: AuthUser, work: (tx: Queryable, organizationId: string) => Promise<T>): Promise<T> {
    const organizationId = this.requireOrganization(user);
    return this.database.withTenant(organizationId, (tx) => work(tx, organizationId), user.clinic?.id ?? null);
  }

  async permissionsFor(db: Queryable, organizationId: string, role: Role, userId: string): Promise<Permission[]> {
    const platformCustomized = await db.query(
      `SELECT 1 AS present FROM platform_role_customizations WHERE role = $1`,
      [role],
    );
    const customized = platformCustomized.length > 0
      ? []
      : await db.query(
          `SELECT 1 AS present FROM organization_role_customizations WHERE organization_id = $1 AND role = $2`,
          [organizationId, role],
        );
    let base: Permission[];
    if (platformCustomized.length > 0) {
      const grants = await db.query<{ permission: string }>(
        `SELECT permission FROM platform_role_grants WHERE role = $1`,
        [role],
      );
      base = effectivePermissions(
        role,
        grants.map((row) => asString(row.permission)).filter(isPermission),
      );
    } else if (customized.length === 0) {
      base = [...permissionsForRole(role)];
    } else {
      const grants = await db.query<{ permission: string }>(
        `SELECT permission FROM organization_role_grants WHERE organization_id = $1 AND role = $2`,
        [organizationId, role],
      );
      base = effectivePermissions(
        role,
        grants.map((row) => asString(row.permission)).filter(isPermission),
      );
    }
    if (role !== 'platform_admin') {
      return base;
    }
    const extra = await this.database.withTenant(organizationId, (tx) =>
      this.exceptionalPermissions(tx, organizationId, userId),
    );
    return [...new Set([...base, ...extra])];
  }

  async requireClient(
    user: AuthUser,
    clientId: string,
    mode: AccessMode,
    permission?: Permission,
    recordId?: string,
  ): Promise<ClientRecord> {
    return this.withOrganization(user, async (tx, organizationId) => {
      const client = await this.findClient(tx, organizationId, clientId);
      await this.assertClientAccess(tx, user, client, mode, permission, recordId);
      return client;
    });
  }

  async assertClientAccess(
    tx: Queryable,
    user: AuthUser,
    client: ClientRecord,
    mode: AccessMode,
    permission?: Permission,
    recordId?: string,
  ): Promise<void> {
    if (mode === 'write' || mode === 'sensitive' || mode === 'record') {
      if (!permission || !user.permissions.includes(permission)) {
        throw new ForbiddenException('You do not have access to this resource.');
      }
    }
    if (user.role === 'reviewer' && (mode === 'write' || (permission && isMutating(permission)))) {
      throw new ForbiddenException('You do not have access to this resource.');
    }
    if (user.role === 'platform_admin') {
      const allowed = await this.platformGrantAllows(tx, user.id, client.id, permissionForMode(mode, permission));
      if (!allowed) {
        throw new ForbiddenException('You do not have access to this resource.');
      }
      if (mode === 'write') {
        throw new ForbiddenException('You do not have access to this resource.');
      }
      return;
    }
    if (user.role === 'therapist') {
      const assigned = await this.hasRelationship(tx, client.id, user.id, 'therapist');
      if (!assigned) {
        throw new ForbiddenException('You are not authorized to access that client.');
      }
      return;
    }
    if (user.role === 'parent') {
      const linked = await this.hasRelationship(tx, client.id, user.id, 'guardian');
      if (!linked) {
        throw new ForbiddenException('You are not authorized to access that client.');
      }
      if (mode === 'sensitive' || mode === 'write') {
        throw new ForbiddenException('You do not have access to this resource.');
      }
      if (mode === 'record' && permission) {
        if (!recordId) {
          throw new ForbiddenException('You do not have access to this resource.');
        }
        const shared = await tx.query(
          `SELECT 1 AS present FROM shared_records
           WHERE client_id = $1 AND shared_with_user_id = $2 AND record_type = $3 AND record_id = $4`,
          [client.id, user.id, recordTypeFor(permission), recordId],
        );
        if (shared.length === 0) {
          throw new ForbiddenException('You do not have access to this resource.');
        }
      }
      return;
    }
    if (user.role === 'organization_admin' || user.role === 'clinical_supervisor' || user.role === 'reviewer') {
      return;
    }
    throw new ForbiddenException('You do not have access to this resource.');
  }

  async findClient(tx: Queryable, organizationId: string, clientId: string): Promise<ClientRecord> {
    const rows = await tx.query<{ id: string; display_name: string; status: 'active' | 'inactive' }>(
      `SELECT id, display_name, status FROM clients WHERE id = $1 AND organization_id = $2`,
      [clientId, organizationId],
    );
    const row = rows[0];
    if (!row) {
      throw new NotFoundException('That client was not found.');
    }
    return { id: asString(row.id), displayName: asString(row.display_name), status: row.status };
  }

  private async hasRelationship(
    tx: Queryable,
    clientId: string,
    userId: string,
    relationship: 'therapist' | 'guardian',
  ): Promise<boolean> {
    const rows = await tx.query(
      `SELECT 1 AS present FROM client_assignments
       WHERE client_id = $1 AND user_id = $2 AND relationship = $3 AND ended_at IS NULL`,
      [clientId, userId, relationship],
    );
    return rows.length > 0;
  }

  private async platformGrantAllows(
    tx: Queryable,
    userId: string,
    clientId: string,
    permission: Permission,
  ): Promise<boolean> {
    const rows = await tx.query<{ permissions: unknown }>(
      `SELECT permissions FROM exceptional_access_grants
       WHERE grantee_user_id = $1 AND client_id = $2 AND revoked_at IS NULL AND expires_at > now()`,
      [userId, clientId],
    );
    return rows.some((row) => permissionList(row.permissions).includes(permission));
  }

  private async exceptionalPermissions(tx: Queryable, organizationId: string, userId: string): Promise<Permission[]> {
    const rows = await tx.query<{ permissions: unknown }>(
      `SELECT permissions FROM exceptional_access_grants
       WHERE organization_id = $1 AND grantee_user_id = $2 AND revoked_at IS NULL AND expires_at > now()`,
      [organizationId, userId],
    );
    const allowed = new Set<Permission>(EXCEPTIONAL_ACCESS_PERMISSIONS);
    const collected = new Set<Permission>();
    for (const row of rows) {
      for (const permission of permissionList(row.permissions)) {
        if (allowed.has(permission)) {
          collected.add(permission);
        }
      }
    }
    return [...collected];
  }
}

function permissionList(value: unknown): Permission[] {
  const source = Array.isArray(value) ? value : typeof value === 'string' ? parseArray(value) : [];
  return source.map((item) => String(item)).filter(isPermission);
}

function parseArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isMutating(permission: Permission): boolean {
  return permission.endsWith('.create')
    || permission.endsWith('.edit')
    || permission.endsWith('.record')
    || permission.endsWith('.amend')
    || permission.endsWith('.approve')
    || permission.endsWith('.upload')
    || permission.endsWith('.manage')
    || permission === PERMISSIONS.accessExceptionGrant;
}

function permissionForMode(mode: AccessMode, permission?: Permission): Permission {
  if (permission) {
    return permission;
  }
  if (mode === 'sensitive') {
    return PERMISSIONS.clientsSensitiveView;
  }
  return PERMISSIONS.clientsView;
}

function recordTypeFor(permission: Permission): string {
  if (permission === PERMISSIONS.documentsDownload) return 'document';
  if (permission === PERMISSIONS.graphsView || permission === PERMISSIONS.graphsExport) return 'graph';
  if (permission === PERMISSIONS.reportsView) return 'report';
  return 'record';
}
