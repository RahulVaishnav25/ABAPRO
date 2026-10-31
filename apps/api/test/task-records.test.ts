import { mkdtemp, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthUser, ProgramDetail, SessionHistory, TaskRecordHistory, TaskRecordingStatus } from '@abapro/shared';
import { createApplication, type RunningApplication } from '../src/create-application';

const password = 'correct-horse-battery';
const noPrompts = { independent: 0, full_prompt: 0, partial_prompt: 0, gesture_prompt: 0, model_prompt: 0, positional: 0 };
let running: RunningApplication;
let base = '';
let dataDir = '';

describe.sequential('task records', () => {
  const admin = new CookieJar();
  const first = new CookieJar();
  const second = new CookieJar();
  const outsider = new CookieJar();
  const supervisor = new CookieJar();
  const orgAdmin = new CookieJar();
  let clientId = '';
  let programId = '';
  let sessionTask = '';
  let trialTask = '';

  const record = (jar: CookieJar, targetId: string, response: 'yes' | 'no', requestId = randomUUID()) =>
    api(jar, `/api/v1/programs/targets/${targetId}/records`, { method: 'POST', body: JSON.stringify({ requestId, response }) });
  const status = async (jar: CookieJar, targetId: string) =>
    ((await api(jar, `/api/v1/programs/records/status?clientId=${clientId}`)).body as TaskRecordingStatus[]).find((item) => item.targetId === targetId);

  beforeAll(async () => {
    const apiPort = await freePort();
    const oidcPort = await freePort();
    dataDir = await mkdtemp(join(tmpdir(), 'abapro-records-'));
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

    await register(admin, { email: 'records-admin@example.com', name: 'Records Admin', password });
    await running.database.query(`UPDATE users SET platform_admin = true WHERE email = $1`, ['records-admin@example.com']);
    const created = await api(admin, '/api/v1/organizations', { method: 'POST', body: JSON.stringify(organizationBody('Records Therapy Center')) });
    const organizationId = (created.body as AuthUser).organization?.id ?? '';
    await api(admin, '/api/v1/auth/switch-organization', { method: 'POST', body: JSON.stringify({ organizationId }) });
    const firstUser = await inviteAndAccept(admin, first, 'records-first@example.com', 'Fay First', 'therapist');
    const secondUser = await inviteAndAccept(admin, second, 'records-second@example.com', 'Sid Second', 'therapist');
    await inviteAndAccept(admin, outsider, 'records-outsider@example.com', 'Oz Outsider', 'therapist');
    const supervisorUser = await inviteAndAccept(admin, supervisor, 'records-supervisor@example.com', 'Sue Supervisor', 'clinical_supervisor');
    await inviteAndAccept(admin, orgAdmin, 'records-orgadmin@example.com', 'Ola Admin', 'organization_admin');

    const client = await api(admin, '/api/v1/clients', { method: 'POST', body: JSON.stringify({ displayName: 'Rory Records', clientCode: 'RR-100' }) });
    clientId = (client.body as { id: string }).id;
    for (const [userId, relationship] of [[firstUser.id, 'therapist'], [secondUser.id, 'therapist'], [supervisorUser.id, 'supervisor']]) {
      const assigned = await api(admin, `/api/v1/clients/${clientId}/assignments`, { method: 'POST', body: JSON.stringify({ userId, relationship }) });
      expect(assigned.response.status, assigned.text).toBeLessThan(300);
    }
    const program = await api(admin, '/api/v1/programs', {
      method: 'POST',
      body: JSON.stringify({ clientId, title: 'Requesting', domain: 'Communication', measurementType: 'trial', expectedTrialCount: 5 }),
    });
    programId = (program.body as ProgramDetail).id;
    // One trial per session, three sessions a day: three records in total.
    await api(admin, `/api/v1/programs/${programId}/targets`, {
      method: 'POST',
      body: JSON.stringify({ title: 'One a session', measurementMethod: 'trial', expectedTrialCount: 1, phase: 'intervention', masterySessions: 3, masteryProbe: 100 }),
    });
    // Two trials per session, two sessions a day: four records in total.
    const withTrials = await api(admin, `/api/v1/programs/${programId}/targets`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Two a session', measurementMethod: 'trial', expectedTrialCount: 2, phase: 'intervention', masterySessions: 2, masteryProbe: 100 }),
    });
    const targets = (withTrials.body as ProgramDetail).targets;
    sessionTask = targets.find((target) => target.title === 'One a session')?.id ?? '';
    trialTask = targets.find((target) => target.title === 'Two a session')?.id ?? '';
  }, 120_000);

  afterAll(async () => {
    await running?.close();
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  });

  it('shares the daily session limit between the assigned therapists', async () => {
    expect(await status(first, sessionTask)).toMatchObject({ trialsPerSession: 1, sessionsPerDay: 3, recordedToday: 0, remainingToday: 3, nextSession: 1, nextTrial: 1, mayRecord: true });
    expect((await record(first, sessionTask, 'yes')).response.status).toBe(201);
    expect(await status(second, sessionTask)).toMatchObject({ recordedToday: 1, remainingToday: 2, nextSession: 2 });
    expect((await record(second, sessionTask, 'no')).response.status).toBe(201);
    const last = await record(second, sessionTask, 'yes');
    expect(last.body).toMatchObject({ recordedToday: 3, remainingToday: 0, nextSession: null, nextTrial: null });
    const over = await record(first, sessionTask, 'yes');
    expect(over.response.status).toBe(409);
    expect(over.text).toContain('3 sessions of 1 trial');
  });

  it('fills each session with Desired Trials before starting the next', async () => {
    const steps: Array<[number | null, number | null, number]> = [];
    for (const jar of [first, second, first, second]) {
      const saved = (await record(jar, trialTask, 'yes')).body as TaskRecordingStatus;
      steps.push([saved.nextSession, saved.nextTrial, saved.remainingToday]);
    }
    expect(steps).toEqual([[1, 2, 3], [2, 1, 2], [2, 2, 1], [null, null, 0]]);
    expect((await record(second, trialTask, 'no')).response.status).toBe(409);
  });

  it('saves a repeated submit once and never exceeds the limit under concurrent submits', async () => {
    await running.database.query(`DELETE FROM task_records WHERE target_id = $1`, [trialTask]);
    const requestId = randomUUID();
    expect((await record(first, trialTask, 'yes', requestId)).response.status).toBe(201);
    const repeated = await record(first, trialTask, 'yes', requestId);
    expect(repeated.response.status).toBe(201);
    expect((repeated.body as TaskRecordingStatus).recordedToday).toBe(1);

    const results = await Promise.all(Array.from({ length: 8 }, (_, index) => record(index % 2 ? first : second, trialTask, 'no')));
    expect(results.filter((result) => result.response.status === 201)).toHaveLength(3);
    expect(results.every((result) => [201, 409].includes(result.response.status))).toBe(true);
    const rows = await running.database.query<{ session_number: number; trial_number: number }>(
      `SELECT session_number, trial_number FROM task_records WHERE target_id = $1 ORDER BY session_number, trial_number`,
      [trialTask],
    );
    expect(rows.map((row) => `${row.session_number}.${row.trial_number}`)).toEqual(['1.1', '1.2', '2.1', '2.2']);
  });

  it('lets only assigned therapists record, and shows every assigned user the shared history', async () => {
    expect((await record(supervisor, sessionTask, 'yes')).response.status).toBe(403);
    expect((await record(admin, sessionTask, 'yes')).response.status).toBe(403);
    expect((await record(outsider, sessionTask, 'yes')).response.status).toBe(403);
    expect((await api(outsider, `/api/v1/programs/targets/${sessionTask}/records`)).response.status).toBe(403);
    expect((await status(supervisor, sessionTask))?.mayRecord).toBe(false);

    for (const jar of [first, second, supervisor]) {
      const history = (await api(jar, `/api/v1/programs/targets/${sessionTask}/records`)).body as TaskRecordHistory;
      expect(history.status.recordedToday).toBe(3);
      expect(history.days).toEqual([{ date: history.status.date, yes: 2, no: 1, prompts: noPrompts }]);
      expect(history.records.every((item) => item.promptLevels.length === 0)).toBe(true);
      expect(history.records.map((item) => item.therapistName).sort()).toEqual(['Fay First', 'Sid Second', 'Sid Second']);
      expect(history.records[0]).toMatchObject({ clientId, targetId: sessionTask, recordDate: history.status.date });
    }
    const later = (await api(first, `/api/v1/programs/targets/${sessionTask}/records?from=2999-01-01`)).body as TaskRecordHistory;
    expect(later.days).toEqual([]);
    expect((await api(first, `/api/v1/programs/targets/${sessionTask}/records?from=yesterday`)).response.status).toBe(400);
  });

  it('records only tasks In Treatment or Maintenance, keeping earlier records', async () => {
    const added = await api(admin, `/api/v1/programs/${programId}/targets`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Status task', measurementMethod: 'trial', expectedTrialCount: 1, phase: 'intervention', masterySessions: 5, masteryProbe: 100 }),
    });
    const statusTask = (added.body as ProgramDetail).targets.find((target) => target.title === 'Status task')?.id ?? '';
    const setStatus = (value: string) => api(first, `/api/v1/programs/${programId}/targets/${statusTask}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: value, changeReason: `Moved to ${value} for the recording test.` }),
    });
    expect((await record(first, statusTask, 'yes')).response.status).toBe(201);
    const pendingRequest = randomUUID();

    for (const value of ['on_hold', 'mastered']) {
      expect((await setStatus(value)).response.status).toBe(200);
      const refused = await record(first, statusTask, 'yes', value === 'on_hold' ? pendingRequest : randomUUID());
      expect(refused.response.status).toBe(409);
      expect(refused.text).toContain('In Treatment or Maintenance');
      expect(await status(first, statusTask)).toMatchObject({ mayRecord: false, recordedToday: 1 });
      const history = (await api(first, `/api/v1/programs/targets/${statusTask}/records`)).body as TaskRecordHistory;
      expect(history.records).toHaveLength(1);
      expect(history.status.mayRecord).toBe(false);
    }

    for (const value of ['maintenance', 'in_treatment']) {
      expect((await setStatus(value)).response.status).toBe(200);
      expect((await status(first, statusTask))?.mayRecord).toBe(true);
      expect((await record(second, statusTask, 'no')).response.status).toBe(201);
    }
    // The submit refused while On Hold was not saved, so it can be sent again.
    expect((await record(first, statusTask, 'yes', pendingRequest)).response.status).toBe(201);
    expect(await status(first, statusTask)).toMatchObject({ recordedToday: 4 });
  });

  it('records prompt levels instead of Yes or No when the task uses prompts', async () => {
    const added = await api(admin, `/api/v1/programs/${programId}/targets`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Prompted task', measurementMethod: 'trial', expectedTrialCount: 1, phase: 'intervention', masterySessions: 3, masteryProbe: 100, promptUsed: true }),
    });
    const promptTask = (added.body as ProgramDetail).targets.find((target) => target.title === 'Prompted task')?.id ?? '';
    const send = (jar: CookieJar, body: Record<string, unknown>) =>
      api(jar, `/api/v1/programs/targets/${promptTask}/records`, { method: 'POST', body: JSON.stringify({ requestId: randomUUID(), ...body }) });

    expect(await status(first, promptTask)).toMatchObject({ promptUsed: true, mayRecord: true });
    expect((await send(first, { response: 'yes' })).response.status).toBe(400);
    expect((await send(first, { promptLevels: [] })).response.status).toBe(400);
    expect((await send(first, { response: 'yes', promptLevels: ['independent'] })).response.status).toBe(400);
    expect((await send(first, { promptLevels: ['shouted'] })).response.status).toBe(400);
    expect((await send(first, { promptLevels: ['model_prompt', 'gesture_prompt'] })).response.status).toBe(201);
    expect((await send(second, { promptLevels: ['independent'] })).response.status).toBe(201);
    // Limits still apply, and refused attempts above did not use any.
    expect(await status(first, promptTask)).toMatchObject({ recordedToday: 2, remainingToday: 1 });
    expect((await send(second, { promptLevels: ['full_prompt', 'partial_prompt', 'positional'] })).response.status).toBe(201);
    expect((await send(first, { promptLevels: ['independent'] })).response.status).toBe(409);

    const history = (await api(second, `/api/v1/programs/targets/${promptTask}/records`)).body as TaskRecordHistory;
    expect(history.records.map((item) => item.promptLevels)).toEqual([
      ['full_prompt', 'partial_prompt', 'positional'],
      ['independent'],
      ['gesture_prompt', 'model_prompt'],
    ]);
    expect(history.records.every((item) => item.response === null)).toBe(true);
    expect(history.days).toEqual([{
      date: history.status.date,
      yes: 0,
      no: 0,
      prompts: { independent: 1, full_prompt: 1, partial_prompt: 1, gesture_prompt: 1, model_prompt: 1, positional: 1 },
    }]);

    // A task without Prompt Used refuses prompt levels.
    const plain = await api(first, `/api/v1/programs/targets/${sessionTask}/records`, {
      method: 'POST',
      body: JSON.stringify({ requestId: randomUUID(), promptLevels: ['independent'] }),
    });
    expect(plain.response.status).toBe(400);
  });

  it('shows administrators a read-only session history of the program', async () => {
    const history = (jar: CookieJar, query = '') => api(jar, `/api/v1/programs/${programId}/session-history${query}`);
    for (const jar of [first, second, supervisor, outsider]) {
      expect((await history(jar)).response.status).toBe(403);
    }

    for (const jar of [orgAdmin, admin]) {
      const all = await history(jar);
      expect(all.response.status, all.text).toBe(200);
      const body = all.body as SessionHistory;
      const rows = await running.database.query<{ count: number | string }>(`SELECT count(*) FROM task_records WHERE program_id = $1`, [programId]);
      expect(body.total).toBe(Number(rows[0]?.count));
      expect(body.entries).toHaveLength(body.total);
      const times = body.entries.map((entry) => entry.recordedAt);
      expect([...times].sort().reverse()).toEqual(times);
      expect(body.entries[0]).toMatchObject({ clientName: 'Rory Records', phase: 'treatment' });
      expect(body.therapists.map((item) => item.name)).toEqual(['Fay First', 'Sid Second']);
      expect(body.totals.reduce((sum, item) => sum + item.trials, 0)).toBe(body.total);
    }

    // Statuses are saved with each record: Status task was recorded while In Treatment and while Maintenance.
    const statusTask = ((await history(orgAdmin)).body as SessionHistory).tasks.find((task) => task.title === 'Status task')?.id ?? '';
    const forTask = (await history(orgAdmin, `?taskId=${statusTask}`)).body as SessionHistory;
    expect(forTask.entries.every((entry) => entry.taskId === statusTask)).toBe(true);
    expect(new Set(forTask.entries.map((entry) => entry.taskStatus))).toEqual(new Set(['in_treatment', 'maintenance']));
    expect(forTask.totals.map((item) => [item.therapistName, item.trials])).toEqual([['Fay First', 2], ['Sid Second', 2]]);

    const prompted = ((await history(orgAdmin, '?phase=treatment')).body as SessionHistory).entries.find((entry) => entry.promptLevels.length > 0);
    expect(prompted?.response).toBeNull();
    const firstOnly = (await history(orgAdmin, `?therapistId=${forTask.therapists.find((item) => item.name === 'Fay First')?.id}`)).body as SessionHistory;
    expect(firstOnly.entries.every((entry) => entry.therapistName === 'Fay First')).toBe(true);
    expect(((await history(orgAdmin, '?phase=baseline')).body as SessionHistory).total).toBe(0);
    expect(((await history(orgAdmin, '?from=2999-01-01')).body as SessionHistory).total).toBe(0);
    expect(((await history(orgAdmin, '?to=2000-01-01')).body as SessionHistory).total).toBe(0);
    expect((await history(orgAdmin, '?phase=sometimes')).response.status).toBe(400);
    expect((await history(orgAdmin, '?from=soon')).response.status).toBe(400);

    // Nothing can change or remove a record.
    const recordId = forTask.entries[0]?.id ?? '';
    for (const method of ['PATCH', 'PUT', 'DELETE']) {
      const attempt = await api(orgAdmin, `/api/v1/programs/targets/${statusTask}/records/${recordId}`, { method, body: JSON.stringify({ response: 'no' }) });
      expect(attempt.response.status).toBe(404);
    }
    expect(((await history(orgAdmin, `?taskId=${statusTask}`)).body as SessionHistory).total).toBe(forTask.total);
  });

  it('starts a new day with the full limit', async () => {
    await running.database.query(`UPDATE task_records SET record_date = record_date - 1 WHERE target_id = $1`, [sessionTask]);
    expect(await status(first, sessionTask)).toMatchObject({ recordedToday: 0, remainingToday: 3 });
    const history = (await api(first, `/api/v1/programs/targets/${sessionTask}/records`)).body as TaskRecordHistory;
    expect(history.days).toHaveLength(1);
    expect(history.days[0]?.date).not.toBe(history.status.date);
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
