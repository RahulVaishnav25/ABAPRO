/**
 * Adds sample clients, programs and tasks to a development database.
 *
 *   npm run seed:sample -w @abapro/api -- [--organization "<name or id>"]
 *
 * Uses the same database settings as the API (DATABASE_URL or PGLITE_DIR). Stop the API first when it uses the
 * embedded database, which only one process may open. Refuses to run in production.
 */
import { readAppConfig } from '../config/app-config';
import { createDatabase } from '../db/database';
import { migrate } from '../db/migrate';
import { seedSampleData } from './sample-data';

async function main(): Promise<void> {
  const config = readAppConfig();
  if (config.nodeEnv === 'production') {
    throw new Error('Sample data is for development only and cannot be added in production.');
  }
  if (!config.databaseUrl && (await apiIsRunning(config.port))) {
    throw new Error(`The API is running on port ${config.port}. Stop it before seeding the embedded database.`);
  }
  const flag = process.argv.indexOf('--organization');
  const organization = flag === -1 ? undefined : process.argv[flag + 1];

  const db = await createDatabase(config);
  try {
    await migrate(db);
    const result = await seedSampleData(db, organization);
    process.stdout.write(
      `${result.organizationName}: added ${result.created.length} clients (${result.created.join(', ') || 'none'}), ` +
        `${result.programs} programs and ${result.tasks} tasks.` +
        (result.skipped.length ? ` Skipped existing codes: ${result.skipped.join(', ')}.` : '') +
        '\n',
    );
  } finally {
    await db.close();
  }
}

async function apiIsRunning(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
