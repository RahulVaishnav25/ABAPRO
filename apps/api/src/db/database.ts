import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AppConfig } from '../config/app-config';
import { loadEsm } from '../load-esm';

export interface Queryable {
  query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  executeScript(sql: string): Promise<void>;
}

export interface Database extends Queryable {
  transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T>;
  withTenant<T>(organizationId: string, work: (tx: Queryable) => Promise<T>, clinicId?: string | null): Promise<T>;
  close(): Promise<void>;
}

export async function createDatabase(config: AppConfig): Promise<Database> {
  if (config.databaseUrl) {
    return createPostgres(config.databaseUrl);
  }
  return createEmbeddedPostgres(config.pgliteDir);
}

async function createPostgres(connectionString: string): Promise<Database> {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString });
  const database: Database = {
    query: async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      const result = await pool.query(sql, params);
      return result.rows as T[];
    },
    executeScript: (sql) => runScript(database, sql),
    transaction: async (work) => {
      const client = await pool.connect();
      const tx: Queryable = {
        query: async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
          const result = await client.query(sql, params);
          return result.rows as T[];
        },
        executeScript: (sql) => runScript(tx, sql),
      };
      try {
        await client.query('BEGIN');
        const value = await work(tx);
        await client.query('COMMIT');
        return value;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    withTenant: (organizationId, work, clinicId) =>
      database.transaction(async (tx) => {
        await applyTenant(tx, organizationId, clinicId);
        return work(tx);
      }),
    close: () => pool.end(),
  };
  return database;
}

async function createEmbeddedPostgres(directory: string): Promise<Database> {
  mkdirSync(dirname(directory), { recursive: true });
  const { PGlite } = await loadEsm<{
    PGlite: new (directory: string) => {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
      transaction: <T>(callback: (tx: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<T>) => Promise<T>;
      close: () => Promise<void>;
    };
  }>('@electric-sql/pglite');
  const client = new PGlite(directory);

  const adapt = (target: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }): Queryable => ({
    query: async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      const result = await target.query(sql, params.map(toEmbeddedParam));
      return result.rows as T[];
    },
    executeScript: (sql) => runScript(adapt(target), sql),
  });

  const database: Database = {
    ...adapt(client),
    transaction: (work) => client.transaction((tx) => work(adapt(tx))),
    withTenant: (organizationId, work, clinicId) =>
      database.transaction(async (tx) => {
        await applyTenant(tx, organizationId, clinicId);
        return work(tx);
      }),
    close: () => client.close(),
  };
  return database;
}

async function applyTenant(tx: Queryable, organizationId: string, clinicId?: string | null): Promise<void> {
  await tx.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
  await tx.query(`SELECT set_config('app.clinic_id', $1, true)`, [clinicId ?? '']);
  await tx.query('SET LOCAL ROLE abapro_app');
}

async function runScript(db: Queryable, sql: string): Promise<void> {
  for (const statement of splitSql(sql)) {
    await db.query(statement);
  }
}

export function splitSql(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let index = 0;
  let dollarTag: string | null = null;
  while (index < sql.length) {
    if (dollarTag) {
      const end = sql.indexOf(dollarTag, index);
      if (end === -1) {
        current += sql.slice(index);
        break;
      }
      current += sql.slice(index, end + dollarTag.length);
      index = end + dollarTag.length;
      dollarTag = null;
      continue;
    }
    const tag = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(index));
    if (sql[index] === '$' && tag) {
      dollarTag = tag[0];
      current += dollarTag;
      index += dollarTag.length;
      continue;
    }
    if (sql[index] === ';') {
      const statement = current.trim();
      if (statement && !statement.startsWith('--')) {
        statements.push(statement);
      }
      current = '';
      index += 1;
      continue;
    }
    current += sql[index];
    index += 1;
  }
  const tail = current.trim();
  if (tail && !tail.startsWith('--')) {
    statements.push(tail);
  }
  return statements;
}

function toEmbeddedParam(value: unknown): unknown {
  return Buffer.isBuffer(value) ? new Uint8Array(value) : value;
}
