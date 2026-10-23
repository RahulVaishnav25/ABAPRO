import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PERMISSIONS, type AuthUser } from '@abapro/shared';
import { createApplication, type RunningApplication } from '../src/create-application';

const password = 'correct-horse-battery';
let running: RunningApplication;
let base = '';
let dataDir = '';

describe.sequential('role and resource access', () => {
  const admin = new CookieJar();
  const therapist = new CookieJar();
  const parent = new CookieJar();
  const reviewer = new CookieJar();
  const support = new CookieJar();
  let organizationId = '';
  let otherOrganizationId = '';
  let clientA = '';
  let clientB = '';
  let observationId = '';
  let documentId = '';
  let therapistUser: AuthUser;
  let parentUser: AuthUser;
  let supportUser: AuthUser;

  beforeAll(async () => {
    const apiPort = await freePort();
    const oidcPort = await freePort();
    dataDir = await mkdtemp(join(tmpdir(), 'abapro-access-'));
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

  it('creates two organizations and clinical records in the first', async () => {
    const adminUser = await register(admin, { email: 'access-admin@example.com', name: 'Access Admin', password });
    await running.database.query(`UPDATE users SET platform_admin = true WHERE id = $1`, [adminUser.id]);
    const created = await api(admin, '/api/v1/organizations', {
      method: 'POST',
      body: JSON.stringify(organizationBody('Access Therapy Center')),
    });
    expect(created.response.status).toBe(201);
    organizationId = (created.body as AuthUser).organization?.id ?? '';
    const second = await api(admin, '/api/v1/organizations', {
      method: 'POST',
      body: JSON.stringify(organizationBody('Other Therapy Center')),
    });
    otherOrganizationId = (second.body as AuthUser).organization?.id ?? '';
    await api(admin, '/api/v1/auth/switch-organization', {
      method: 'POST',
      body: JSON.stringify({ organizationId }),
    });
    expect(adminUser.email).toBe('access-admin@example.com');

    const first = await api(admin, '/api/v1/clients', {
      method: 'POST',
      body: JSON.stringify({ displayName: 'Sample Client A' }),
    });
    const next = await api(admin, '/api/v1/clients', {
      method: 'POST',
      body: JSON.stringify({ displayName: 'Sample Client B' }),
    });
    expect(first.response.status).toBe(201);
    clientA = (first.body as { id: string }).id;
    clientB = (next.body as { id: string }).id;
    const observation = await api(admin, `/api/v1/clients/${clientA}/observations`, {
      method: 'POST',
      body: JSON.stringify({ note: 'Baseline note' }),
    });
    observationId = (observation.body as { id: string }).id;
    const document = await api(admin, `/api/v1/clients/${clientA}/documents`, {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'shared.pdf',
        contentType: 'application/pdf',
        contentBase64: Buffer.from('shared-document').toString('base64'),
      }),
    });
    expect(document.response.status).toBe(201);
    documentId = (document.body as { id: string }).id;
  });

  it('hides clinical rows unless the request sets the organization scope', async () => {
    const hidden = await running.database.transaction(async (tx) => {
      await tx.query('SET LOCAL ROLE abapro_app');
      return tx.query('SELECT id FROM clients');
    });
    expect(hidden).toHaveLength(0);
    const visible = await running.database.withTenant(organizationId, (tx) => tx.query('SELECT id FROM clients'));
    expect(visible).toHaveLength(2);
    await expect(
      running.database.transaction(async (tx) => {
        await tx.query('SET LOCAL ROLE abapro_app');
        await tx.query(
          `INSERT INTO clients (organization_id, display_name, created_by)
           SELECT $1, 'Blocked Client', id FROM users LIMIT 1`,
          [organizationId],
        );
      }),
    ).rejects.toThrow();
  });

  it('limits a therapist to assigned clients and blocks clinical amendments', async () => {
    therapistUser = await inviteAndAccept(admin, therapist, 'access-therapist@example.com', 'Taylor Therapist', 'therapist');
    await api(admin, `/api/v1/clients/${clientA}/assignments`, {
      method: 'POST',
      body: JSON.stringify({ userId: therapistUser.id, relationship: 'therapist' }),
    });
    const allowed = await api(therapist, `/api/v1/clients/${clientA}`);
    const denied = await api(therapist, `/api/v1/clients/${clientB}`);
    const amend = await api(therapist, `/api/v1/clients/${clientA}/observations/${observationId}`, {
      method: 'PATCH',
      body: JSON.stringify({ note: 'Changed by therapist' }),
    });
    expect(allowed.response.status).toBe(200);
    expect(denied.response.status).toBe(403);
    expect(amend.response.status).toBe(403);
    const listed = await api(therapist, '/api/v1/clients');
    expect((listed.body as { items: Array<{ id: string }> }).items).toEqual([
      expect.objectContaining({ id: clientA }),
    ]);
  });

  it('limits a parent to the linked client and explicitly shared records', async () => {
    parentUser = await inviteAndAccept(admin, parent, 'access-parent@example.com', 'Parker Parent', 'parent');
    await api(admin, `/api/v1/clients/${clientA}/assignments`, {
      method: 'POST',
      body: JSON.stringify({ userId: parentUser.id, relationship: 'guardian' }),
    });
    const otherClient = await api(parent, `/api/v1/clients/${clientB}`);
    const unshared = await api(parent, `/api/v1/clients/${clientA}/documents/${documentId}`);
    expect(otherClient.response.status).toBe(403);
    expect(unshared.response.status).toBe(403);
    const shared = await api(admin, `/api/v1/clients/${clientA}/shares`, {
      method: 'POST',
      body: JSON.stringify({ recordId: documentId, recordType: 'document', sharedWithUserId: parentUser.id }),
    });
    expect(shared.response.status).toBe(201);
    const download = await api(parent, `/api/v1/clients/${clientA}/documents/${documentId}`);
    expect(download.response.status).toBe(200);
    expect(download.text).toBe('shared-document');
    const sensitive = await api(parent, `/api/v1/clients/${clientA}/sensitive`);
    expect(sensitive.response.status).toBe(403);
  });

  it('stops a reviewer from modifying clinical records', async () => {
    await inviteAndAccept(admin, reviewer, 'access-reviewer@example.com', 'Riley Reviewer', 'reviewer');
    const viewed = await api(reviewer, `/api/v1/clients/${clientA}`);
    const edited = await api(reviewer, `/api/v1/clients/${clientA}`, {
      method: 'PATCH',
      body: JSON.stringify({ displayName: 'Renamed', status: 'active' }),
    });
    const amended = await api(reviewer, `/api/v1/clients/${clientA}/observations/${observationId}`, {
      method: 'PATCH',
      body: JSON.stringify({ note: 'Reviewer rewrite' }),
    });
    expect(viewed.response.status).toBe(200);
    expect(edited.response.status).toBe(403);
    expect(amended.response.status).toBe(403);
  });

  it('rejects cross-organization client access', async () => {
    await api(admin, '/api/v1/auth/switch-organization', {
      method: 'POST',
      body: JSON.stringify({ organizationId: otherOrganizationId }),
    });
    const crossed = await api(admin, `/api/v1/clients/${clientA}`);
    expect(crossed.response.status).toBe(404);
    await api(admin, '/api/v1/auth/switch-organization', {
      method: 'POST',
      body: JSON.stringify({ organizationId }),
    });
  });

  it('rejects permission escalation and grants above the platform ceiling', async () => {
    const therapistEscalation = await api(therapist, '/api/v1/team/permissions', {
      method: 'PUT',
      body: JSON.stringify({ role: 'therapist', permissions: [PERMISSIONS.settingsManage, PERMISSIONS.clientsView] }),
    });
    const ceiling = await api(admin, '/api/v1/team/permissions', {
      method: 'PUT',
      body: JSON.stringify({ role: 'therapist', permissions: [PERMISSIONS.clientsView, PERMISSIONS.settingsManage] }),
    });
    const self = await api(admin, '/api/v1/team');
    const therapistMember = (self.body as { members: Array<{ membershipId: string; email: string; role: string }> }).members.find(
      (member) => member.email === 'access-therapist@example.com',
    );
    const promote = await api(admin, `/api/v1/team/members/${therapistMember?.membershipId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role: 'platform_admin' }),
    });
    const removeAdminPowers = await api(admin, '/api/v1/team/permissions', {
      method: 'PUT',
      body: JSON.stringify({ role: 'organization_admin', permissions: [PERMISSIONS.dashboardView] }),
    });
    const after = await api(admin, '/api/v1/team');
    const therapistAfter = (after.body as { members: Array<{ email: string; role: string }> }).members.find(
      (member) => member.email === 'access-therapist@example.com',
    );
    expect(therapistEscalation.response.status).toBe(403);
    expect(ceiling.response.status).toBe(400);
    expect([400, 403]).toContain(promote.response.status);
    expect(therapistAfter?.role).toBe('therapist');
    expect(removeAdminPowers.response.status).toBe(400);
  });

  it('requires justified, client-scoped exceptional access for platform support', async () => {
    supportUser = await register(support, { email: 'access-support@example.com', name: 'Platform Support', password });
    await running.database.query(
      `INSERT INTO organization_memberships (organization_id, user_id, role) VALUES ($1, $2, 'platform_admin')`,
      [organizationId, supportUser.id],
    );
    const switched = await api(support, '/api/v1/auth/switch-organization', {
      method: 'POST',
      body: JSON.stringify({ organizationId }),
    });
    expect((switched.body as AuthUser).permissions).not.toContain(PERMISSIONS.clientsView);
    const before = await api(support, '/api/v1/clients');
    expect(before.response.status).toBe(403);
    const missingReason = await api(support, '/api/v1/access/exceptions', {
      method: 'POST',
      body: JSON.stringify({
        clientId: clientA,
        granteeUserId: supportUser.id,
        permissions: [PERMISSIONS.clientsView],
        justification: 'short',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    });
    expect(missingReason.response.status).toBe(400);
    const granted = await api(support, '/api/v1/access/exceptions', {
      method: 'POST',
      body: JSON.stringify({
        clientId: clientA,
        granteeUserId: supportUser.id,
        permissions: [PERMISSIONS.clientsView, PERMISSIONS.clientsEdit],
        justification: 'Investigating a reported access problem for this client only.',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    });
    expect(granted.response.status).toBe(400);
    const viewOnly = await api(support, '/api/v1/access/exceptions', {
      method: 'POST',
      body: JSON.stringify({
        clientId: clientA,
        granteeUserId: supportUser.id,
        permissions: [PERMISSIONS.clientsView],
        justification: 'Investigating a reported access problem for this client only.',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    });
    expect(viewOnly.response.status).toBe(201);
    const allowed = await api(support, `/api/v1/clients/${clientA}`);
    const other = await api(support, `/api/v1/clients/${clientB}`);
    const write = await api(support, `/api/v1/clients/${clientA}`, {
      method: 'PATCH',
      body: JSON.stringify({ displayName: 'Should not change', status: 'active' }),
    });
    expect(allowed.response.status).toBe(200);
    expect(other.response.status).toBe(403);
    expect(write.response.status).toBe(403);
    const orgAdminGrant = await api(admin, '/api/v1/access/exceptions', {
      method: 'POST',
      body: JSON.stringify({
        clientId: clientA,
        granteeUserId: supportUser.id,
        permissions: [PERMISSIONS.clientsView],
        justification: 'An organization administrator must not grant this.',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    });
    expect(orgAdminGrant.response.status).toBe(403);
    const audit = await api(admin, '/api/v1/audit');
    expect(audit.response.status).toBe(200);
    expect(JSON.stringify(audit.body)).toContain('access.exception_granted');
  });

  it('removes access when a membership is revoked', async () => {
    const directory = await api(admin, '/api/v1/team');
    const member = (directory.body as { members: Array<{ membershipId: string; email: string }> }).members.find(
      (item) => item.email === 'access-therapist@example.com',
    );
    const revoked = await api(admin, `/api/v1/team/members/${member?.membershipId}/revoke`, { method: 'POST' });
    expect(revoked.response.status).toBe(201);
    const after = await api(therapist, `/api/v1/clients/${clientA}`);
    expect(after.response.status).toBe(403);
  });
});

async function inviteAndAccept(
  inviter: CookieJar,
  invitee: CookieJar,
  email: string,
  name: string,
  role: string,
): Promise<AuthUser> {
  const invitation = await api(inviter, '/api/v1/organization/invitations', {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  });
  expect(invitation.response.status).toBe(201);
  const mailbox = await running.database.query<{ body: string }>(
    `SELECT body FROM identity_outbound_messages WHERE recipient = $1 ORDER BY created_at DESC LIMIT 1`,
    [email],
  );
  const token = mailbox[0]?.body.match(/token=([A-Za-z0-9_-]+)/)?.[1] ?? '';
  await register(invitee, { email, name, password });
  const accepted = await api(invitee, '/api/v1/invitations/accept', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  expect(accepted.response.status).toBe(201);
  return accepted.body as AuthUser;
}

function organizationBody(name: string) {
  return {
    name,
    contactEmail: 'contact@example.com',
    country: 'US',
    timezone: 'America/Chicago',
    locale: 'en-US',
    primaryColor: '#0e6b62',
    invites: [],
  };
}

async function register(jar: CookieJar, profile: { email: string; name: string; password: string }): Promise<AuthUser> {
  const form = await interactionForm(jar);
  const submitted = await submitForm(jar, form.registerAction, form.url, profile);
  expect(submitted.response.status, submitted.text).toBe(200);
  return JSON.parse(submitted.text) as AuthUser;
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
