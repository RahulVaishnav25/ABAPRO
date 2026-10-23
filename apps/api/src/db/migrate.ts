import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Database } from './database';

const MIGRATIONS = [
  '001_tenancy',
  '002_access_control',
  '003_client_management',
  '004_program_management',
  '005_session_collection',
  '006_platform_admin',
  '007_clinics',
  '008_platform_roles',
  '009_organization_identity',
];

export async function migrate(db: Database): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  for (const id of MIGRATIONS) {
    const applied = await db.query<{ id: string }>('SELECT id FROM schema_migrations WHERE id = $1', [id]);
    if (applied.length > 0) {
      continue;
    }
    const sql = readMigration(id);
    await db.transaction(async (tx) => {
      await tx.executeScript(sql);
      await tx.query('INSERT INTO schema_migrations (id) VALUES ($1)', [id]);
    });
  }
}

function readMigration(id: string): string {
  const fileName = `${id}.sql`;
  const candidates = [
    join(__dirname, '../migrations', fileName),
    join(__dirname, 'migrations', fileName),
    join(process.cwd(), 'src/migrations', fileName),
    join(process.cwd(), 'apps/api/src/migrations', fileName),
  ];
  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8');
    } catch {
      continue;
    }
  }
  throw new Error(`Migration ${fileName} was not found.`);
}
