import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthUser, ClientDirectoryPage, ClientProfile, ClinicalProfile } from '@abapro/shared';
import { createApplication, type RunningApplication } from '../src/create-application';

const password = 'correct-horse-battery';
let running: RunningApplication;
let base = '';
let dataDir = '';

describe.sequential('client management', () => {
  const admin = new CookieJar();
  const therapist = new CookieJar();
  let organizationId = '';
  let otherOrganizationId = '';
  let clientId = '';
  let otherClientId = '';
  let documentId = '';

  beforeAll(async () => {
    const apiPort = await freePort();
    const oidcPort = await freePort();
    dataDir = await mkdtemp(join(tmpdir(), 'abapro-clients-'));
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

  it('creates, searches, and rejects a duplicate client identifier', async () => {
    await register(admin, { email: 'clients-admin@example.com', name: 'Clients Admin', password });
    await running.database.query(`UPDATE users SET platform_admin = true WHERE email = $1`, ['clients-admin@example.com']);
    const created = await api(admin, '/api/v1/organizations', { method: 'POST', body: JSON.stringify(organizationBody('Client Therapy Center')) });
    organizationId = (created.body as AuthUser).organization?.id ?? '';
    const second = await api(admin, '/api/v1/organizations', { method: 'POST', body: JSON.stringify(organizationBody('Other Client Center')) });
    otherOrganizationId = (second.body as AuthUser).organization?.id ?? '';
    await api(admin, '/api/v1/auth/switch-organization', { method: 'POST', body: JSON.stringify({ organizationId }) });

    const client = await api(admin, '/api/v1/clients', {
      method: 'POST',
      body: JSON.stringify({
        displayName: 'Rowan Sample',
        clientCode: 'RS-100',
        preferredName: 'Ro',
        dateOfBirth: '2018-03-14',
        language: 'English',
      }),
    });
    expect(client.response.status).toBe(201);
    clientId = (client.body as { id: string }).id;
    const duplicate = await api(admin, '/api/v1/clients', {
      method: 'POST',
      body: JSON.stringify({ displayName: 'Another Rowan', clientCode: 'rs-100' }),
    });
    expect(duplicate.response.status).toBe(409);
    const taken = await api(admin, '/api/v1/clients/code-available?code=rs-100');
    expect(taken.response.status).toBe(200);
    expect(taken.body).toEqual({ available: false });
    const free = await api(admin, '/api/v1/clients/code-available?code=NEW-1');
    expect(free.body).toEqual({ available: true });
    const own = await api(admin, `/api/v1/clients/code-available?code=RS-100&except=${clientId}`);
    expect(own.body).toEqual({ available: true });
    const placement = await api(admin, '/api/v1/clients/placement');
    expect(placement.response.status).toBe(200);
    const organisations = (placement.body as { organizations: Array<{ id: string; clinics: Array<{ id: string }> }> }).organizations;
    expect(organisations.some((item) => item.id === organizationId && item.clinics.length > 0)).toBe(true);
    const wrongClinic = await api(admin, '/api/v1/clients', {
      method: 'POST',
      body: JSON.stringify({ displayName: 'Unplaced Client', clinicId: '11111111-1111-4111-8111-111111111111' }),
    });
    expect(wrongClinic.response.status).toBe(400);

    const inactive = await api(admin, '/api/v1/clients', {
      method: 'POST',
      body: JSON.stringify({ displayName: 'Quinn Sample', clientCode: 'QS-200' }),
    });
    otherClientId = (inactive.body as { id: string }).id;
    const turnedOff = await api(admin, `/api/v1/clients/${otherClientId}`, {
      method: 'PATCH',
      body: JSON.stringify({ displayName: 'Quinn Sample', status: 'inactive' }),
    });
    expect(turnedOff.response.status).toBe(400);
    const confirmed = await api(admin, `/api/v1/clients/${otherClientId}`, {
      method: 'PATCH',
      body: JSON.stringify({ displayName: 'Quinn Sample', status: 'inactive', confirmDeactivation: true }),
    });
    expect(confirmed.response.status).toBe(200);

    const search = await api(admin, '/api/v1/clients?q=Rowan');
    const page = search.body as ClientDirectoryPage;
    expect(page.items.map((item) => item.id)).toEqual([clientId]);
    expect(page.items[0]?.dateOfBirth).toBe('2018-03-14');
    expect(page.items[0]?.organizationId).toBe(organizationId);
    expect(page.items[0]?.organizationName).toBe('Client Therapy Center');
    expect(page.items[0]).toHaveProperty('clinicName');
    const filtered = await api(admin, '/api/v1/clients?status=inactive');
    expect((filtered.body as ClientDirectoryPage).items.map((item) => item.id)).toEqual([otherClientId]);
    const paged = await api(admin, '/api/v1/clients?pageSize=1&sort=name&direction=asc');
    const firstPage = paged.body as ClientDirectoryPage;
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.total).toBe(2);
    expect(firstPage.pageSize).toBe(1);
  });

  it('stores guardians and keeps sensitive fields away from a therapist', async () => {
    const guardian = await api(admin, `/api/v1/clients/${clientId}/guardians`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Morgan Sample',
        relationship: 'parent',
        email: 'morgan.sample@example.test',
        phone: '555-0108',
        channels: ['email', 'phone'],
        emergencyContact: true,
        portalAccess: false,
      }),
    });
    expect(guardian.response.status).toBe(201);
    const profile = await api(admin, `/api/v1/clients/${clientId}`);
    expect((profile.body as ClientProfile).guardians.map((item) => item.name)).toContain('Morgan Sample');

    await api(admin, `/api/v1/clients/${clientId}/sensitive`, {
      method: 'PUT',
      body: JSON.stringify({ allergies: 'No known allergies', medicalHistory: 'No admissions recorded.' }),
    });
    const therapistUser = await inviteAndAccept(admin, therapist, 'clients-therapist@example.com', 'Casey Therapist', 'therapist');
    await api(admin, `/api/v1/clients/${clientId}/assignments`, {
      method: 'POST',
      body: JSON.stringify({ userId: therapistUser.id, relationship: 'therapist' }),
    });
    const hidden = await api(therapist, `/api/v1/clients/${clientId}/sensitive`);
    expect(hidden.response.status).toBe(403);
    const viewed = await api(therapist, `/api/v1/clients/${clientId}`);
    expect(viewed.response.status).toBe(200);
    expect(viewed.body).not.toHaveProperty('dateOfBirth');
    expect(viewed.body).not.toHaveProperty('medicalHistory');
    const listed = await api(therapist, '/api/v1/clients');
    expect((listed.body as ClientDirectoryPage).items[0]).not.toHaveProperty('dateOfBirth');
    const clinical = await api(admin, `/api/v1/clients/${clientId}/sensitive`);
    expect((clinical.body as ClinicalProfile).allergies).toBe('No known allergies');
  });

  it('authorizes documents and refuses ordinary deletion', async () => {
    const uploaded = await api(admin, `/api/v1/clients/${clientId}/documents`, {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'care.pdf',
        contentType: 'application/pdf',
        contentBase64: Buffer.from('synthetic-file').toString('base64'),
        category: 'care',
      }),
    });
    expect(uploaded.response.status).toBe(201);
    const rejectedType = await api(admin, `/api/v1/clients/${clientId}/documents`, {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'notes.txt',
        contentType: 'text/plain',
        contentBase64: Buffer.from('not-allowed').toString('base64'),
      }),
    });
    expect(rejectedType.response.status).toBe(400);
    documentId = (uploaded.body as { id: string }).id;
    const download = await api(therapist, `/api/v1/clients/${clientId}/documents/${documentId}`);
    expect(download.response.status).toBe(200);
    expect(download.text).toBe('synthetic-file');
    const deniedUpload = await api(therapist, `/api/v1/clients/${clientId}/documents`, {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'note.pdf',
        contentType: 'application/pdf',
        contentBase64: Buffer.from('nope').toString('base64'),
      }),
    });
    expect(deniedUpload.response.status).toBe(403);
    const otherFile = await api(therapist, `/api/v1/clients/${otherClientId}/documents/${documentId}`);
    expect(otherFile.response.status).toBe(403);
    const removed = await api(admin, `/api/v1/clients/${clientId}`, { method: 'DELETE' });
    expect(removed.response.status).toBe(409);
    const stillThere = await api(admin, `/api/v1/clients/${clientId}`);
    expect(stillThere.response.status).toBe(200);
  });

  it('hides clients from another organization and keeps ended assignments', async () => {
    await api(admin, '/api/v1/auth/switch-organization', { method: 'POST', body: JSON.stringify({ organizationId: otherOrganizationId }) });
    const crossed = await api(admin, `/api/v1/clients/${clientId}`);
    expect(crossed.response.status).toBe(404);
    const foreignSearch = await api(admin, '/api/v1/clients?q=Rowan');
    expect((foreignSearch.body as ClientDirectoryPage).total).toBe(0);
    await api(admin, '/api/v1/auth/switch-organization', { method: 'POST', body: JSON.stringify({ organizationId }) });

    const profile = await api(admin, `/api/v1/clients/${clientId}`);
    const assignmentId = (profile.body as ClientProfile).assignments.find((item) => item.relationship === 'therapist')?.id ?? '';
    const ended = await api(admin, `/api/v1/clients/${clientId}/assignments/${assignmentId}/end`, { method: 'POST' });
    expect(ended.response.status).toBe(201);
    const after = await api(therapist, `/api/v1/clients/${clientId}`);
    expect(after.response.status).toBe(403);
    const history = await api(admin, `/api/v1/clients/${clientId}`);
    expect((history.body as ClientProfile).assignments.some((item) => item.id === assignmentId && item.endedAt)).toBe(true);
  });

  it('adds synthetic demo records that can be filtered by program status', async () => {
    const seeded = await api(admin, '/api/v1/clients/demo', { method: 'POST' });
    expect(seeded.response.status).toBe(201);
    expect((seeded.body as { created: number }).created).toBe(3);
    const again = await api(admin, '/api/v1/clients/demo', { method: 'POST' });
    expect((again.body as { created: number }).created).toBe(0);
    const found = await api(admin, '/api/v1/clients?q=DEMO-1042');
    const rowan = (found.body as ClientDirectoryPage).items[0];
    expect(rowan?.displayName).toBe('Rowan Ellis');
    expect(rowan?.activeProgramCount).toBe(1);
    const paused = await api(admin, '/api/v1/clients?programStatus=paused');
    expect((paused.body as ClientDirectoryPage).items.map((item) => item.displayName)).toContain('Sloane Brooks');
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
