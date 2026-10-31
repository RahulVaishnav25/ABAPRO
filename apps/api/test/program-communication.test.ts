import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthUser, ProgramCommunication, ProgramDetail, ProgramNoteVersion } from '@abapro/shared';
import { createApplication, type RunningApplication } from '../src/create-application';

const password = 'correct-horse-battery';
let running: RunningApplication;
let base = '';
let dataDir = '';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(64, 1)]);

describe.sequential('program notes, attachments and home activities', () => {
  const admin = new CookieJar();
  const therapist = new CookieJar();
  const colleague = new CookieJar();
  const unassigned = new CookieJar();
  const supervisor = new CookieJar();
  const reviewer = new CookieJar();
  const parent = new CookieJar();
  const otherParent = new CookieJar();
  const outsider = new CookieJar();
  let clientId = '';
  let otherClientId = '';
  let programId = '';
  let noteId = '';
  let activityId = '';
  let pdfId = '';

  const comms = (jar: CookieJar, id = programId) => api(jar, `/api/v1/programs/${id}/communication`);
  const post = (jar: CookieJar, path: string, body: unknown, method = 'POST') =>
    api(jar, `/api/v1/programs/${programId}/${path}`, { method, body: JSON.stringify(body) });
  const file = (name: string, type: string, content: Buffer, extra: Record<string, unknown> = {}) =>
    ({ fileName: name, contentType: type, contentBase64: content.toString('base64'), ...extra });

  beforeAll(async () => {
    const apiPort = await freePort();
    const oidcPort = await freePort();
    dataDir = await mkdtemp(join(tmpdir(), 'abapro-comms-'));
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

    await register(admin, { email: 'comms-admin@example.com', name: 'Ada Admin', password });
    await running.database.query(`UPDATE users SET platform_admin = true WHERE email = $1`, ['comms-admin@example.com']);
    const created = await api(admin, '/api/v1/organizations', { method: 'POST', body: JSON.stringify(organizationBody('Comms Center')) });
    const organizationId = (created.body as AuthUser).organization?.id ?? '';
    await api(admin, '/api/v1/auth/switch-organization', { method: 'POST', body: JSON.stringify({ organizationId }) });
    const people: Array<[CookieJar, string, string, string]> = [
      [therapist, 'comms-therapist@example.com', 'Tia Therapist', 'therapist'],
      [colleague, 'comms-colleague@example.com', 'Cal Colleague', 'therapist'],
      [unassigned, 'comms-unassigned@example.com', 'Una Unassigned', 'therapist'],
      [supervisor, 'comms-supervisor@example.com', 'Sam Supervisor', 'clinical_supervisor'],
      [reviewer, 'comms-reviewer@example.com', 'Rae Reviewer', 'reviewer'],
      [parent, 'comms-parent@example.com', 'Pat Parent', 'parent'],
      [otherParent, 'comms-other-parent@example.com', 'Olly Otherparent', 'parent'],
    ];
    const ids = new Map<CookieJar, string>();
    for (const [jar, email, name, role] of people) ids.set(jar, (await inviteAndAccept(admin, jar, email, name, role)).id);

    clientId = ((await api(admin, '/api/v1/clients', { method: 'POST', body: JSON.stringify({ displayName: 'Kai Child', clientCode: 'KC-1' }) })).body as { id: string }).id;
    otherClientId = ((await api(admin, '/api/v1/clients', { method: 'POST', body: JSON.stringify({ displayName: 'Lee Child', clientCode: 'LC-2' }) })).body as { id: string }).id;
    const assign = async (client: string, jar: CookieJar, relationship: string) => {
      const result = await api(admin, `/api/v1/clients/${client}/assignments`, { method: 'POST', body: JSON.stringify({ userId: ids.get(jar), relationship }) });
      expect(result.response.status, result.text).toBeLessThan(300);
    };
    await assign(clientId, therapist, 'therapist');
    await assign(clientId, colleague, 'therapist');
    await assign(clientId, supervisor, 'supervisor');
    await assign(clientId, parent, 'guardian');
    await assign(otherClientId, otherParent, 'guardian');
    programId = ((await api(admin, '/api/v1/programs', { method: 'POST', body: JSON.stringify({ clientId, title: 'Morning routine' }) })).body as ProgramDetail).id;

    await register(outsider, { email: 'comms-outsider@example.com', name: 'Out Sider', password });
    await running.database.query(`UPDATE users SET platform_admin = true WHERE email = $1`, ['comms-outsider@example.com']);
    await api(outsider, '/api/v1/organizations', { method: 'POST', body: JSON.stringify(organizationBody('Elsewhere Center')) });
  }, 180_000);

  afterAll(async () => {
    await running?.close();
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  });

  it('lets an assigned therapist write notes, stores only safe formatting, and keeps every version', async () => {
    const added = await post(therapist, 'notes', {
      title: '  First session at home  ',
      bodyHtml: '<p onclick="steal()">Kai <strong>requested</strong> juice.</p><script>alert(1)</script><div>Next line</div><img src=x onerror=alert(1)><a href="javascript:x">link</a>',
      noteDate: '2026-10-30',
    });
    expect(added.response.status, added.text).toBe(201);
    const note = (added.body as ProgramCommunication).notes[0];
    expect(note).toMatchObject({ title: 'First session at home', noteDate: '2026-10-30', authorName: 'Tia Therapist', authorRole: 'therapist', version: 1, canEdit: true });
    expect(note?.bodyHtml).toBe('<p>Kai <strong>requested</strong> juice.</p><p>Next line</p>link');
    noteId = note?.id ?? '';

    expect((await post(therapist, 'notes', { title: 'Empty', bodyHtml: '<p>&nbsp; </p><script>x</script>', noteDate: '2026-10-30' })).response.status).toBe(400);
    expect((await post(unassigned, 'notes', { title: 'No', bodyHtml: 'Hello', noteDate: '2026-10-30' })).response.status).toBe(403);
    expect((await comms(unassigned)).response.status).toBe(403);

    // Another therapist on the client can read it but not edit it; a supervisor (a program editor) can.
    const colleagueView = (await comms(colleague)).body as ProgramCommunication;
    expect(colleagueView.notes[0]?.canEdit).toBe(false);
    expect((await post(colleague, `notes/${noteId}`, { title: 'Changed', bodyHtml: 'x', noteDate: '2026-10-30' }, 'PATCH')).response.status).toBe(403);
    const edited = await post(therapist, `notes/${noteId}`, { title: 'First session at home', bodyHtml: '<p>Kai requested juice twice.</p>', noteDate: '2026-10-31' }, 'PATCH');
    expect(edited.response.status, edited.text).toBe(200);
    const bySupervisor = await post(supervisor, `notes/${noteId}`, { title: 'First home session', bodyHtml: '<p>Kai requested juice twice.</p>', noteDate: '2026-10-31' }, 'PATCH');
    expect((bySupervisor.body as ProgramCommunication).notes[0]).toMatchObject({ version: 3, updatedByName: 'Sam Supervisor', authorName: 'Tia Therapist' });

    const history = (await api(admin, `/api/v1/programs/${programId}/notes/${noteId}/history`)).body as ProgramNoteVersion[];
    expect(history.map((version) => [version.version, version.editedByName, version.editorRole])).toEqual([
      [3, 'Sam Supervisor', 'clinical_supervisor'],
      [2, 'Tia Therapist', 'therapist'],
      [1, 'Tia Therapist', 'therapist'],
    ]);
    expect(history[2]?.noteDate).toBe('2026-10-30');
  });

  it('keeps home activities with their status', async () => {
    const created = await post(therapist, 'activities', {
      title: 'Snack-time requests',
      instructions: 'Hold the snack up and wait five seconds for a request.',
      purpose: 'Kai asks for items with words.',
      frequency: 'Daily, 5 minutes',
      guidance: 'Praise any attempt.',
    });
    expect(created.response.status, created.text).toBe(201);
    const activity = (created.body as ProgramCommunication).activities[0];
    expect(activity).toMatchObject({ status: 'active', completedAt: null, createdByName: 'Tia Therapist', frequency: 'Daily, 5 minutes' });
    activityId = activity?.id ?? '';
    expect((await post(therapist, 'activities', { title: ' ', instructions: 'x' })).response.status).toBe(400);

    const done = await post(therapist, `activities/${activityId}`, { ...activity, status: 'completed' }, 'PATCH');
    expect((done.body as ProgramCommunication).activities[0]?.status).toBe('completed');
    expect((done.body as ProgramCommunication).activities[0]?.completedAt).not.toBeNull();
  });

  it('checks attachments by type, signature, size and the Upload documents permission', async () => {
    // Therapists cannot upload by default.
    expect((await post(therapist, 'attachments', file('plan.pdf', 'application/pdf', PDF))).response.status).toBe(403);

    const pdf = await post(admin, 'attachments', file('../../plan.pdf', 'application/pdf', PDF));
    expect(pdf.response.status, pdf.text).toBe(201);
    const saved = (pdf.body as ProgramCommunication).attachments[0];
    expect(saved).toMatchObject({ fileName: 'plan.pdf', kind: 'document', uploadedByName: 'Ada Admin', homeActivityId: null });
    pdfId = saved?.id ?? '';

    const audio = await post(admin, 'attachments', file('voice-note.webm', 'audio/webm;codecs=opus', WEBM));
    expect((audio.body as ProgramCommunication).attachments.find((item) => item.fileName === 'voice-note.webm')).toMatchObject({ kind: 'audio', contentType: 'audio/webm' });

    const forActivity = await post(admin, 'attachments', file('snack-cards.pdf', 'application/pdf', PDF, { homeActivityId: activityId }));
    const body = forActivity.body as ProgramCommunication;
    expect(body.activities[0]?.attachments.map((item) => item.fileName)).toEqual(['snack-cards.pdf']);
    expect(body.attachments.map((item) => item.fileName)).not.toContain('snack-cards.pdf');

    expect((await post(admin, 'attachments', file('fake.pdf', 'application/pdf', Buffer.from('MZ not a pdf')))).response.status).toBe(400);
    expect((await post(admin, 'attachments', file('tool.exe', 'application/x-msdownload', Buffer.from('MZ')))).response.status).toBe(400);
    expect((await post(admin, 'attachments', file('big.pdf', 'application/pdf', Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)])))).response.status).toBe(400);

    // A file uploaded through the earlier program upload still appears.
    const legacy = await api(admin, `/api/v1/programs/${programId}/documents`, { method: 'POST', body: JSON.stringify(file('older.pdf', 'application/pdf', PDF)) });
    expect(legacy.response.status, legacy.text).toBe(201);
    expect(((await comms(admin)).body as ProgramCommunication).attachments.map((item) => item.fileName)).toContain('older.pdf');

    const download = await api(therapist, `/api/v1/programs/${programId}/attachments/${pdfId}`);
    expect(download.response.status).toBe(200);
    expect(download.response.headers.get('content-disposition')).toContain('attachment');
    expect(download.text.startsWith('%PDF-')).toBe(true);
  });

  it('shows parents everything on their own child only, read-only', async () => {
    const view = await comms(parent);
    expect(view.response.status, view.text).toBe(200);
    const body = view.body as ProgramCommunication;
    expect(body).toMatchObject({ canWrite: false, canUpload: false, clientName: 'Kai Child' });
    expect(body.notes).toHaveLength(1);
    expect(body.notes[0]?.canEdit).toBe(false);
    expect(body.activities[0]?.attachments).toHaveLength(1);
    expect(body.attachments.length).toBeGreaterThanOrEqual(3);
    const all = await api(parent, `/api/v1/clients/${clientId}/program-communication`);
    expect((all.body as ProgramCommunication[]).map((item) => item.programTitle)).toEqual(['Morning routine']);
    expect((await api(parent, `/api/v1/programs/${programId}/attachments/${pdfId}`)).response.status).toBe(200);

    expect((await api(parent, `/api/v1/programs/${programId}/notes/${noteId}/history`)).response.status).toBe(403);
    expect((await post(parent, 'notes', { title: 'Mine', bodyHtml: 'x', noteDate: '2026-10-30' })).response.status).toBe(403);
    expect((await post(parent, 'activities', { title: 'Mine', instructions: 'x' })).response.status).toBe(403);
    expect((await post(parent, 'attachments', file('a.pdf', 'application/pdf', PDF))).response.status).toBe(403);

    for (const path of [
      `/api/v1/programs/${programId}/communication`,
      `/api/v1/clients/${clientId}/program-communication`,
      `/api/v1/programs/${programId}/attachments/${pdfId}`,
    ]) {
      expect((await api(otherParent, path)).response.status, path).toBe(403);
    }
    expect((await api(otherParent, `/api/v1/clients/${otherClientId}/program-communication`)).body).toEqual([]);
  });

  it('lets reviewers read without writing, and keeps other organisations out', async () => {
    expect((await comms(reviewer)).response.status).toBe(200);
    expect(((await comms(reviewer)).body as ProgramCommunication).canWrite).toBe(false);
    expect((await post(reviewer, 'notes', { title: 'No', bodyHtml: 'x', noteDate: '2026-10-30' })).response.status).toBe(403);
    expect((await post(reviewer, `activities/${activityId}`, { title: 'No', instructions: 'x' }, 'PATCH')).response.status).toBe(403);

    for (const path of [`/api/v1/programs/${programId}/communication`, `/api/v1/programs/${programId}/attachments/${pdfId}`]) {
      expect((await api(outsider, path)).response.status).toBe(404);
    }
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
