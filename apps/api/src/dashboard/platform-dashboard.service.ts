import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { AuthUser, PlatformClinicCountry, PlatformDashboard } from '@abapro/shared';
import { DATABASE } from '../db/database.module';
import type { Database } from '../db/database';

@Injectable()
export class PlatformDashboardService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async get(user: AuthUser): Promise<PlatformDashboard> {
    if (!user.platformAdmin) {
      throw new ForbiddenException('Only a platform administrator can view this dashboard.');
    }
    const [organisations, clinics, clients, countries] = await Promise.all([
      this.database.query<{ total: number }>(`SELECT count(*)::int AS total FROM organizations`),
      this.database.query<{ total: number }>(`SELECT count(*)::int AS total FROM clinics`),
      this.database.query<{ total: number; active: number }>(
        `SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'active')::int AS active FROM clients`,
      ),
      this.database.query<{ country: string; clinics: number }>(
        `SELECT o.country, count(*)::int AS clinics
         FROM clinics c
         JOIN organizations o ON o.id = c.organization_id
         GROUP BY o.country
         ORDER BY clinics DESC, o.country`,
      ),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      timezone: 'UTC',
      organisations: countOf(organisations[0]?.total),
      clinics: countOf(clinics[0]?.total),
      clients: countOf(clients[0]?.total),
      activeClients: countOf(clients[0]?.active),
      clinicsByCountry: countries.map(
        (row): PlatformClinicCountry => ({
          country: String(row.country).trim(),
          clinics: countOf(row.clinics),
        }),
      ),
    };
  }
}

function countOf(value: unknown): number {
  const count = Number(value ?? 0);
  return Number.isFinite(count) ? count : 0;
}
