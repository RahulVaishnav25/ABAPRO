import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { AuthUser, SignInAccount } from '@abapro/shared';
import type { AppConfig } from '../config/app-config';
import { APP_CONFIG } from '../config/app-config.module';
import { asDate, asString } from '../common/http';
import { DATABASE } from '../db/database.module';
import type { Database } from '../db/database';
import { registerIdentity } from '../identity/directory';
import { AccountService } from './account.service';

@Injectable()
export class PlatformAccountService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(AccountService) private readonly accounts: AccountService,
  ) {}

  async list(actor: AuthUser): Promise<SignInAccount[]> {
    this.requirePlatformAdmin(actor);
    const rows = await this.database.query(
      `SELECT a.id, a.email, a.name, a.created_at, COALESCE(u.platform_admin, false) AS platform_admin
       FROM identity_accounts a
       LEFT JOIN users u ON u.issuer = $1 AND u.subject = a.id::text
       ORDER BY a.name`,
      [this.config.oidcIssuer],
    );
    return rows.map((row) => ({
      id: asString(row.id),
      email: asString(row.email),
      name: asString(row.name),
      createdAt: asDate(row.created_at).toISOString(),
      platformAdmin: row.platform_admin === true || row.platform_admin === 't' || row.platform_admin === 'true',
    }));
  }

  async create(actor: AuthUser, input: { name: string; email: string; password: string; platformAdmin?: boolean }): Promise<SignInAccount> {
    this.requirePlatformAdmin(actor);
    const result = await registerIdentity(this.database, input);
    if (!result.ok) {
      if (result.message.startsWith('Use a password')) {
        throw new BadRequestException(result.message);
      }
      throw new ConflictException(result.message);
    }
    const userId = await this.accounts.upsertFromClaims(this.database, {
      issuer: this.config.oidcIssuer,
      subject: result.account.id,
      email: result.account.email,
      name: result.account.name,
      emailVerified: false,
    });
    const platformAdmin = input.platformAdmin === true;
    if (platformAdmin) {
      await this.database.query(`UPDATE users SET platform_admin = true WHERE id = $1`, [userId]);
    }
    return {
      id: result.account.id,
      email: result.account.email,
      name: result.account.name,
      createdAt: new Date().toISOString(),
      platformAdmin,
    };
  }

  private requirePlatformAdmin(actor: AuthUser): void {
    if (!actor.platformAdmin) {
      throw new ForbiddenException('Only a platform administrator can create sign-in accounts.');
    }
  }
}
