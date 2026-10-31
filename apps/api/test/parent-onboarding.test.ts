import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PARENT_ACCESS_PENDING_MESSAGE, type AuthUser, type ParentAccountSummary, type ProgramDetail } from '@abapro/shared';
import { createApplication, type RunningApplication } from '../src/create-application';

const password = 'correct-horse-battery';
const parentPassword = 'ParentAccess!2026';
let running: RunningApplication;
let base = '';
let dataDir = '';

describe.sequential('parent onboarding and linked-client sign-in', () => {
  const admin = new CookieJar();
  const supervisor = new CookieJar();
  const therapist = new CookieJar();
  const outsider = new CookieJar();
  let organizationId = '';
  let clientA = '';
  let clientB = '';
  let foreignClient = '';
  let programId = '';
  let pendingParent: ParentAccountSummary;

  const signIn = async (jar: CookieJar, email: string) =>
    api(jar, '/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password: parentPassword }) });
  const setLinks = (jar: CookieJar, userId: string, clientIds: string[]) =>
    api(jar, `/api/v1/parents/${userId}/clients`, { method: 'PUT', body: JSON.stringify({ clientIds }) });

  beforeAll(async () => {
    const apiPort = await freePort();
    const oidcPort = await freePort();
    dataDir = await mkdtemp(join(tmpdir(), 'abapro-parents-'));
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

    await register(admin, { email: 'parents-admin@example.com', name: 'Ada Admin', password });
    await running.database.query(`UPDATE users SET platform_admin = true WHERE email = $1`, ['parents-admin@example.com']);
    organizationId = ((await api(admin, '/api/v1/organizations', { method: 'POST', body: JSON.stringify(organizationBody('Parent Center')) })).body as AuthUser).organization?.id ?? '';
    await api(admin, '/api/v1/auth/switch-organization', { method: 'POST', body: JSON.stringify({ organizationId }) });
    await inviteAndAccept(admin, supervisor, 'parents-supervisor@example.com', 'Sam Supervisor', 'clinical_supervisor');
    const therapistUser = await inviteAndAccept(admin, therapist, 'parents-therapist@example.com', 'Tia Therapist', 'therapist');
    const newClient = async (name: string, code: string) =>
      ((await api(admin, '/api/v1/clients', { method: 'POST', body: JSON.stringify({ displayName: name, clientCode: code }) })).body as { id: string }).id;
    clientA = await newClient('Ava Child', 'AC-1');
    clientB = await newClient('Ben Child', 'BC-2');
    await api(admin, `/api/v1/clients/${clientA}/assignments`, { method: 'POST', body: JSON.stringify({ userId: therapistUser.id, relationship: 'therapist' }) });
    programId = ((await api(admin, '/api/v1/programs', { method: 'POST', body: JSON.stringify({ clientId: clientA, title: 'Requesting' }) })).body as ProgramDetail).id;

    await register(outsider, { email: 'parents-outsider@example.com', name: 'Out Sider', password });
    await running.database.query(`UPDATE users SET platform_admin = true WHERE email = $1`, ['parents-outsider@example.com']);
    await api(outsider, '/api/v1/organizations', { method: 'POST', body: JSON.stringify(organizationBody('Elsewhere Center')) });
    foreignClient = ((await api(outsider, '/api/v1/clients', { method: 'POST', body: JSON.stringify({ displayName: 'Far Child', clientCode: 'FC-9' }) })).body as { id: string }).id;
  }, 180_000);

  afterAll(async () => {
    await running?.close();
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  });

  it('onboards a parent without clients as pending, and refuses their sign-in', async () => {
    const created = await api(admin, '/api/v1/parents', {
      method: 'POST',
      body: JSON.stringify({ name: 'Pia Parent', email: 'pia@example.com', password: parentPassword }),
    });
    expect(created.response.status, created.text).toBe(201);
    pendingParent = created.body as ParentAccountSummary;
    expect(pendingParent).toMatchObject({ name: 'Pia Parent', email: 'pia@example.com', portalStatus: 'pending', linkedClients: [] });

    const refused = await signIn(new CookieJar(), 'pia@example.com');
    expect(refused.response.status).toBe(403);
    expect((refused.body as { message: string }).message).toBe(PARENT_ACCESS_PENDING_MESSAGE);
    expect(refused.response.headers.get('set-cookie') ?? '').not.toContain('abapro_session=');
  });

  it('activates the parent once a client is linked, and links the same records as the client profile', async () => {
    const linked = await setLinks(admin, pendingParent.userId, [clientA]);
    expect(linked.response.status, linked.text).toBe(200);
    expect(linked.body).toMatchObject({ portalStatus: 'active', linkedClients: [{ id: clientA, displayName: 'Ava Child', clientCode: 'AC-1' }] });
    const records = await running.database.query<{ portal_access: boolean; relationship: string }>(
      `SELECT portal_access, relationship FROM client_guardians WHERE client_id = $1 AND linked_user_id = $2 AND ended_at IS NULL`,
      [clientA, pendingParent.userId],
    );
    expect(records).toEqual([{ portal_access: true, relationship: 'parent' }]);

    const parent = new CookieJar();
    const accepted = await signIn(parent, 'pia@example.com');
    expect(accepted.response.status, accepted.text).toBe(200);
    expect(accepted.body).toMatchObject({ role: 'parent', parentAccessPending: false });
    expect((await api(parent, `/api/v1/programs/${programId}/communication`)).response.status).toBe(200);

    // Removing the last link ends the session on the next request and blocks sign-in again.
    expect((await setLinks(admin, pendingParent.userId, [])).body).toMatchObject({ portalStatus: 'pending', linkedClients: [] });
    const ended = await api(parent, '/api/v1/auth/me');
    expect(ended.response.status).toBe(401);
    expect((ended.body as { message: string }).message).toBe(PARENT_ACCESS_PENDING_MESSAGE);
    expect((await api(parent, '/api/v1/auth/me')).response.status).toBe(401);
    expect((await signIn(new CookieJar(), 'pia@example.com')).response.status).toBe(403);
    // The guardian contact is kept, without portal access.
    const kept = await running.database.query<{ portal_access: boolean }>(
      `SELECT portal_access FROM client_guardians WHERE client_id = $1 AND linked_user_id = $2 AND ended_at IS NULL`,
      [clientA, pendingParent.userId],
    );
    expect(kept).toEqual([{ portal_access: false }]);

    // Linking again reuses that record.
    await setLinks(admin, pendingParent.userId, [clientA]);
    expect((await running.database.query(`SELECT 1 FROM client_guardians WHERE client_id = $1 AND linked_user_id = $2`, [clientA, pendingParent.userId])).length).toBe(1);
    expect((await signIn(new CookieJar(), 'pia@example.com')).response.status).toBe(200);
  });

  it('links one parent to several clients and one client to several parents', async () => {
    const created = await api(admin, '/api/v1/parents', {
      method: 'POST',
      body: JSON.stringify({ name: 'Paz Parent', email: 'paz@example.com', password: parentPassword, clientIds: [clientA, clientB, clientA] }),
    });
    expect(created.response.status, created.text).toBe(201);
    expect((created.body as ParentAccountSummary).linkedClients.map((client) => client.clientCode)).toEqual(['AC-1', 'BC-2']);
    expect((created.body as ParentAccountSummary).portalStatus).toBe('active');

    const list = (await api(admin, '/api/v1/parents')).body as ParentAccountSummary[];
    expect(list.map((parent) => [parent.name, parent.portalStatus, parent.linkedClients.length])).toEqual([
      ['Paz Parent', 'active', 2],
      ['Pia Parent', 'active', 1],
    ]);
    const parentsOfA = list.filter((parent) => parent.linkedClients.some((client) => client.id === clientA));
    expect(parentsOfA).toHaveLength(2);
  });

  it('activates a parent linked through the client profile too', async () => {
    const created = (await api(admin, '/api/v1/parents', {
      method: 'POST',
      body: JSON.stringify({ name: 'Pol Parent', email: 'pol@example.com', password: parentPassword }),
    })).body as ParentAccountSummary;
    expect((await signIn(new CookieJar(), 'pol@example.com')).response.status).toBe(403);
    const viaProfile = await api(admin, `/api/v1/clients/${clientB}/guardians`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Pol Parent', relationship: 'parent', channels: ['portal'], emergencyContact: false, portalAccess: true, linkedUserId: created.userId }),
    });
    expect(viaProfile.response.status, viaProfile.text).toBe(201);
    expect((await signIn(new CookieJar(), 'pol@example.com')).response.status).toBe(200);
    expect(((await api(admin, `/api/v1/parents/${created.userId}`)).body as ParentAccountSummary).portalStatus).toBe('active');
  });

  it('keeps permissions and organisations apart', async () => {
    // Supervisors manage links but cannot create accounts; therapists do neither.
    expect((await api(supervisor, '/api/v1/parents')).response.status).toBe(200);
    expect((await api(supervisor, '/api/v1/parents', {
      method: 'POST',
      body: JSON.stringify({ name: 'Sup Made', email: 'supmade@example.com', password: parentPassword }),
    })).response.status).toBe(403);
    expect((await api(therapist, '/api/v1/parents')).response.status).toBe(403);
    expect((await setLinks(therapist, pendingParent.userId, [clientB])).response.status).toBe(403);

    // Another organisation's client cannot be linked, and no account is left behind.
    const foreign = await api(admin, '/api/v1/parents', {
      method: 'POST',
      body: JSON.stringify({ name: 'Far Parent', email: 'far@example.com', password: parentPassword, clientIds: [foreignClient] }),
    });
    expect(foreign.response.status).toBe(404);
    expect((await running.database.query(`SELECT 1 FROM users WHERE email = 'far@example.com'`)).length).toBe(0);
    expect((await setLinks(admin, pendingParent.userId, [foreignClient])).response.status).toBe(404);

    expect((await api(outsider, '/api/v1/parents')).body).toEqual([]);
    expect((await api(outsider, `/api/v1/parents/${pendingParent.userId}`)).response.status).toBe(404);
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
