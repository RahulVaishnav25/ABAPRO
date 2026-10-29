import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthUser, OrganizationBranding, PlatformBranding, SignInAccount } from '@abapro/shared';
import { createApplication, type RunningApplication } from '../src/create-application';

const password = 'correct-horse-battery';
let running: RunningApplication;
let base = '';
let dataDir = '';

describe.sequential('Branding and Super Admin Management', () => {
  const superAdminJar = new CookieJar();
  const regularJar = new CookieJar();
  let superAdminUser: AuthUser;
  let regularUser: AuthUser;
  let organizationId = '';

  beforeAll(async () => {
    const apiPort = await freePort();
    const oidcPort = await freePort();
    dataDir = await mkdtemp(join(tmpdir(), 'abapro-branding-'));
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
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  });

  it('allows unauthenticated users to read default platform branding', async () => {
    const res = await fetch(`${base}/api/v1/branding/platform`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as PlatformBranding;
    expect(data.portalName).toBe('ABAPro');
    expect(data.primaryColor).toBe('#0e6b62');
    expect(data.secondaryColor).toBe('#18794e');
    expect(data.loginHeadline).toBe('Better care starts with clarity.');
  });

  it('sets up super admin and regular organisation admin users', async () => {
    await register(superAdminJar, {
      name: 'Primary Super Admin',
      email: 'primary-super@example.com',
      password,
    });
    const meRes = await api(superAdminJar, '/api/v1/auth/me');
    expect(meRes.response.status).toBe(200);
    superAdminUser = meRes.body as AuthUser;
    await running.database.query(`UPDATE users SET platform_admin = true WHERE id = $1`, [superAdminUser.id]);

    // Create organisation
    const createdOrg = await api(superAdminJar, '/api/v1/organizations', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Branding Care',
        contactEmail: 'clinic@example.com',
        country: 'US',
        timezone: 'America/New_York',
        locale: 'en-US',
        primaryColor: '#0e6b62',
        invites: [],
      }),
    });
    expect(createdOrg.response.status).toBe(201);
    organizationId = (createdOrg.body as AuthUser).organization?.id ?? '';

    // Register a regular user and add to organisation
    await register(regularJar, {
      name: 'Clinic Supervisor',
      email: 'clinic-supervisor@example.com',
      password,
    });
    const regularMe = await api(regularJar, '/api/v1/auth/me');
    expect(regularMe.response.status).toBe(200);
    regularUser = regularMe.body as AuthUser;

    await running.database.query(
      `INSERT INTO organization_memberships (organization_id, user_id, role) VALUES ($1, $2, 'clinical_supervisor')`,
      [organizationId, regularUser.id],
    );
  });

  it('allows super admin to create additional super admin accounts', async () => {
    const created = await api(superAdminJar, '/api/v1/auth/accounts', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Secondary Super Admin',
        email: 'secondary-super@example.com',
        password: 'another-super-password-123',
        platformAdmin: true,
      }),
    });
    expect(created.response.status).toBe(201);
    const account = created.body as SignInAccount;
    expect(account.email).toBe('secondary-super@example.com');
    expect(account.platformAdmin).toBe(true);

    // Verify it appears in accounts list
    const list = await api(superAdminJar, '/api/v1/auth/accounts');
    expect(list.response.status).toBe(200);
    const accounts = list.body as SignInAccount[];
    expect(accounts.some((a) => a.email === 'secondary-super@example.com' && a.platformAdmin)).toBe(true);
  });

  it('rejects regular user from updating platform branding', async () => {
    const updateRes = await api(regularJar, '/api/v1/branding/platform', {
      method: 'PUT',
      body: JSON.stringify({
        portalName: 'Hacked Portal',
        primaryColor: '#ff0000',
        secondaryColor: '#00ff00',
        loginHeadline: 'Hacked',
        loginSubtitle: 'Hacked',
      }),
    });
    expect(updateRes.response.status).toBe(403);
  });

  it('allows super admin to update and reset platform branding in Firestore', async () => {
    const updateRes = await api(superAdminJar, '/api/v1/branding/platform', {
      method: 'PUT',
      body: JSON.stringify({
        portalName: 'Apex Therapy Systems',
        logoUrl: 'https://example.com/logo.png',
        faviconUrl: 'https://example.com/favicon.ico',
        primaryColor: '#2563eb',
        secondaryColor: '#10b981',
        loginHeadline: 'Next-Gen Care Management',
        loginSubtitle: 'Unified clinical insights for therapy providers.',
      }),
    });
    expect(updateRes.response.status).toBe(200);
    const updated = updateRes.body as PlatformBranding;
    expect(updated.portalName).toBe('Apex Therapy Systems');
    expect(updated.primaryColor).toBe('#2563eb');
    expect(updated.secondaryColor).toBe('#10b981');
    expect(updated.loginHeadline).toBe('Next-Gen Care Management');

    // Public endpoint should now return updated branding
    const publicRes = await fetch(`${base}/api/v1/branding/platform`);
    const publicData = (await publicRes.json()) as PlatformBranding;
    expect(publicData.portalName).toBe('Apex Therapy Systems');

    // Super Admin resets platform branding
    const resetRes = await api(superAdminJar, '/api/v1/branding/platform/reset', {
      method: 'POST',
    });
    expect(resetRes.response.status).toBe(200);
    const resetData = resetRes.body as PlatformBranding;
    expect(resetData.portalName).toBe('ABAPro');
  });

  it('manages organisation branding with proper authorization', async () => {
    // Non-admin role cannot update organisation branding
    const forbiddenRes = await api(regularJar, `/api/v1/branding/organization/${organizationId}`, {
      method: 'PUT',
      body: JSON.stringify({
        portalName: 'Custom Org Portal',
        primaryColor: '#7c3aed',
        secondaryColor: '#db2777',
      }),
    });
    expect(forbiddenRes.response.status).toBe(403);

    // Promote regular user to organisation_admin
    await running.database.query(
      `UPDATE organization_memberships SET role = 'organization_admin' WHERE organization_id = $1 AND user_id = $2`,
      [organizationId, regularUser.id],
    );

    // Switch regular user session to organization context
    const switchRes = await api(regularJar, '/api/v1/auth/switch-organization', {
      method: 'POST',
      body: JSON.stringify({ organizationId }),
    });
    expect([200, 201]).toContain(switchRes.response.status);

    // Now organisation admin can update organisation branding
    const updateOrgRes = await api(regularJar, `/api/v1/branding/organization/${organizationId}`, {
      method: 'PUT',
      body: JSON.stringify({
        portalName: 'Branding Care Clinic Portal',
        logoUrl: 'https://example.com/clinic-logo.png',
        faviconUrl: 'https://example.com/clinic-favicon.ico',
        primaryColor: '#7c3aed',
        secondaryColor: '#db2777',
      }),
    });
    expect(updateOrgRes.response.status).toBe(200);
    const orgBranding = updateOrgRes.body as OrganizationBranding;
    expect(orgBranding.portalName).toBe('Branding Care Clinic Portal');
    expect(orgBranding.primaryColor).toBe('#7c3aed');

    // Fetch organisation branding
    const getOrgRes = await api(regularJar, `/api/v1/branding/organization/${organizationId}`);
    expect(getOrgRes.response.status).toBe(200);
    expect((getOrgRes.body as OrganizationBranding).portalName).toBe('Branding Care Clinic Portal');

    // Reset organisation branding
    const resetOrgRes = await api(regularJar, `/api/v1/branding/organization/${organizationId}/reset`, {
      method: 'POST',
    });
    expect(resetOrgRes.response.status).toBe(200);
  });
});

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

async function api(
  jar: CookieJar,
  path: string,
  init: RequestInit = {},
): Promise<{ response: Response; body: unknown; text: string }> {
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
    response = await fetch(current, {
      ...init,
      method,
      body,
      headers: withCookie(jar, current, init.headers),
      redirect: 'manual',
    });
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
