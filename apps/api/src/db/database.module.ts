import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { APP_CONFIG } from '../config/app-config.module';
import { createDatabase, type Database } from './database';
import { ensurePlatformAdmin } from '../identity/platform-admin';
import { migrate } from './migrate';

export const DATABASE = Symbol('DATABASE');

class DatabaseLifecycle implements OnModuleDestroy {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async onModuleDestroy(): Promise<void> {
    await this.database.close();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [APP_CONFIG],
      useFactory: async (config: AppConfig): Promise<Database> => {
        const database = await createDatabase(config);
        await migrate(database);
        await ensurePlatformAdmin(database, config);
        return database;
      },
    },
    DatabaseLifecycle,
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}
