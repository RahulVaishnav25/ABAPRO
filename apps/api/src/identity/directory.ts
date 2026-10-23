import bcrypt from 'bcryptjs';
import type { AppConfig } from '../config/app-config';
import { recordAudit } from '../common/audit';
import { normalizeEmail, randomToken, sha256 } from '../common/http';
import type { Database, Queryable } from '../db/database';

const GENERIC_REGISTER = 'Could not create an account with those details.';
const RESET_TTL_MS = 30 * 60 * 1000;

export interface IdentityAccount {
  id: string;
  email: string;
  name: string;
}

let dummyHash: Promise<string> | null = null;

function dummyPasswordHash(): Promise<string> {
  dummyHash ??= bcrypt.hash('not-a-real-password', 10);
  return dummyHash;
}

export function passwordProblem(password: string): string | null {
  if (password.length < 10 || password.length > 128) {
    return 'Use a password between 10 and 128 characters.';
  }
  return null;
}

export async function authenticateIdentity(
  db: Queryable,
  email: string,
  password: string,
): Promise<IdentityAccount | null> {
  const accounts = await db.query(
    `SELECT id, email, name, password_hash FROM identity_accounts WHERE email = $1`,
    [normalizeEmail(email)],
  );
  const account = accounts[0];
  const hash = typeof account?.password_hash === 'string' ? account.password_hash : await dummyPasswordHash();
  const matches = await bcrypt.compare(password, hash);
  if (!account || !matches) {
    return null;
  }
  return { id: String(account.id), email: String(account.email), name: String(account.name) };
}

export async function registerIdentity(
  db: Database,
  input: { email: string; name: string; password: string },
): Promise<{ ok: true; account: IdentityAccount } | { ok: false; message: string }> {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || name.length < 1 || name.length > 80) {
    return { ok: false, message: GENERIC_REGISTER };
  }
  const problem = passwordProblem(input.password);
  if (problem) {
    return { ok: false, message: problem };
  }
  const existing = await db.query(`SELECT id FROM identity_accounts WHERE email = $1`, [email]);
  if (existing.length > 0) {
    await bcrypt.hash(input.password, 10);
    return { ok: false, message: GENERIC_REGISTER };
  }
  const passwordHash = await bcrypt.hash(input.password, 10);
  try {
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO identity_accounts (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id`,
      [email, name, passwordHash],
    );
    return { ok: true, account: { id: String(inserted[0]?.id), email, name } };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, message: GENERIC_REGISTER };
    }
    throw error;
  }
}

export async function requestPasswordReset(db: Database, config: AppConfig, emailInput: string): Promise<void> {
  const email = normalizeEmail(emailInput);
  const accounts = await db.query(`SELECT id FROM identity_accounts WHERE email = $1`, [email]);
  const account = accounts[0];
  if (!account || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return;
  }
  const token = randomToken();
  await db.query(
    `INSERT INTO identity_password_resets (account_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [account.id, sha256(token), new Date(Date.now() + RESET_TTL_MS)],
  );
  if (config.nodeEnv !== 'production') {
    await db.query(`INSERT INTO identity_outbound_messages (recipient, subject, body) VALUES ($1, $2, $3)`, [
      email,
      'Reset your ABAPro password',
      `Reset your password:\n${config.oidcIssuer}/identity/reset/confirm?token=${token}`,
    ]);
  }
  await recordAudit(db, {
    action: 'identity.password_reset_requested',
    targetType: 'identity_account',
    targetId: String(account.id),
  });
}

export async function completePasswordReset(
  db: Database,
  token: string,
  password: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const problem = passwordProblem(password);
  if (problem) {
    return { ok: false, message: problem };
  }
  const passwordHash = await bcrypt.hash(password, 10);
  return db.transaction(async (tx) => {
    const rows = await tx.query<{ account_id: string }>(
      `UPDATE identity_password_resets
       SET used_at = now()
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
       RETURNING account_id`,
      [sha256(token)],
    );
    const accountId = rows[0]?.account_id;
    if (!accountId) {
      return { ok: false, message: 'This reset link is no longer valid.' };
    }
    await tx.query(`UPDATE identity_accounts SET password_hash = $2, updated_at = now() WHERE id = $1`, [
      accountId,
      passwordHash,
    ]);
    await recordAudit(tx, {
      action: 'identity.password_reset_completed',
      targetType: 'identity_account',
      targetId: String(accountId),
    });
    return { ok: true };
  });
}

export async function identityAccount(db: Queryable, id: string): Promise<IdentityAccount | null> {
  const rows = await db.query(`SELECT id, email, name FROM identity_accounts WHERE id = $1`, [id]);
  const account = rows[0];
  if (!account) {
    return null;
  }
  return { id: String(account.id), email: String(account.email), name: String(account.name) };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505';
}
