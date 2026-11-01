import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthProviderInfo, AuthUser, EffectivePreferences, RegionalSettings } from '@abapro/shared';
import { createApplication, type RunningApplication } from '../src/create-application';

const password = 'correct-horse-battery';
let running: RunningApplication;
let base = '';
let dataDir = '';

describe.sequential('language and regional preferences', () => {
  const admin = new CookieJar();
  const orgAdmin = new CookieJar();
  const therapist = new CookieJar();
  type Mine = { user: RegionalSettings; effective: EffectivePreferences };

  beforeAll(async () => {
    const apiPort = await freePort();
    const oidcPort = await freePort();
    dataDir = await mkdtemp(join(tmpdir(), 'abapro-prefs-'));
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

    await register(admin, { email: 'prefs-admin@example.com', name: 'Pat Platform', password });
    await running.database.query(`UPDATE users SET platform_admin = true WHERE email = $1`, ['prefs-admin@example.com']);
    const created = await api(admin, '/api/v1/organizations', {
      method: 'POST',
      body: JSON.stringify({ ...organizationBody('Regional Center'), locale: 'en-GB', timezone: 'Europe/London' }),
    });
    const organizationId = (created.body as AuthUser).organization?.id ?? '';
    await api(admin, '/api/v1/auth/switch-organization', { method: 'POST', body: JSON.stringify({ organizationId }) });
    await inviteAndAccept(admin, orgAdmin, 'prefs-orgadmin@example.com', 'Ola Admin', 'organization_admin');
    await inviteAndAccept(admin, therapist, 'prefs-therapist@example.com', 'Tia Therapist', 'therapist');
  }, 120_000);

  afterAll(async () => {
    await running?.close();
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  });

  it('applies platform defaults under organisation settings', async () => {
    const saved = await api(admin, '/api/v1/platform/regional', { method: 'PUT', body: JSON.stringify({ locale: 'fr', timezone: 'Europe/Paris', dateFormat: 'yyyy-mm-dd' }) });
    expect(saved.response.status, saved.text).toBe(200);
    const config = (await api(new CookieJar(), '/api/v1/auth/config')).body as AuthProviderInfo;
    expect(config.defaultLanguage).toBe('fr');

    const mine = (await api(therapist, '/api/v1/me/preferences')).body as Mine;
    expect(mine.effective).toMatchObject({ language: 'en', locale: 'en-GB', timezone: 'Europe/London', dateFormat: 'yyyy-mm-dd', currency: 'USD' });
    expect(mine.effective.sources).toMatchObject({ locale: 'organization', timezone: 'organization', dateFormat: 'platform', currency: 'default' });
  });

  it('lets organisation administrators change their organisation only', async () => {
    const saved = await api(orgAdmin, '/api/v1/organization/regional', { method: 'PUT', body: JSON.stringify({ currency: 'GBP', timeFormat: '24h', timezone: 'Europe/Dublin' }) });
    expect(saved.response.status, saved.text).toBe(200);
    expect(saved.body).toMatchObject({ locale: 'en-GB', timezone: 'Europe/Dublin', currency: 'GBP', timeFormat: '24h' });
    expect((await api(therapist, '/api/v1/organization/regional', { method: 'PUT', body: JSON.stringify({ currency: 'EUR' }) })).response.status).toBe(403);
    expect((await api(orgAdmin, '/api/v1/platform/regional', { method: 'PUT', body: JSON.stringify({ locale: 'es' }) })).response.status).toBe(403);
    expect((await api(orgAdmin, '/api/v1/organization/regional', { method: 'PUT', body: JSON.stringify({ timezone: 'Mars/Olympus' }) })).response.status).toBe(400);
    const me = (await api(therapist, '/api/v1/auth/me')).body as AuthUser;
    expect(me.preferences).toMatchObject({ timezone: 'Europe/Dublin', currency: 'GBP', timeFormat: '24h' });
  });

  it("puts the user's own choices first, including right-to-left languages", async () => {
    const arabic = await api(therapist, '/api/v1/me/preferences', { method: 'PUT', body: JSON.stringify({ locale: 'ar', timeFormat: '12h' }) });
    expect(arabic.response.status, arabic.text).toBe(200);
    expect((arabic.body as Mine).effective).toMatchObject({ language: 'ar', dir: 'rtl', locale: 'ar', timeFormat: '12h', timezone: 'Europe/Dublin' });
    expect(((await api(therapist, '/api/v1/auth/me')).body as AuthUser).preferences).toMatchObject({ language: 'ar', dir: 'rtl' });
    // Other users are unaffected.
    expect(((await api(orgAdmin, '/api/v1/auth/me')).body as AuthUser).preferences).toMatchObject({ language: 'en', dir: 'ltr' });

    const english = (await api(therapist, '/api/v1/me/preferences', { method: 'PUT', body: JSON.stringify({ locale: 'en' }) })).body as Mine;
    expect(english.effective).toMatchObject({ language: 'en', locale: 'en-GB', timeFormat: '24h' });
    expect((await api(therapist, '/api/v1/me/preferences', { method: 'PUT', body: JSON.stringify({ timezone: 'Nowhere/City' }) })).response.status).toBe(400);
  });
});
async function inviteAndAccept(inviter: CookieJar, invitee: CookieJar, email: string, name: string, role: string): Promise<AuthUser> {
  const invitation = await api(inviter, '/api/v1/organization/invitations', { method: 'POST', body: JSON.stringify({ email, role }) });
  expect(invitation.response.status).toBe(201);
  const mailbox = await running.database.query<{ body: string }>(
    `SELECT body FROM identity_outbound_messages WHERE recipient = $1 ORDER BY created_at DESC LIMIT 1`,
    [email],
  );
  const token = mailbox[0]?.body.match(/token=([A-Za-z0-9_-]+)/)?.[1] ?? '';
  await register(invitee, { email, name, password });
  const accepted = await api(invitee, '/api/v1/invitations/accept', { method: 'POST', body: JSON.stringify({ token }) });
  expect(accepted.response.status).toBe(201);
  return accepted.body as AuthUser;
}

function organizationBody(name: string) {
  return { name, contactEmail: 'contact@example.com', country: 'US', timezone: 'America/Chicago', locale: 'en-US', primaryColor: '#0e6b62', invites: [] };
}

async function register(jar: CookieJar, profile: { email: string; name: string; password: string }): Promise<void> {
  const form = await interactionForm(jar);
  const submitted = await submitForm(jar, form.registerAction, form.url, profile);
  expect(submitted.response.status, submitted.text).toBe(200);
}

async function interactionForm(jar: CookieJar): Promise<{ url: string; registerAction: string }> {
  const response = await follow(jar, `${base}/api/v1/auth/login?returnTo=${encodeURIComponent('/api/v1/auth/me')}`);
  const text = await response.text();
  const actions = [...text.matchAll(/action="([^"]+)"/g)].map((match) => match[1] ?? '');
  const registerAction = actions.find((action) => action.endsWith('/register'));
  if (!registerAction) throw new Error(`Sign-in form was not returned: ${response.status} ${text.slice(0, 300)}`);
  return { url: response.url, registerAction };
}

async function submitForm(jar: CookieJar, action: string, currentUrl: string, fields: Record<string, string>): Promise<{ response: Response; text: string }> {
  const response = await follow(jar, new URL(action, currentUrl).toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
  return { response, text: await response.text() };
}

async function api(jar: CookieJar, path: string, init: RequestInit = {}): Promise<{ response: Response; body: unknown; text: string }> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await follow(jar, `${base}${path}`, { ...init, headers });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, text, body };
}

async function follow(jar: CookieJar, url: string, init: RequestInit = {}, remaining = 12): Promise<Response> {
  let current = url;
  let method = init.method ?? 'GET';
  let body = init.body;
  let response: Response | null = null;
  for (let attempt = 0; attempt < remaining; attempt += 1) {
    response = await fetch(current, { ...init, method, body, headers: withCookie(jar, current, init.headers), redirect: 'manual' });
    jar.store(current, response);
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get('location');
    if (!location) return response;
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
  if (cookie) next.set('cookie', cookie);
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
      if (!value || /max-age=0/i.test(line)) jar.delete(name);
      else jar.set(name, value);
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
