import { Inject, Injectable } from '@nestjs/common';
import * as Iron from '@hapi/iron';
import type { AuthUser } from '@abapro/shared';
import type { AppConfig } from '../config/app-config';
import { APP_CONFIG } from '../config/app-config.module';
import { recordAudit } from '../common/audit';
import { asDate, asNullableString, asString, randomToken, sha256 } from '../common/http';
import { DATABASE } from '../db/database.module';
import type { Database, Queryable } from '../db/database';
import { AccountService } from './account.service';
import { OidcClientService, type IssuedTokens } from './oidc-client.service';

interface SessionRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  organization_id: string | null;
  clinic_id?: string | null;
  refresh_token_sealed: string | null;
  id_token_sealed: string | null;
  access_expires_at: Date | string;
  idle_expires_at: Date | string;
  absolute_expires_at: Date | string;
  revoked_at: Date | string | null;
}

export interface ResolvedSession {
  sessionId: string;
  user: AuthUser;
}

@Injectable()
export class SessionService {
  private readonly renewals = new Map<string, Promise<void>>();

  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(AccountService) private readonly accounts: AccountService,
    @Inject(OidcClientService) private readonly oidc: OidcClientService,
  ) {}

  async create(tokens: IssuedTokens): Promise<string> {
    const secret = randomToken();
    const now = Date.now();
    await this.database.transaction(async (tx) => {
      const id = await this.accounts.upsertFromClaims(tx, {
        issuer: this.config.oidcIssuer,
        subject: tokens.subject,
        email: tokens.email,
        name: tokens.name,
        emailVerified: tokens.emailVerified,
      });
      await tx.query(
        `INSERT INTO sessions (
           secret_hash, user_id, refresh_token_sealed, id_token_sealed,
           access_expires_at, idle_expires_at, absolute_expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          sha256(secret),
          id,
          await this.seal(tokens.refreshToken),
          await this.seal(tokens.idToken),
          new Date(now + tokens.expiresIn * 1000),
          new Date(now + this.config.sessionIdleSeconds * 1000),
          new Date(now + this.config.sessionAbsoluteSeconds * 1000),
        ],
      );
      await recordAudit(tx, { actorUserId: id, action: 'auth.login', targetType: 'user', targetId: id });
    });
    return secret;
  }

  async createForAccount(account: { id: string; email: string; name: string }): Promise<{ secret: string; userId: string; sessionId: string }> {
    const secret = randomToken();
    const now = Date.now();
    const created = await this.database.transaction(async (tx) => {
      const userId = await this.accounts.upsertFromClaims(tx, {
        issuer: this.config.oidcIssuer,
        subject: account.id,
        email: account.email,
        name: account.name,
        emailVerified: false,
      });
      const rows = await tx.query<{ id: string }>(
        `INSERT INTO sessions (
           secret_hash, user_id, access_expires_at, idle_expires_at, absolute_expires_at
         ) VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          sha256(secret),
          userId,
          new Date(now + 15 * 60 * 1000),
          new Date(now + this.config.sessionIdleSeconds * 1000),
          new Date(now + this.config.sessionAbsoluteSeconds * 1000),
        ],
      );
      await recordAudit(tx, { actorUserId: userId, action: 'auth.login', targetType: 'user', targetId: userId });
      return { userId, sessionId: asString(rows[0]?.id) };
    });
    return { secret, ...created };
  }

  async resolve(secret: string): Promise<ResolvedSession | null> {
    const row = await this.findActive(secret);
    if (!row) {
      return null;
    }
    if (asDate(row.access_expires_at).getTime() <= Date.now()) {
      await this.renew(row);
      const refreshed = await this.findActive(secret);
      if (!refreshed) {
        return null;
      }
      return this.present(refreshed);
    }
    await this.touchIdle(row);
    return this.present(row);
  }

  async revoke(secret: string): Promise<{ endSessionUrl: string | null }> {
    const rows = await this.database.query<SessionRow>(
      `SELECT id, user_id, organization_id, id_token_sealed, revoked_at
       FROM sessions WHERE secret_hash = $1`,
      [sha256(secret)],
    );
    const row = rows[0];
    if (!row || row.revoked_at) {
      return { endSessionUrl: null };
    }
    await this.database.query(`UPDATE sessions SET revoked_at = now(), updated_at = now() WHERE id = $1`, [row.id]);
    await recordAudit(this.database, {
      actorUserId: asString(row.user_id),
      organizationId: asNullableString(row.organization_id),
      action: 'auth.logout',
      targetType: 'session',
      targetId: asString(row.id),
    });
    const idToken = row.id_token_sealed ? await this.unseal(asString(row.id_token_sealed)) : null;
    return { endSessionUrl: idToken ? await this.oidc.endSessionUrl(idToken) : null };
  }

  async setOrganization(db: Queryable, sessionId: string, organizationId: string): Promise<void> {
    await db.query(`UPDATE sessions SET organization_id = $1, updated_at = now() WHERE id = $2 AND revoked_at IS NULL`, [
      organizationId,
      sessionId,
    ]);
  }

  async setClinic(db: Queryable, sessionId: string, clinicId: string | null): Promise<void> {
    await db.query(`UPDATE sessions SET clinic_id = $1, updated_at = now() WHERE id = $2 AND revoked_at IS NULL`, [
      clinicId,
      sessionId,
    ]);
  }

  private async present(row: SessionRow): Promise<ResolvedSession> {
    const user = await this.accounts.load(
      asString(row.user_id),
      asNullableString(row.organization_id),
      asNullableString(row.clinic_id),
    );
    const selected = user.clinic?.id ?? null;
    if (selected !== asNullableString(row.clinic_id)) {
      await this.setClinic(this.database, asString(row.id), selected);
    }
    return { sessionId: asString(row.id), user };
  }

  private async findActive(secret: string): Promise<SessionRow | null> {
    const rows = await this.database.query<SessionRow>(
      `SELECT id, user_id, organization_id, clinic_id, refresh_token_sealed, id_token_sealed,
              access_expires_at, idle_expires_at, absolute_expires_at, revoked_at
       FROM sessions WHERE secret_hash = $1`,
      [sha256(secret)],
    );
    const row = rows[0];
    if (!row || row.revoked_at) {
      return null;
    }
    const now = Date.now();
    if (asDate(row.absolute_expires_at).getTime() <= now || asDate(row.idle_expires_at).getTime() <= now) {
      await this.database.query(`UPDATE sessions SET revoked_at = now(), updated_at = now() WHERE id = $1`, [row.id]);
      return null;
    }
    return row;
  }

  private async renew(row: SessionRow): Promise<void> {
    const existing = this.renewals.get(asString(row.id));
    if (existing) {
      await existing;
      return;
    }
    const pending = this.performRenew(row).finally(() => {
      this.renewals.delete(asString(row.id));
    });
    this.renewals.set(asString(row.id), pending);
    await pending;
  }

  private async performRenew(row: SessionRow): Promise<void> {
    if (!row.refresh_token_sealed) {
      const absolute = asDate(row.absolute_expires_at);
      const accessExpires = new Date(Date.now() + 15 * 60 * 1000);
      await this.database.query(
        `UPDATE sessions
         SET access_expires_at = $2, idle_expires_at = $3, updated_at = now()
         WHERE id = $1 AND revoked_at IS NULL`,
        [row.id, accessExpires < absolute ? accessExpires : absolute, this.nextIdle(absolute)],
      );
      return;
    }
    try {
      const tokens = await this.oidc.refresh(await this.unseal(asString(row.refresh_token_sealed)));
      const accessExpires = new Date(Date.now() + tokens.expiresIn * 1000);
      const absolute = asDate(row.absolute_expires_at);
      await this.database.query(
        `UPDATE sessions
         SET refresh_token_sealed = $2,
             id_token_sealed = $3,
             access_expires_at = $4,
             idle_expires_at = $5,
             updated_at = now()
         WHERE id = $1 AND revoked_at IS NULL`,
        [
          row.id,
          await this.seal(tokens.refreshToken),
          await this.seal(tokens.idToken),
          accessExpires < absolute ? accessExpires : absolute,
          this.nextIdle(absolute),
        ],
      );
      await recordAudit(this.database, {
        actorUserId: asString(row.user_id),
        organizationId: asNullableString(row.organization_id),
        action: 'auth.session_renewed',
        targetType: 'session',
        targetId: asString(row.id),
      });
    } catch {
      await this.database.query(`UPDATE sessions SET revoked_at = now(), updated_at = now() WHERE id = $1`, [row.id]);
    }
  }

  private async touchIdle(row: SessionRow): Promise<void> {
    await this.database.query(`UPDATE sessions SET idle_expires_at = $2, updated_at = now() WHERE id = $1`, [
      row.id,
      this.nextIdle(asDate(row.absolute_expires_at)),
    ]);
    if (row.organization_id) {
      await this.database.query(
        `UPDATE organization_memberships
         SET last_active_at = now()
         WHERE user_id = $1 AND organization_id = $2 AND status = 'active'
           AND (last_active_at IS NULL OR last_active_at < now() - interval '5 minutes')`,
        [row.user_id, row.organization_id],
      );
    }
  }

  private nextIdle(absolute: Date): Date {
    const idle = new Date(Date.now() + this.config.sessionIdleSeconds * 1000);
    return idle < absolute ? idle : absolute;
  }

  private seal(value: string): Promise<string> {
    return Iron.seal({ value }, this.config.cookieSecret, Iron.defaults);
  }

  private async unseal(sealed: string): Promise<string> {
    const opened = (await Iron.unseal(sealed, this.config.cookieSecret, Iron.defaults)) as { value?: string };
    if (!opened.value) {
      throw new Error('The stored session credential could not be opened.');
    }
    return opened.value;
  }
}
