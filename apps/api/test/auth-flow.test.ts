import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthUser } from '@abapro/shared';
import { createApplication, type RunningApplication } from '../src/create-application';

const password = 'correct-horse-battery';
let running: RunningApplication;
let base = '';
let dataDir = '';

describe.sequential('authentication and tenancy', () => {
  const admin = new CookieJar();
  let adminUser: AuthUser;
  let invitedToken = '';
  let firstOrganizationId = '';

  beforeAll(async () => {
    const apiPort = await freePort();
    const oidcPort = await freePort();
    dataDir = await mkdtemp(join(tmpdir(), 'abapro-'));
    process.env.NODE_ENV = 'test';
    process.env.PORT = String(apiPort);
    process.env.OIDC_PORT = String(oidcPort);
    process.env.WEB_ORIGIN = `http://127.0.0.1:${apiPort}`;
    process.env.CORS_ORIGIN = process.env.WEB_ORIGIN;
    process.env.PGLITE_DIR = dataDir;
    process.env.RATE_LIMIT = 'false';
    process.env.EMBEDDED_OIDC = 'true';
    delete process.env.DATABASE_URL;
    delete process.env.OIDC_ISSUER;
    delete process.env.OIDC_CLIENT_ID;
    delete process.env.OIDC_CLIENT_SECRET;
    delete process.env.OIDC_REDIRECT_URI;
    delete process.env.COOKIE_SECRET;
    running = await createApplication();
    await running.app.listen(running.config.port, '127.0.0.1');
    base = `http://127.0.0.1:${running.config.port}`;
  }, 90_000);

  afterAll(async () => {
    await running?.close();
    if (dataDir) {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it('signs in with email and password and lets a platform administrator create accounts', async () => {
    const jar = new CookieJar();
    const signedIn = await api(jar, '/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'super@abapro.test', password: 'SuperAccess!2026' }),
    });
    expect(signedIn.response.status).toBe(200);
    expect(signedIn.body).toMatchObject({ email: 'super@abapro.test', platformAdmin: true, organization: null });

    const wrong = await api(new CookieJar(), '/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'super@abapro.test', password: 'not-the-password' }),
    });
    expect(wrong.response.status).toBe(401);

    const created = await api(jar, '/api/v1/auth/accounts', {
      method: 'POST',
      body: JSON.stringify({ name: 'Clinic Owner', email: 'owner@example.com', password: 'ClinicAccess!2026' }),
    });
    expect(created.response.status).toBe(201);
    expect(created.body).toMatchObject({ email: 'owner@example.com', platformAdmin: false });

    const ownerJar = new CookieJar();
    const owner = await api(ownerJar, '/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'owner@example.com', password: 'ClinicAccess!2026' }),
    });
    expect(owner.response.status).toBe(200);
    expect((owner.body as AuthUser).platformAdmin).toBe(false);

    const denied = await api(ownerJar, '/api/v1/auth/accounts', {
      method: 'POST',
      body: JSON.stringify({ name: 'Other Person', email: 'other@example.com', password: 'ClinicAccess!2026' }),
    });
    expect(denied.response.status).toBe(403);
  });

  it('answers health without a development password directory', async () => {
    const health = await api(new CookieJar(), '/api/v1/health');
    expect(health.response.status).toBe(200);
    expect(health.body).toMatchObject({ status: 'ok', auth: 'oidc', database: 'up' });
  });

  it('rejects a failed sign-in without revealing whether the account exists', async () => {
    const jar = new CookieJar();
    const form = await interactionForm(jar);
    const failed = await submitForm(jar, form.loginAction, form.url, {
      email: 'missing@example.com',
      password: 'not-the-password',
    });
    expect(failed.response.status).toBe(200);
    expect(failed.text).toContain('The email or password is incorrect.');

    const registered = await register(new CookieJar(), {
      email: 'taken@example.com',
      name: 'Taken User',
      password,
    });
    expect(registered.email).toBe('taken@example.com');
    const duplicateJar = new CookieJar();
    const duplicate = await interactionForm(duplicateJar);
    const again = await submitForm(duplicateJar, duplicate.registerAction, duplicate.url, {
      email: 'taken@example.com',
      name: 'Someone Else',
      password,
    });
    expect(again.text).toContain('Could not create an account with those details.');
  });

  it('signs in and keeps a user without an organization off the dashboard', async () => {
    adminUser = await register(admin, { email: 'admin@example.com', name: 'Avery Admin', password });
    expect(adminUser.organization).toBeNull();
    const dashboard = await api(admin, '/api/v1/dashboard');
    expect(dashboard.response.status).toBe(403);
  });

  it('creates an organization and invitation without returning the token', async () => {
    const denied = await api(admin, '/api/v1/organizations', {
      method: 'POST',
      body: JSON.stringify(organizationBody('North Shore Therapy', 'therapist@example.com')),
    });
    expect(denied.response.status).toBe(403);
    const directory = await api(admin, '/api/v1/organizations');
    expect(directory.response.status).toBe(403);
    await running.database.query(`UPDATE users SET platform_admin = true WHERE id = $1`, [adminUser.id]);
    const created = await api(admin, '/api/v1/organizations', {
      method: 'POST',
      body: JSON.stringify(organizationBody('North Shore Therapy', 'therapist@example.com')),
    });
    expect(created.response.status).toBe(201);
    adminUser = created.body as AuthUser;
    firstOrganizationId = adminUser.organization?.id ?? '';
    expect(adminUser.role).toBe('organization_admin');
    expect(created.text).not.toContain('token=');
    const mailbox = await running.database.query<{ body: string }>(
      `SELECT body FROM identity_outbound_messages WHERE recipient = $1 ORDER BY created_at DESC LIMIT 1`,
      ['therapist@example.com'],
    );
    invitedToken = mailbox[0]?.body.match(/token=([A-Za-z0-9_-]+)/)?.[1] ?? '';
    expect(invitedToken.length).toBeGreaterThan(20);
    const stored = await running.database.query<{ token_hash: string }>(
      `SELECT token_hash FROM invitations WHERE email = $1`,
      ['therapist@example.com'],
    );
    expect(stored[0]?.token_hash).not.toBe(invitedToken);
  });

  it('scopes the dashboard to the session organization and ignores a client organization id', async () => {
    const dashboard = await api(admin, `/api/v1/dashboard?organizationId=00000000-0000-4000-8000-000000000099`);
    expect(dashboard.response.status).toBe(200);
    expect(dashboard.body).toMatchObject({
      source: 'synthetic',
      organizationId: firstOrganizationId,
      organizationName: 'North Shore Therapy',
    });
  });

  it('rejects a duplicate pending invitation', async () => {
    const duplicate = await api(admin, '/api/v1/organization/invitations', {
      method: 'POST',
      body: JSON.stringify({ email: 'therapist@example.com', role: 'therapist' }),
    });
    expect(duplicate.response.status).toBe(409);
    expect(duplicate.body).toMatchObject({ message: 'An invitation is already pending for that email.' });
  });

  it('stops a different account from accepting an invitation', async () => {
    const outsider = new CookieJar();
    await register(outsider, { email: 'outsider@example.com', name: 'Outside Person', password });
    const accepted = await api(outsider, '/api/v1/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token: invitedToken }),
    });
    expect(accepted.response.status).toBe(403);
    expect(String((accepted.body as { message?: string }).message)).not.toContain('therapist@example.com');
  });

  it('accepts an invitation once for the invited account', async () => {
    const therapist = new CookieJar();
    await register(therapist, { email: 'therapist@example.com', name: 'Taylor Therapist', password });
    const accepted = await api(therapist, '/api/v1/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token: invitedToken }),
    });
    expect(accepted.response.status).toBe(201);
    expect(accepted.body).toMatchObject({
      email: 'therapist@example.com',
      role: 'therapist',
      organization: { id: firstOrganizationId },
    });
    const replay = await api(therapist, '/api/v1/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token: invitedToken }),
    });
    expect(replay.response.status).toBe(400);
    expect(replay.body).toMatchObject({ message: 'This invitation is no longer valid.' });
  });

  it('switches between organizations and rejects an organization the user does not belong to', async () => {
    const second = await api(admin, '/api/v1/organizations', {
      method: 'POST',
      body: JSON.stringify(organizationBody('Harbor Learning Collective')),
    });
    expect(second.response.status).toBe(201);
    const switched = second.body as AuthUser;
    const secondId = switched.organization?.id ?? '';
    expect(switched.organizations).toHaveLength(2);
    const back = await api(admin, '/api/v1/auth/switch-organization', {
      method: 'POST',
      body: JSON.stringify({ organizationId: firstOrganizationId }),
    });
    expect(back.response.status).toBe(201);
    const dashboard = await api(admin, '/api/v1/dashboard');
    expect(dashboard.body).toMatchObject({ organizationId: firstOrganizationId, organizationName: 'North Shore Therapy' });
    const denied = await api(admin, '/api/v1/auth/switch-organization', {
      method: 'POST',
      body: JSON.stringify({ organizationId: '00000000-0000-4000-8000-000000000099' }),
    });
    expect(denied.response.status).toBe(403);
    const forward = await api(admin, '/api/v1/auth/switch-organization', {
      method: 'POST',
      body: JSON.stringify({ organizationId: secondId }),
    });
    expect((forward.body as AuthUser).organization?.id).toBe(secondId);
  });

  it('renews an expired access token and then rejects an absolutely expired session', async () => {
    await running.database.query(
      `UPDATE sessions SET access_expires_at = now() - interval '5 minutes' WHERE user_id = $1 AND revoked_at IS NULL`,
      [adminUser.id],
    );
    const renewed = await api(admin, '/api/v1/auth/me');
    expect(renewed.response.status).toBe(200);
    const access = await running.database.query<{ access_expires_at: string | Date }>(
      `SELECT access_expires_at FROM sessions WHERE user_id = $1 AND revoked_at IS NULL`,
      [adminUser.id],
    );
    expect(new Date(access[0]?.access_expires_at ?? 0).getTime()).toBeGreaterThan(Date.now());
    const audits = await running.database.query(`SELECT action FROM audit_events WHERE action = 'auth.session_renewed'`);
    expect(audits.length).toBeGreaterThan(0);

    await running.database.query(
      `UPDATE sessions
       SET access_expires_at = now() - interval '5 minutes', absolute_expires_at = now() - interval '1 minute'
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [adminUser.id],
    );
    const expired = await api(admin, '/api/v1/auth/me');
    expect(expired.response.status).toBe(401);
    expect(expired.body).toMatchObject({ message: 'Your session has expired.' });
  });

  it('signs out and requires authentication afterwards', async () => {
    const jar = new CookieJar();
    await signIn(jar, 'admin@example.com', password);
    const signedOut = await api(jar, '/api/v1/auth/logout', { method: 'POST' });
    expect(signedOut.response.status).toBe(201);
    const me = await api(jar, '/api/v1/auth/me');
    expect(me.response.status).toBe(401);
  });

  it('resets a password through a single-use link and keeps the response generic', async () => {
    const jar = new CookieJar();
    await register(jar, { email: 'reset@example.com', name: 'Reset User', password });
    const unknown = await requestReset('nobody@example.com');
    const known = await requestReset('reset@example.com');
    expect(unknown).toContain('If an account exists for that email');
    expect(known).toContain('If an account exists for that email');
    const messages = await running.database.query<{ body: string }>(
      `SELECT body FROM identity_outbound_messages WHERE recipient = $1 AND subject = 'Reset your ABAPro password'`,
      ['reset@example.com'],
    );
    const token = messages[0]?.body.match(/token=([A-Za-z0-9_-]+)/)?.[1] ?? '';
    const confirm = await fetch(`${running.config.oidcIssuer}/identity/reset/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token, password: 'a-new-password-value' }),
      redirect: 'manual',
    });
    expect(await confirm.text()).toContain('Your password has been updated.');
    const reused = await fetch(`${running.config.oidcIssuer}/identity/reset/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token, password: 'another-password-value' }),
      redirect: 'manual',
    });
    expect(await reused.text()).toContain('This reset link is no longer valid.');

    const oldLogin = new CookieJar();
    const oldForm = await interactionForm(oldLogin);
    const oldResult = await submitForm(oldLogin, oldForm.loginAction, oldForm.url, {
      email: 'reset@example.com',
      password,
    });
    expect(oldResult.text).toContain('The email or password is incorrect.');
    const signedIn = await signIn(new CookieJar(), 'reset@example.com', 'a-new-password-value');
    expect(signedIn.email).toBe('reset@example.com');
  });

  it('stores only a password hash on the identity provider', async () => {
    const columns = await running.database.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'password'`,
    );
    expect(columns).toHaveLength(0);
    const hashes = await running.database.query<{ password_hash: string }>(
      `SELECT password_hash FROM identity_accounts WHERE email = $1`,
      ['admin@example.com'],
    );
    expect(hashes[0]?.password_hash.startsWith('$2')).toBe(true);
    expect(hashes[0]?.password_hash).not.toBe(password);
  });
});

function organizationBody(name: string, inviteEmail?: string) {
  return {
    name,
    contactEmail: 'contact@example.com',
    country: 'US',
    timezone: 'America/Chicago',
    locale: 'en-US',
    primaryColor: '#0e6b62',
    invites: inviteEmail ? [{ email: inviteEmail, role: 'therapist' }] : [],
  };
}

async function register(jar: CookieJar, profile: { email: string; name: string; password: string }): Promise<AuthUser> {
  const form = await interactionForm(jar);
  const submitted = await submitForm(jar, form.registerAction, form.url, profile);
  expect(submitted.response.status, submitted.text).toBe(200);
  return JSON.parse(submitted.text) as AuthUser;
}

async function signIn(jar: CookieJar, email: string, passphrase: string): Promise<AuthUser> {
  const form = await interactionForm(jar);
  const submitted = await submitForm(jar, form.loginAction, form.url, { email, password: passphrase });
  expect(submitted.response.status, submitted.text).toBe(200);
  return JSON.parse(submitted.text) as AuthUser;
}

async function interactionForm(jar: CookieJar): Promise<{ url: string; loginAction: string; registerAction: string }> {
  const response = await follow(jar, `${base}/api/v1/auth/login?returnTo=${encodeURIComponent('/api/v1/auth/me')}`);
  const text = await response.text();
  const actions = [...text.matchAll(/action="([^"]+)"/g)].map((match) => match[1] ?? '');
  const loginAction = actions.find((action) => action.endsWith('/login'));
  const registerAction = actions.find((action) => action.endsWith('/register'));
  if (!loginAction || !registerAction) {
    throw new Error(`Sign-in form was not returned: ${response.status} ${text.slice(0, 500)}`);
  }
  return { url: response.url, loginAction, registerAction };
}

async function submitForm(
  jar: CookieJar,
  action: string,
  currentUrl: string,
  fields: Record<string, string>,
): Promise<{ response: Response; text: string }> {
  const response = await follow(jar, new URL(action, currentUrl).toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
  return { response, text: await response.text() };
}

async function requestReset(email: string): Promise<string> {
  const response = await fetch(`${running.config.oidcIssuer}/identity/reset`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email }),
    redirect: 'manual',
  });
  return response.text();
}

async function api(jar: CookieJar, path: string, init: RequestInit = {}): Promise<{ response: Response; body: unknown; text: string }> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const response = await follow(jar, `${base}${path}`, { ...init, headers });
  const text = await response.text();
  return { response, text, body: text ? JSON.parse(text) : null };
}

async function follow(jar: CookieJar, url: string, init: RequestInit = {}, remaining = 12): Promise<Response> {
  let current = url;
  let method = init.method ?? 'GET';
  let body = init.body;
  let response: Response | null = null;
  for (let attempt = 0; attempt < remaining; attempt += 1) {
    response = await fetch(current, {
      ...init,
      method,
      body,
      headers: withCookie(jar, current, init.headers),
      redirect: 'manual',
    });
    jar.store(current, response);
    if (response.status < 300 || response.status >= 400) {
      return response;
    }
    const location = response.headers.get('location');
    if (!location) {
      return response;
    }
    current = new URL(location, current).toString();
    method = 'GET';
    body = undefined;
    init = { ...init, body: undefined };
  }
  throw new Error(`Too many redirects from ${url}`);
}

function withCookie(jar: CookieJar, url: string, headers: HeadersInit | undefined): Headers {
  const next = new Headers(headers);
  const cookie = jar.header(url);
  if (cookie) {
    next.set('cookie', cookie);
  }
  return next;
}

class CookieJar {
  private readonly cookies = new Map<string, Map<string, string>>();

  store(url: string, response: Response): void {
    const host = new URL(url).host;
    const jar = this.cookies.get(host) ?? new Map<string, string>();
    const lines = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    for (const line of lines) {
      const [pair] = line.split(';');
      const separator = pair?.indexOf('=') ?? -1;
      if (!pair || separator === -1) continue;
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      if (!value || /max-age=0/i.test(line)) {
        jar.delete(name);
      } else {
        jar.set(name, value);
      }
    }
    this.cookies.set(host, jar);
  }

  header(url: string): string {
    const jar = this.cookies.get(new URL(url).host);
    if (!jar) return '';
    return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}
