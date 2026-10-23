import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser, ClinicDetail, ClinicDirectoryChild, ClinicDirectoryItem, ClinicDirectoryPage } from '@abapro/shared';
import { asNullableString, asString } from '../common/http';
import { DATABASE } from '../db/database.module';
import type { Database } from '../db/database';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ClinicDirectoryService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async list(
    user: AuthUser,
    search = '',
    organizationId = '',
    country = '',
    page = '1',
    pageSize = '10',
  ): Promise<ClinicDirectoryPage> {
    if (!user.platformAdmin) {
      return this.listForMember(user, search, page, pageSize);
    }
    const organization = organizationId.trim();
    if (organization && !UUID.test(organization)) {
      throw new BadRequestException('Choose an organisation.');
    }
    const term = search.trim();
    const countryCode = country.trim().toUpperCase();
    const currentPage = positiveInteger(page, 1);
    const size = Math.min(positiveInteger(pageSize, 10), 50);
    const pattern = term ? `%${term.replace(/[\\%_]/g, '\\$&')}%` : '';
    const filters = `WHERE ($1::uuid IS NULL OR o.id = $1::uuid)
         AND ($2 = '' OR o.country = $2)
         AND (
           $3 = ''
           OR c.name ILIKE $3
           OR c.location ILIKE $3
           OR coalesce(c.address, '') ILIKE $3
           OR o.name ILIKE $3
         )`;
    const params = [organization || null, countryCode, pattern];
    const counted = await this.database.query<{ total: number }>(
      `SELECT count(*)::int AS total
       FROM clinics c
       JOIN organizations o ON o.id = c.organization_id
       ${filters}`,
      params,
    );
    const total = Number(counted[0]?.total ?? 0);
    const pageCount = Math.max(1, Math.ceil(total / size));
    const safePage = Math.min(currentPage, pageCount);
    const rows = await this.database.query(
      `SELECT c.id, c.name, c.location, c.address, c.contact_email, c.contact_phone,
              o.id AS organization_id, o.name AS organization_name, o.country,
              (SELECT count(*)::int FROM clients WHERE clinic_id = c.id) AS child_count
       FROM clinics c
       JOIN organizations o ON o.id = c.organization_id
       ${filters}
       ORDER BY c.name, o.name
       LIMIT $4 OFFSET $5`,
      [...params, size, (safePage - 1) * size],
    );
    const organizations = await this.database.query<{ id: string; name: string }>(
      `SELECT id, name FROM organizations ORDER BY name`,
    );
    const countries = await this.database.query<{ country: string }>(
      `SELECT DISTINCT o.country
       FROM organizations o
       JOIN clinics c ON c.organization_id = o.id
       WHERE o.country <> ''
       ORDER BY o.country`,
    );
    return {
      items: rows.map((row) => this.item(row)),
      total,
      page: safePage,
      pageSize: size,
      organizations: organizations.map((row) => ({ id: asString(row.id), name: asString(row.name) })),
      countries: countries.map((row) => asString(row.country)),
    };
  }

  async detail(user: AuthUser, clinicId: string): Promise<ClinicDetail> {
    const rows = await this.database.query(
      `SELECT c.id, c.name, c.location, c.address, c.contact_email, c.contact_phone,
              o.id AS organization_id, o.name AS organization_name, o.country,
              (SELECT count(*)::int FROM clients WHERE clinic_id = c.id) AS child_count
       FROM clinics c
       JOIN organizations o ON o.id = c.organization_id
       WHERE c.id = $1`,
      [clinicId],
    );
    const row = rows[0];
    if (!row) {
      throw new NotFoundException('That clinic was not found.');
    }
    if (!user.platformAdmin) {
      await this.assertMemberClinic(user, asString(row.organization_id), clinicId);
    }
    const restricted = user.role === 'therapist' || user.role === 'parent';
    const children = await this.database.query(
      `SELECT id, display_name, client_code, status
       FROM clients
       WHERE clinic_id = $1
         AND (
           $2::boolean = false
           OR EXISTS (
             SELECT 1 FROM client_assignments a
             WHERE a.client_id = clients.id AND a.user_id = $3 AND a.ended_at IS NULL
               AND a.relationship = CASE WHEN $4 = 'parent' THEN 'guardian' ELSE 'therapist' END
           )
         )
       ORDER BY display_name`,
      [clinicId, restricted, user.id, user.role],
    );
    return {
      ...this.item(row),
      children: children.map((child) => this.child(child)),
    };
  }

  private item(row: Record<string, unknown>): ClinicDirectoryItem {
    return {
      id: asString(row.id),
      name: asString(row.name),
      location: asString(row.location),
      address: asNullableString(row.address),
      contactEmail: asNullableString(row.contact_email),
      contactPhone: asNullableString(row.contact_phone),
      organizationId: asString(row.organization_id),
      organizationName: asString(row.organization_name),
      country: asString(row.country).trim(),
      childCount: Number(row.child_count ?? 0),
    };
  }

  private child(row: Record<string, unknown>): ClinicDirectoryChild {
    const status = asString(row.status);
    return {
      id: asString(row.id),
      displayName: asString(row.display_name),
      clientCode: asString(row.client_code),
      status: status === 'inactive' ? 'inactive' : 'active',
    };
  }

  private async listForMember(user: AuthUser, search: string, page: string, pageSize: string): Promise<ClinicDirectoryPage> {
    const organizationId = user.organization?.id;
    if (!organizationId) {
      throw new ForbiddenException('Choose an organisation before opening clinics.');
    }
    const term = search.trim();
    const currentPage = positiveInteger(page, 1);
    const size = Math.min(positiveInteger(pageSize, 10), 50);
    const pattern = term ? `%${term.replace(/[\\%_]/g, '\\$&')}%` : '';
    const orgWide = user.role === 'organization_admin';
    const filters = `WHERE c.organization_id = $1
         AND ($2::boolean OR EXISTS (SELECT 1 FROM clinic_access access WHERE access.clinic_id = c.id AND access.user_id = $3))
         AND (
           $4 = ''
           OR c.name ILIKE $4
           OR c.location ILIKE $4
           OR coalesce(c.address, '') ILIKE $4
         )`;
    const params = [organizationId, orgWide, user.id, pattern];
    const counted = await this.database.query<{ total: number }>(
      `SELECT count(*)::int AS total
       FROM clinics c
       JOIN organizations o ON o.id = c.organization_id
       ${filters}`,
      params,
    );
    const total = Number(counted[0]?.total ?? 0);
    const pageCount = Math.max(1, Math.ceil(total / size));
    const safePage = Math.min(currentPage, pageCount);
    const rows = await this.database.query(
      `SELECT c.id, c.name, c.location, c.address, c.contact_email, c.contact_phone,
              o.id AS organization_id, o.name AS organization_name, o.country,
              (SELECT count(*)::int FROM clients WHERE clinic_id = c.id) AS child_count
       FROM clinics c
       JOIN organizations o ON o.id = c.organization_id
       ${filters}
       ORDER BY c.name
       LIMIT $5 OFFSET $6`,
      [...params, size, (safePage - 1) * size],
    );
    return {
      items: rows.map((row) => this.item(row)),
      total,
      page: safePage,
      pageSize: size,
      organizations: [{ id: organizationId, name: user.organization?.name ?? '' }],
      countries: [...new Set(rows.map((row) => asString(row.country).trim()).filter(Boolean))],
    };
  }

  private async assertMemberClinic(user: AuthUser, organizationId: string, clinicId: string): Promise<void> {
    if (user.organization?.id !== organizationId) {
      throw new ForbiddenException('You do not have access to this clinic.');
    }
    if (user.role === 'organization_admin') return;
    const access = await this.database.query(
      `SELECT 1 AS present FROM clinic_access WHERE clinic_id = $1 AND user_id = $2`,
      [clinicId, user.id],
    );
    if (access.length === 0) {
      throw new ForbiddenException('You do not have access to this clinic.');
    }
  }
}

function positiveInteger(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
