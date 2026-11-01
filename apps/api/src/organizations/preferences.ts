import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  PERMISSIONS,
  resolvePreferences,
  type AuthUser,
  type EffectivePreferences,
  type RegionalSettings,
  type UserPreferences,
} from '@abapro/shared';
import { getDocument, setDocument } from '../common/documents';
import { asNullableString } from '../common/http';
import type { Queryable } from '../db/database';

const PLATFORM = ['platform_settings', 'regional'] as const;
const ORGANIZATION_COLLECTION = 'organization_settings';
const USER_COLLECTION = 'user_preferences';

/**
 * Regional preferences at three levels. Organisation language and timezone stay in the organizations table; the
 * other organisation settings, and the platform and user levels, are documents.
 */
export async function platformRegional(db: Queryable): Promise<RegionalSettings> {
  return (await getDocument<RegionalSettings>(db, ...PLATFORM)) ?? {};
}

export async function organizationRegional(db: Queryable, organizationId: string): Promise<RegionalSettings> {
  const rows = await db.query<{ locale: string | null; timezone: string | null }>(
    `SELECT locale, timezone FROM organizations WHERE id = $1`,
    [organizationId],
  );
  const extra = (await getDocument<RegionalSettings>(db, ORGANIZATION_COLLECTION, organizationId)) ?? {};
  return clean({
    ...extra,
    locale: (asNullableString(rows[0]?.locale) ?? undefined) as RegionalSettings['locale'],
    timezone: asNullableString(rows[0]?.timezone) ?? undefined,
  });
}

export async function userPreferences(db: Queryable, userId: string): Promise<UserPreferences> {
  return (await getDocument<UserPreferences>(db, USER_COLLECTION, userId)) ?? {};
}

export async function effectivePreferences(db: Queryable, userId: string, organizationId: string | null): Promise<EffectivePreferences> {
  const [user, organization, platform] = await Promise.all([
    userPreferences(db, userId),
    organizationId ? organizationRegional(db, organizationId) : Promise.resolve(null),
    platformRegional(db),
  ]);
  return resolvePreferences({ user, organization, platform });
}

export async function saveUserPreferences(db: Queryable, user: AuthUser, input: UserPreferences): Promise<void> {
  checkTimezone(input.timezone);
  await setDocument(db, USER_COLLECTION, user.id, clean({ locale: input.locale, timezone: input.timezone, dateFormat: input.dateFormat, timeFormat: input.timeFormat }));
}

/** Organisation administrators, and super admins, change their organisation's settings. */
export async function saveOrganizationRegional(db: Queryable, user: AuthUser, input: RegionalSettings): Promise<void> {
  const organizationId = user.organization?.id;
  if (!organizationId) throw new ForbiddenException('Choose an organisation first.');
  if (!user.platformAdmin && user.role !== 'organization_admin' && !user.permissions.includes(PERMISSIONS.settingsManage)) {
    throw new ForbiddenException('Only an organisation administrator can change regional settings.');
  }
  checkTimezone(input.timezone);
  // Language and timezone are required organisation fields: a blank value keeps the current one.
  if (input.locale) await db.query(`UPDATE organizations SET locale = $2, updated_at = now() WHERE id = $1`, [organizationId, input.locale]);
  if (input.timezone) await db.query(`UPDATE organizations SET timezone = $2, updated_at = now() WHERE id = $1`, [organizationId, input.timezone]);
  await setDocument(db, ORGANIZATION_COLLECTION, organizationId, clean({ dateFormat: input.dateFormat, timeFormat: input.timeFormat, currency: input.currency }));
}

export async function savePlatformRegional(db: Queryable, user: AuthUser, input: RegionalSettings): Promise<void> {
  if (!user.platformAdmin) throw new ForbiddenException('Only a super admin can change platform defaults.');
  checkTimezone(input.timezone);
  await setDocument(db, ...PLATFORM, clean({ ...input }));
}

function checkTimezone(timezone: string | undefined): void {
  if (!timezone) return;
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
  } catch {
    throw new BadRequestException('Choose a valid timezone.');
  }
}

/** Drops unset values, so they fall through to the next level. */
function clean<T extends object>(settings: T): T {
  return Object.fromEntries(Object.entries(settings).filter(([, value]) => value !== undefined && value !== null && value !== '')) as T;
}
