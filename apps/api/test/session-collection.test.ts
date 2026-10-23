import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthUser, CollectedObservation, SessionGraphPoint, TherapySessionDetail } from '@abapro/shared';
import { createApplication, type RunningApplication } from '../src/create-application';

const password = 'correct-horse-battery';
let running: RunningApplication;
let base = '';
let dataDir = '';

describe.sequential('session data collection', () => {
  const admin = new CookieJar();
  const therapist = new CookieJar();
  const reviewer = new CookieJar();
  let organizationId = '';
  let otherOrganizationId = '';
  let clientId = '';
  let sessionId = '';
  let trialTargetId = '';
  let probeTargetId = '';
  let frequencyTargetId = '';
  let durationTargetId = '';
  let abcTargetId = '';
  let frequencyObservationId = '';

  beforeAll(async () => {
    const apiPort = await freePort();
    const oidcPort = await freePort();
    dataDir = await mkdtemp(join(tmpdir(), 'abapro-sessions-'));
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

  it('records each measurement type, rejects invalid data, and resumes an interrupted session', async () => {
    await register(admin, { email: 'sessions-admin@example.com', name: 'Sessions Admin', password });
    await running.database.query(`UPDATE users SET platform_admin = true WHERE email = $1`, ['sessions-admin@example.com']);
    const created = await api(admin, '/api/v1/organizations', { method: 'POST', body: JSON.stringify(organizationBody('Session Therapy Center')) });
    organizationId = (created.body as AuthUser).organization?.id ?? '';
    const second = await api(admin, '/api/v1/organizations', { method: 'POST', body: JSON.stringify(organizationBody('Other Session Center')) });
    otherOrganizationId = (second.body as AuthUser).organization?.id ?? '';
    await api(admin, '/api/v1/auth/switch-organization', { method: 'POST', body: JSON.stringify({ organizationId }) });
    const client = await api(admin, '/api/v1/clients', { method: 'POST', body: JSON.stringify({ displayName: 'Session Sample', clientCode: 'SS-400' }) });
    clientId = (client.body as { id: string }).id;
    const program = await api(admin, '/api/v1/programs', {
      method: 'POST',
      body: JSON.stringify({ clientId, title: 'Session program', measurementType: 'frequency' }),
    });
    const programId = (program.body as { id: string }).id;
    trialTargetId = await addTarget(admin, programId, { title: 'Spoken request', measurementMethod: 'trial', expectedTrialCount: 2 });
    probeTargetId = await addTarget(admin, programId, { title: 'Probe request', measurementMethod: 'probe', expectedTrialCount: 2 });
    frequencyTargetId = await addTarget(admin, programId, { title: 'Request count', measurementMethod: 'frequency' });
    durationTargetId = await addTarget(admin, programId, { title: 'Request duration', measurementMethod: 'duration' });
    abcTargetId = await addTarget(admin, programId, { title: 'Request context', measurementMethod: 'abc' });
    await addTarget(admin, programId, { title: 'Unused count', measurementMethod: 'frequency' });

    const therapistUser = await inviteAndAccept(admin, therapist, 'sessions-therapist@example.com', 'Casey Therapist', 'therapist');
    await api(admin, `/api/v1/clients/${clientId}/assignments`, { method: 'POST', body: JSON.stringify({ userId: therapistUser.id, relationship: 'therapist' }) });
    await inviteAndAccept(admin, reviewer, 'sessions-reviewer@example.com', 'Riley Reviewer', 'reviewer');
    const denied = await api(reviewer, '/api/v1/sessions', { method: 'POST', body: JSON.stringify({ clientId, setting: 'Clinic' }) });
    expect(denied.response.status).toBe(403);

    const started = await api(therapist, '/api/v1/sessions', {
      method: 'POST',
      body: JSON.stringify({ clientId, setting: 'Clinic', location: 'Room 2', note: 'Morning session' }),
    });
    expect(started.response.status).toBe(201);
    sessionId = (started.body as TherapySessionDetail).id;
    expect((started.body as TherapySessionDetail).targets.map((item) => item.title)).toContain('Spoken request');

    const firstBody = {
      idempotencyKey: 'trialset0001',
      targetId: trialTargetId,
      trials: [{ idempotencyKey: 'trialkey0001', trialNumber: 1, result: 'correct' }],
    };
    const first = await api(therapist, `/api/v1/sessions/${sessionId}/observations`, { method: 'POST', body: JSON.stringify(firstBody) });
    expect(first.response.status).toBe(200);
    const draft = first.body as CollectedObservation;
    expect(draft.status).toBe('draft');
    expect(draft.measurementMethod).toBe('trial');
    const replay = await api(therapist, `/api/v1/sessions/${sessionId}/observations`, { method: 'POST', body: JSON.stringify(firstBody) });
    expect((replay.body as CollectedObservation).id).toBe(draft.id);
    const conflict = await api(therapist, `/api/v1/sessions/${sessionId}/observations`, {
      method: 'POST',
      body: JSON.stringify({ ...firstBody, trials: [{ idempotencyKey: 'trialkey0001', trialNumber: 1, result: 'incorrect' }] }),
    });
    expect(conflict.response.status).toBe(409);
    const tooSoon = await api(therapist, `/api/v1/sessions/${sessionId}/complete`, { method: 'POST', body: JSON.stringify({}) });
    expect(tooSoon.response.status).toBe(400);

    const trialTwo = await api(therapist, `/api/v1/sessions/${sessionId}/observations/${draft.id}/trials`, {
      method: 'POST',
      body: JSON.stringify({ idempotencyKey: 'trialkey0002', trialNumber: 2, result: 'prompted', promptLevel: 'model' }),
    });
    expect((trialTwo.body as CollectedObservation).status).toBe('recorded');
    const duplicateTrial = await api(therapist, `/api/v1/sessions/${sessionId}/observations/${draft.id}/trials`, {
      method: 'POST',
      body: JSON.stringify({ idempotencyKey: 'trialkey0002', trialNumber: 2, result: 'prompted', promptLevel: 'model' }),
    });
    expect((duplicateTrial.body as CollectedObservation).trials.filter((trial) => !trial.voidedAt)).toHaveLength(2);
    const trialId = (trialTwo.body as CollectedObservation).trials.find((trial) => trial.trialNumber === 2)?.id ?? '';
    const shortUndo = await api(therapist, `/api/v1/sessions/${sessionId}/observations/${draft.id}/trials/${trialId}/undo`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'too short' }),
    });
    expect(shortUndo.response.status).toBe(400);
    const undone = await api(therapist, `/api/v1/sessions/${sessionId}/observations/${draft.id}/trials/${trialId}/undo`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'The prompted result was tapped by mistake.' }),
    });
    expect((undone.body as CollectedObservation).status).toBe('draft');
    const restored = await api(therapist, `/api/v1/sessions/${sessionId}/observations/${draft.id}/trials`, {
      method: 'POST',
      body: JSON.stringify({ idempotencyKey: 'trialkey0003', trialNumber: 2, result: 'correct' }),
    });
    expect((restored.body as CollectedObservation).status).toBe('recorded');

    const probe = await api(therapist, `/api/v1/sessions/${sessionId}/observations`, {
      method: 'POST',
      body: JSON.stringify({
        idempotencyKey: 'probeset0001',
        targetId: probeTargetId,
        trials: [
          { idempotencyKey: 'probekey0001', trialNumber: 1, result: 'incorrect' },
          { idempotencyKey: 'probekey0002', trialNumber: 2, result: 'correct' },
        ],
      }),
    });
    expect((probe.body as CollectedObservation).measurementMethod).toBe('probe');
    expect((probe.body as CollectedObservation).status).toBe('recorded');

    const badWindow = await api(therapist, `/api/v1/sessions/${sessionId}/observations`, {
      method: 'POST',
      body: JSON.stringify({
        idempotencyKey: 'freqbad00001',
        targetId: frequencyTargetId,
        frequencyCount: 2,
        windowStartedAt: '2026-10-19T15:01:00.000Z',
        windowEndedAt: '2026-10-19T15:00:00.000Z',
      }),
    });
    expect(badWindow.response.status).toBe(400);
    const frequency = await api(therapist, `/api/v1/sessions/${sessionId}/observations`, {
      method: 'POST',
      body: JSON.stringify({
        idempotencyKey: 'freqset00001',
        targetId: frequencyTargetId,
        frequencyCount: 2,
        windowStartedAt: '2026-10-19T15:00:00.000Z',
        windowEndedAt: '2026-10-19T15:01:00.000Z',
      }),
    });
    expect(frequency.response.status).toBe(200);
    frequencyObservationId = (frequency.body as CollectedObservation).id;
    expect((frequency.body as CollectedObservation).ratePerMinute).toBe(2);

    const badDuration = await api(therapist, `/api/v1/sessions/${sessionId}/observations`, {
      method: 'POST',
      body: JSON.stringify({
        idempotencyKey: 'durbad000001',
        targetId: durationTargetId,
        startedAt: '2026-10-19T15:00:05.000Z',
        endedAt: '2026-10-19T15:00:00.000Z',
      }),
    });
    expect(badDuration.response.status).toBe(400);
    const before = await api(therapist, `/api/v1/sessions/${sessionId}`);
    const duration = await api(therapist, `/api/v1/sessions/${sessionId}/observations`, {
      method: 'POST',
      body: JSON.stringify({
        idempotencyKey: 'durset000001',
        targetId: durationTargetId,
        startedAt: '2026-10-19T15:00:00.000Z',
        endedAt: '2026-10-19T15:00:05.000Z',
      }),
    });
    expect((duration.body as CollectedObservation).durationSeconds).toBe(5);
    expect((duration.body as CollectedObservation).durationUnit).toBe('seconds');

    const badAbc = await api(therapist, `/api/v1/sessions/${sessionId}/observations`, {
      method: 'POST',
      body: JSON.stringify({ idempotencyKey: 'abcbad000001', targetId: abcTargetId, antecedent: 'Item visible' }),
    });
    expect(badAbc.response.status).toBe(400);
    const abc = await api(therapist, `/api/v1/sessions/${sessionId}/observations`, {
      method: 'POST',
      body: JSON.stringify({
        idempotencyKey: 'abcset000001',
        targetId: abcTargetId,
        antecedent: 'The item was visible.',
        behaviorNote: 'The learner reached toward the item.',
        consequence: 'The item was handed over.',
        occurredAt: '2026-10-19T15:02:00.000Z',
        contextNote: 'Play area',
      }),
    });
    expect(abc.response.status).toBe(200);
    expect(abc.body).not.toHaveProperty('function');

    const refreshed = await api(therapist, `/api/v1/sessions/${sessionId}`);
    const detail = refreshed.body as TherapySessionDetail;
    expect(detail.observations.filter((item) => item.status === 'recorded').length).toBe((before.body as TherapySessionDetail).observations.filter((item) => item.status === 'recorded').length + 2);
    expect(detail.summary.canComplete).toBe(true);
    const interrupted = await api(therapist, `/api/v1/sessions/${sessionId}/interrupt`, { method: 'POST', body: JSON.stringify({}) });
    expect((interrupted.body as TherapySessionDetail).interruptedAt).toBeTruthy();
    const resumed = await api(therapist, `/api/v1/sessions/${sessionId}/resume`, { method: 'POST', body: JSON.stringify({}) });
    expect((resumed.body as TherapySessionDetail).interruptedAt).toBeNull();
    const completed = await api(therapist, `/api/v1/sessions/${sessionId}/complete`, { method: 'POST', body: JSON.stringify({ note: 'Morning session finished.' }) });
    expect((completed.body as TherapySessionDetail).status).toBe('completed');
    expect((completed.body as TherapySessionDetail).summary.recordedTargetCount).toBe(5);
  });

  it('keeps correction history and hides the session from another organization', async () => {
    const therapistAmend = await api(therapist, `/api/v1/sessions/${sessionId}/observations/${frequencyObservationId}/amend`, {
      method: 'POST',
      body: JSON.stringify({
        idempotencyKey: 'amend0000001',
        targetId: frequencyTargetId,
        frequencyCount: 4,
        windowStartedAt: '2026-10-19T15:00:00.000Z',
        windowEndedAt: '2026-10-19T15:01:00.000Z',
        reason: 'The count was corrected after the session.',
      }),
    });
    expect(therapistAmend.response.status).toBe(403);
    const amended = await api(admin, `/api/v1/sessions/${sessionId}/observations/${frequencyObservationId}/amend`, {
      method: 'POST',
      body: JSON.stringify({
        idempotencyKey: 'amend0000001',
        targetId: frequencyTargetId,
        frequencyCount: 4,
        windowStartedAt: '2026-10-19T15:00:00.000Z',
        windowEndedAt: '2026-10-19T15:01:00.000Z',
        reason: 'The count was corrected after the session.',
      }),
    });
    expect(amended.response.status).toBe(200);
    expect((amended.body as CollectedObservation).frequencyCount).toBe(4);
    const history = await api(admin, `/api/v1/sessions/${sessionId}/observations/${frequencyObservationId}/history`);
    expect((history.body as CollectedObservation[]).map((item) => item.status).sort()).toEqual(['amended', 'recorded']);
    const graph = await api(admin, `/api/v1/sessions/graph?clientId=${clientId}`);
    const points = graph.body as SessionGraphPoint[];
    expect(points.some((point) => point.measurementMethod === 'probe')).toBe(true);
    expect(points.some((point) => point.measurementMethod === 'trial' && point.percentCorrect === 100)).toBe(true);
    expect(points.find((point) => point.measurementMethod === 'frequency')?.frequencyCount).toBe(4);

    await api(admin, '/api/v1/auth/switch-organization', { method: 'POST', body: JSON.stringify({ organizationId: otherOrganizationId }) });
    const foreign = await api(admin, `/api/v1/sessions/${sessionId}`);
    expect(foreign.response.status).toBe(404);
  });
});

async function addTarget(jar: CookieJar, programId: string, body: Record<string, unknown>): Promise<string> {
  const created = await api(jar, `/api/v1/programs/${programId}/targets`, { method: 'POST', body: JSON.stringify(body) });
  expect(created.response.status, created.text).toBe(201);
  const targets = (created.body as { targets: Array<{ id: string; title: string }> }).targets;
  return targets.find((item) => item.title === body.title)?.id ?? '';
}

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
