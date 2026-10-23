import { Controller, Get, Inject } from '@nestjs/common';
import { Public } from '../common/auth.decorators';
import { DATABASE } from '../db/database.module';
import type { Database } from '../db/database';

@Controller('v1/health')
export class HealthController {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  @Public()
  @Get()
  async getHealth(): Promise<{ status: 'ok'; service: 'abapro-api'; auth: 'oidc'; database: 'up' }> {
    await this.database.query('SELECT 1 AS ok');
    return {
      status: 'ok',
      service: 'abapro-api',
      auth: 'oidc',
      database: 'up',
    };
  }
}
