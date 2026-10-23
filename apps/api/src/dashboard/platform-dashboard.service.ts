import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { AuthUser, PlatformClinicCountry, PlatformDashboard, PlatformSessionTrendPoint } from '@abapro/shared';
import { DATABASE } from '../db/database.module';
import type { Database } from '../db/database';

const TREND_DAYS = 14;

@Injectable()
export class PlatformDashboardService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async get(user: AuthUser): Promise<PlatformDashboard> {
    if (!user.platformAdmin) {
      throw new ForbiddenException('Only a platform administrator can view this dashboard.');
    }
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - (TREND_DAYS - 1));

    const [organisations, clinics, clients, countries, sessions] = await Promise.all([
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
      this.database.query<{ day: string; status: string; total: number }>(
        `SELECT to_char(started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
                status,
                count(*)::int AS total
         FROM therapy_sessions
         WHERE started_at >= $1::timestamptz
           AND status IN ('completed', 'scheduled', 'in_progress')
         GROUP BY 1, 2`,
        [start.toISOString()],
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
      sessionTrend: trendFrom(start, sessions),
    };
  }
}

function countOf(value: unknown): number {
  const count = Number(value ?? 0);
  return Number.isFinite(count) ? count : 0;
}

function trendFrom(
  start: Date,
  rows: { day: string; status: string; total: number }[],
): PlatformSessionTrendPoint[] {
  const points = new Map<string, PlatformSessionTrendPoint>();
  for (let offset = 0; offset < TREND_DAYS; offset += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + offset);
    const key = date.toISOString().slice(0, 10);
    points.set(key, { date: key, completed: 0, scheduled: 0, inProgress: 0 });
  }
  for (const row of rows) {
    const point = points.get(String(row.day).slice(0, 10));
    if (!point) continue;
    const total = countOf(row.total);
    if (row.status === 'completed') point.completed = total;
    else if (row.status === 'scheduled') point.scheduled = total;
    else if (row.status === 'in_progress') point.inProgress = total;
  }
  return [...points.values()];
}
