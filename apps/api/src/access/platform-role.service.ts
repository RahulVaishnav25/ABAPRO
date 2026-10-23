import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  INVITABLE_ROLES,
  ROLE_LABELS,
  ceilingForRole,
  grantViolation,
  isPermission,
  permissionsForRole,
  type AuthUser,
  type RolePermissionState,
} from '@abapro/shared';
import { recordAudit } from '../common/audit';
import { asString } from '../common/http';
import { DATABASE } from '../db/database.module';
import type { Database } from '../db/database';
import type { UpdateRolePermissionsDto } from './access.dto';

@Injectable()
export class PlatformRoleService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async list(user: AuthUser): Promise<RolePermissionState[]> {
    this.requirePlatformAdmin(user);
    const customizations = await this.database.query<{ role: string }>(`SELECT role FROM platform_role_customizations`);
    const grants = await this.database.query<{ role: string; permission: string }>(
      `SELECT role, permission FROM platform_role_grants`,
    );
    const customized = new Set(customizations.map((row) => asString(row.role)));
    return INVITABLE_ROLES.map((role) => ({
      role,
      label: ROLE_LABELS[role],
      ceiling: [...ceilingForRole(role)],
      granted: customized.has(role)
        ? grants.filter((row) => row.role === role).map((row) => asString(row.permission)).filter(isPermission)
        : [...permissionsForRole(role)],
      customizable: true,
    }));
  }

  async update(user: AuthUser, input: UpdateRolePermissionsDto): Promise<RolePermissionState> {
    this.requirePlatformAdmin(user);
    const unique = [...new Set(input.permissions)];
    const violation = grantViolation(input.role, unique);
    if (violation) {
      throw new BadRequestException(violation);
    }
    const permissions = unique.filter(isPermission);
    await this.database.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO platform_role_customizations (role) VALUES ($1) ON CONFLICT (role) DO NOTHING`,
        [input.role],
      );
      await tx.query(`DELETE FROM platform_role_grants WHERE role = $1`, [input.role]);
      for (const permission of permissions) {
        await tx.query(`INSERT INTO platform_role_grants (role, permission) VALUES ($1, $2)`, [input.role, permission]);
      }
      await recordAudit(tx, {
        actorUserId: user.id,
        action: 'platform.role_permissions_updated',
        targetType: 'role',
        targetId: input.role,
        metadata: { permissions },
      });
    });
    return {
      role: input.role,
      label: ROLE_LABELS[input.role],
      ceiling: [...ceilingForRole(input.role)],
      granted: permissions,
      customizable: true,
    };
  }

  private requirePlatformAdmin(user: AuthUser): void {
    if (!user.platformAdmin) {
      throw new ForbiddenException('Only a platform administrator can manage portal roles.');
    }
  }
}
