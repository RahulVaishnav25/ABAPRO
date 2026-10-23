import { Inject, Injectable } from '@nestjs/common';
import { PERMISSIONS, ROLE_LABELS, type AuthUser, type ClinicSummary, type OrganizationSummary, type Permission, type Role } from '@abapro/shared';
import { AuthorizationService } from '../access/authorization.service';
import { DATABASE } from '../db/database.module';
import type { Database, Queryable } from '../db/database';
import { asBoolean, asNullableString, asString, normalizeEmail } from '../common/http';

const PLATFORM_PORTAL_PERMISSIONS: Permission[] = [PERMISSIONS.settingsView, PERMISSIONS.teamView];

interface MembershipRow extends Record<string, unknown> {
  organization_id: string;
  organization_name: string;
  timezone: string;
  role: Role;
}

export interface IdentityClaims {
  issuer: string;
  subject: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

@Injectable()
export class AccountService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
  ) {}

  async upsertFromClaims(db: Queryable, claims: IdentityClaims): Promise<string> {
    const rows = await db.query<{ id: string }>(
      `INSERT INTO users (issuer, subject, email, name, email_verified)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (issuer, subject) DO UPDATE
         SET email = EXCLUDED.email,
             name = EXCLUDED.name,
             email_verified = EXCLUDED.email_verified,
             updated_at = now()
       RETURNING id`,
      [claims.issuer, claims.subject, normalizeEmail(claims.email), claims.name.trim(), claims.emailVerified],
    );
    return asString(rows[0]?.id);
  }

  async load(userId: string, organizationId: string | null, clinicId: string | null = null, db: Queryable = this.database): Promise<AuthUser> {
    const users = await db.query(
      `SELECT id, email, name, email_verified, platform_admin FROM users WHERE id = $1`,
      [userId],
    );
    const user = users[0];
    if (!user) {
      throw new Error('The signed-in account is no longer available.');
    }
    const memberships = await db.query<MembershipRow>(
      `SELECT m.organization_id, m.role, o.name AS organization_name, o.timezone
       FROM organization_memberships m
       JOIN organizations o ON o.id = m.organization_id
       WHERE m.user_id = $1 AND m.status = 'active'
       ORDER BY o.name`,
      [userId],
    );
    const organizations: OrganizationSummary[] = memberships.map((membership) => ({
      id: asString(membership.organization_id),
      name: asString(membership.organization_name),
      timezone: asString(membership.timezone),
    }));
    const platformAdmin = asBoolean(user.platform_admin);
    const active = memberships.find((membership) => asString(membership.organization_id) === organizationId) ?? null;
    let role = active ? (asString(active.role) as Role) : null;
    let organization: OrganizationSummary | null = active
      ? {
          id: asString(active.organization_id),
          name: asString(active.organization_name),
          timezone: asString(active.timezone),
        }
      : null;
    if (!organization && organizationId && platformAdmin) {
      const rows = await db.query<{ id: string; name: string; timezone: string }>(
        `SELECT id, name, timezone FROM organizations WHERE id = $1`,
        [organizationId],
      );
      const row = rows[0];
      if (row) {
        organization = { id: asString(row.id), name: asString(row.name), timezone: asString(row.timezone) };
        role = 'organization_admin';
      }
    }
    const clinics = organization ? await this.clinicsFor(db, asString(user.id), organization.id, platformAdmin, role) : [];
    const clinic = clinics.find((item) => item.id === clinicId) ?? clinics[0] ?? null;
    return {
      id: asString(user.id),
      email: asString(user.email),
      name: asString(user.name),
      emailVerified: asBoolean(user.email_verified),
      platformAdmin,
      role,
      roleLabel: platformAdmin ? ROLE_LABELS.platform_admin : role ? ROLE_LABELS[role] : null,
      organization,
      organizations,
      clinic,
      clinics,
      permissions: role && organization
        ? await this.authorization.permissionsFor(db, organization.id, role, asString(user.id))
        : platformAdmin
          ? PLATFORM_PORTAL_PERMISSIONS
          : [],
    };
  }

  private async clinicsFor(
    db: Queryable,
    userId: string,
    organizationId: string,
    platformAdmin: boolean,
    role: Role | null,
  ): Promise<ClinicSummary[]> {
    const orgWide = platformAdmin || role === 'organization_admin';
    const rows = await db.query(
      orgWide
        ? `SELECT id, name, location, address, contact_email, contact_phone
           FROM clinics WHERE organization_id = $1 ORDER BY name`
        : `SELECT c.id, c.name, c.location, c.address, c.contact_email, c.contact_phone
           FROM clinics c
           JOIN clinic_access access ON access.clinic_id = c.id
           WHERE c.organization_id = $1 AND access.user_id = $2
           ORDER BY c.name`,
      orgWide ? [organizationId] : [organizationId, userId],
    );
    return rows.map((row) => ({
      id: asString(row.id),
      name: asString(row.name),
      location: asString(row.location),
      address: asNullableString(row.address),
      contactEmail: asNullableString(row.contact_email),
      contactPhone: asNullableString(row.contact_phone),
    }));
  }
}
