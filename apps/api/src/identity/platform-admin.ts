import bcrypt from 'bcryptjs';
import type { AppConfig } from '../config/app-config';
import type { Database } from '../db/database';

export const PLATFORM_ADMIN_EMAIL = 'super@abapro.test';
export const PLATFORM_ADMIN_PASSWORD = 'SuperAccess!2026';
export const PLATFORM_ADMIN_NAME = 'Super Admin';

export async function ensurePlatformAdmin(db: Database, config: AppConfig): Promise<void> {
  if (config.nodeEnv === 'production') {
    return;
  }
  await db.transaction(async (tx) => {
    const existing = await tx.query<{ id: string }>(`SELECT id FROM identity_accounts WHERE email = $1`, [PLATFORM_ADMIN_EMAIL]);
    let accountId = existing[0]?.id ? String(existing[0].id) : '';
    if (!accountId) {
      const passwordHash = await bcrypt.hash(PLATFORM_ADMIN_PASSWORD, 10);
      const inserted = await tx.query<{ id: string }>(
        `INSERT INTO identity_accounts (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id`,
        [PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_NAME, passwordHash],
      );
      accountId = String(inserted[0]?.id);
    }
    await tx.query(
      `INSERT INTO users (issuer, subject, email, name, email_verified, platform_admin)
       VALUES ($1, $2, $3, $4, true, true)
       ON CONFLICT (issuer, subject) DO UPDATE
         SET platform_admin = true,
             email = EXCLUDED.email,
             name = EXCLUDED.name,
             updated_at = now()`,
      [config.oidcIssuer, accountId, PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_NAME],
    );
    await tx.query(
      `DELETE FROM organization_memberships
       WHERE user_id IN (SELECT id FROM users WHERE email = $1 AND platform_admin = true)`,
      [PLATFORM_ADMIN_EMAIL],
    );
  });
}
