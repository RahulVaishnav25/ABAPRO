import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AssessmentDetail, AuthUser, ProgramDetail, TargetListItem } from '@abapro/shared';
import { createApplication, type RunningApplication } from '../src/create-application';

const password = 'correct-horse-battery';
let running: RunningApplication;
let base = '';
let dataDir = '';

describe.sequential('program and target management', () => {
  const admin = new CookieJar();
  const therapist = new CookieJar();
  const reviewer = new CookieJar();
  let organizationId = '';
  let otherOrganizationId = '';
  let clientId = '';
  let therapistId = '';
  let assessmentId = '';
  let programId = '';
  let trialTargetId = '';
  let taskTargetId = '';

  beforeAll(async () => {
    const apiPort = await freePort();
    const oidcPort = await freePort();
    dataDir = await mkdtemp(join(tmpdir(), 'abapro-programs-'));
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

  it('creates an assessment, a program, targets, and therapist assignment', async () => {
    await register(admin, { email: 'programs-admin@example.com', name: 'Programs Admin', password });
    await running.database.query(`UPDATE users SET platform_admin = true WHERE email = $1`, ['programs-admin@example.com']);
    const created = await api(admin, '/api/v1/organizations', { method: 'POST', body: JSON.stringify(organizationBody('Program Therapy Center')) });
    organizationId = (created.body as AuthUser).organization?.id ?? '';
    const second = await api(admin, '/api/v1/organizations', { method: 'POST', body: JSON.stringify(organizationBody('Other Program Center')) });
    otherOrganizationId = (second.body as AuthUser).organization?.id ?? '';
    await api(admin, '/api/v1/auth/switch-organization', { method: 'POST', body: JSON.stringify({ organizationId }) });

    const client = await api(admin, '/api/v1/clients', { method: 'POST', body: JSON.stringify({ displayName: 'Avery Sample', clientCode: 'AS-300' }) });
    expect(client.response.status).toBe(201);
    clientId = (client.body as { id: string }).id;

    const template = await api(admin, '/api/v1/assessments/templates', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Clinic skill checklist',
        assessmentType: 'Skill checklist',
        description: 'Items written by this clinic.',
        items: [{ label: 'Requests a preferred item', responseKind: 'text', guidance: 'Describe what you observed.' }],
      }),
    });
    expect(template.response.status).toBe(201);
    const templateId = (template.body as { id: string }).id;

    const assessment = await api(admin, '/api/v1/assessments', {
      method: 'POST',
      body: JSON.stringify({
        clientId,
        templateId,
        name: 'October skill checklist',
        assessmentType: 'Skill checklist',
        assessedOn: '2026-10-01',
        reviewOn: '2026-12-01',
        summary: 'The clinician completed the clinic checklist.',
        resultsNote: 'Requests occurred with a spoken prompt.',
      }),
    });
    expect(assessment.response.status).toBe(201);
    assessmentId = (assessment.body as AssessmentDetail).id;
    expect((assessment.body as AssessmentDetail).items.map((item) => item.label)).toEqual(['Requests a preferred item']);

    const changedTemplate = await api(admin, `/api/v1/assessments/templates/${templateId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: 'Revised clinic checklist',
        assessmentType: 'Skill checklist',
        items: [{ label: 'A different clinic item', responseKind: 'text' }],
      }),
    });
    expect(changedTemplate.response.status).toBe(200);
    const unchanged = await api(admin, `/api/v1/assessments/${assessmentId}`);
    expect((unchanged.body as AssessmentDetail).items.map((item) => item.label)).toEqual(['Requests a preferred item']);

    const reviewerUser = await inviteAndAccept(admin, reviewer, 'programs-reviewer@example.com', 'Riley Reviewer', 'reviewer');
    expect(reviewerUser.role).toBe('reviewer');
    const denied = await api(reviewer, '/api/v1/assessments', {
      method: 'POST',
      body: JSON.stringify({ clientId, name: 'Reviewer assessment', assessmentType: 'Skill checklist' }),
    });
    expect(denied.response.status).toBe(403);

    const therapistUser = await inviteAndAccept(admin, therapist, 'programs-therapist@example.com', 'Casey Therapist', 'therapist');
    therapistId = therapistUser.id;
    await api(admin, `/api/v1/clients/${clientId}/assignments`, {
      method: 'POST',
      body: JSON.stringify({ userId: therapistId, relationship: 'therapist' }),
    });

    const program = await api(admin, '/api/v1/programs', {
      method: 'POST',
      body: JSON.stringify({
        clientId,
        title: 'Requesting program',
        domain: 'Communication',
        dateImplemented: '2026-10-02',
        assessmentType: 'VB-MAPP',
        sd: 'Give me the toy',
        masterySteps: 'Step 1: prompt, Step 2: independent',
        errorCorrectionProcedure: '4-step error correction',
        teachingMethod: 'DTT',
        netTeachingIdea: 'Use preferred vehicles',
        measurementProcedure: 'Probe',
        description: 'Practice requests during play.',
        objective: 'The learner requests a preferred item.',
        assessmentId,
        goalStatement: 'Request a preferred item across two settings.',
        teachingProcedure: 'Model the request, then wait.',
        reviewOn: '2026-11-02',
        measurementType: 'frequency',
        masteryCriteria: 'Recorded for the clinician. The application does not apply it.',
        notes: 'Synthetic teaching notes.',
        status: 'on_hold',
      }),
    });
    expect(program.response.status).toBe(201);
    const detail = program.body as ProgramDetail;
    programId = detail.id;
    expect(detail.domain).toBe('Communication');
    expect(detail.dateImplemented).toBe('2026-10-02');
    expect(detail.teachingProcedure).toBe('Model the request, then wait.');
    expect(detail.assessmentType).toBe('VB-MAPP');
    expect(detail.sd).toBe('Give me the toy');
    expect(detail.teachingMethod).toBe('DTT');
    expect(detail.measurementProcedure).toBe('Probe');
    expect(detail.assessmentId).toBe(assessmentId);
    expect(detail.goals[0]?.statement).toBe('Request a preferred item across two settings.');
    expect(detail.configurationVersion).toBe(1);
    expect(detail.status).toBe('in_treatment');

    const trial = await api(admin, `/api/v1/programs/${programId}/targets`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Spoken request',
        operationalDefinition: 'A spoken request for a visible item.',
        measurementMethod: 'trial',
        expectedTrialCount: 3,
        teachingInstructions: 'Present the item and wait five seconds.',
        promptHierarchy: 'Independent, gesture, model',
        masteryCriteria: 'Three correct trials are recorded for review.',
        phase: 'baseline',
      }),
    });
    expect(trial.response.status).toBe(201);
    trialTargetId = (trial.body as ProgramDetail).targets.find((item) => item.title === 'Spoken request')?.id ?? '';
    const frequency = await api(admin, `/api/v1/programs/${programId}/targets`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Request count', measurementMethod: 'frequency', phase: 'intervention' }),
    });
    expect(frequency.response.status).toBe(201);
    const withTargets = frequency.body as ProgramDetail;
    expect(withTargets.targets.every((item) => item.status === 'in_treatment')).toBe(true);
    expect(withTargets.targets).toHaveLength(2);
    expect(withTargets.targets.map((item) => item.measurementMethod)).toEqual(['trial', 'frequency']);

    const hidden = await api(therapist, `/api/v1/programs/${programId}`, { method: 'PATCH', body: JSON.stringify({ clientId, title: 'Changed by therapist', measurementType: 'frequency' }) });
    expect(hidden.response.status).toBe(403);
    const viewed = await api(therapist, `/api/v1/programs/${programId}`);
    expect(viewed.response.status).toBe(200);
    expect((viewed.body as ProgramDetail).title).toBe('Requesting program');
  });

  it("keeps an assessment's assigned clinician when it is edited", async () => {
    const supervisor = new CookieJar();
    const clinician = await inviteAndAccept(admin, supervisor, 'programs-supervisor@example.com', 'Sam Supervisor', 'clinical_supervisor');
    const created = await api(admin, '/api/v1/assessments', {
      method: 'POST',
      body: JSON.stringify({ clientId, name: 'Supervised checklist', assessmentType: 'Skill checklist', assignedClinicianId: clinician.id }),
    });
    expect(created.response.status, created.text).toBe(201);
    const detail = created.body as AssessmentDetail;
    // The detail carries the clinician's id, so an edit form can keep the assignment.
    expect(detail.assignedClinicianId).toBe(clinician.id);
    expect(detail.clinicianName).toBe('Sam Supervisor');

    const read = (await api(admin, `/api/v1/assessments/${detail.id}`)).body as AssessmentDetail;
    expect(read.assignedClinicianId).toBe(clinician.id);
    const edited = await api(admin, `/api/v1/assessments/${detail.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ clientId, name: 'Supervised checklist, revised', assessmentType: read.assessmentType, assignedClinicianId: read.assignedClinicianId ?? undefined }),
    });
    expect(edited.response.status, edited.text).toBe(200);
    expect(edited.body as AssessmentDetail).toMatchObject({ name: 'Supervised checklist, revised', assignedClinicianId: clinician.id, clinicianName: 'Sam Supervisor' });
    expect(((await api(admin, '/api/v1/assessments')).body as AssessmentDetail[]).find((item) => item.id === detail.id)?.assignedClinicianId).toBe(clinician.id);
  });

  it('versions measurement changes and requires a reason', async () => {
    const noReason = await api(admin, `/api/v1/programs/${programId}/targets/${trialTargetId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Spoken request', measurementMethod: 'frequency', status: 'in_treatment' }),
    });
    expect(noReason.response.status).toBe(400);

    const updated = await api(admin, `/api/v1/programs/${programId}/targets/${trialTargetId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: 'Spoken request',
        measurementMethod: 'frequency',
        status: 'in_treatment',
        changeReason: 'Measurement changed after the baseline probe.',
      }),
    });
    expect(updated.response.status).toBe(200);
    const target = (updated.body as ProgramDetail).targets.find((item) => item.id === trialTargetId);
    expect(target?.configurationVersion).toBe(2);
    expect(target?.phase).toBe('baseline');

    const inactive = await api(admin, `/api/v1/programs/${programId}/targets/${trialTargetId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Spoken request', measurementMethod: 'frequency', status: 'on_hold' }),
    });
    expect(inactive.response.status).toBe(400);
    const deactivated = await api(admin, `/api/v1/programs/${programId}/targets/${trialTargetId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: 'Spoken request',
        measurementMethod: 'frequency',
        status: 'on_hold',
        changeReason: 'Target paused while the teaching plan is reviewed.',
      }),
    });
    expect(deactivated.response.status).toBe(200);
    expect((deactivated.body as ProgramDetail).targets.find((item) => item.id === trialTargetId)?.status).toBe('on_hold');
  });

  it('keeps one field each for the implementation date and teaching steps', async () => {
    const program = {
      clientId,
      title: 'Requesting program',
      measurementType: 'frequency',
      masteryCriteria: 'Recorded for the clinician. The application does not apply it.',
      teachingProcedure: 'Model the request, then wait.',
    };
    const cleared = await api(admin, `/api/v1/programs/${programId}`, { method: 'PATCH', body: JSON.stringify(program) });
    expect(cleared.response.status).toBe(200);
    expect((cleared.body as ProgramDetail).dateImplemented).toBeNull();

    const stepsWithoutReason = await api(admin, `/api/v1/programs/${programId}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...program, teachingProcedure: 'Model, wait five seconds, then prompt.' }),
    });
    expect(stepsWithoutReason.response.status).toBe(400);
    const steps = await api(admin, `/api/v1/programs/${programId}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...program, teachingProcedure: 'Model, wait five seconds, then prompt.', changeReason: 'Added a wait before prompting.' }),
    });
    expect(steps.response.status).toBe(200);
    expect((steps.body as ProgramDetail).teachingProcedure).toBe('Model, wait five seconds, then prompt.');
    expect((steps.body as ProgramDetail).configurationVersion).toBe(2);
  });

  it('stores task criteria on targets and lists targets across programs', async () => {
    const created = await api(admin, `/api/v1/programs/${programId}/targets`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Echoic single words',
        measurementMethod: 'probe',
        expectedTrialCount: 4,
        phase: 'baseline',
        sd: 'Say "ball"',
        masterySessions: 3,
        masteryProbe: 80,
        baselineSessions: 2,
        baselineProbe: 70,
        promptUsed: true,
      }),
    });
    expect(created.response.status).toBe(201);
    const stored = (created.body as ProgramDetail).targets.find((item) => item.title === 'Echoic single words');
    expect(stored).toMatchObject({ sd: 'Say "ball"', masterySessions: 3, masteryProbe: 80, baselineSessions: 2, baselineProbe: 70, promptUsed: true });
    taskTargetId = stored?.id ?? '';

    const all = await api(admin, '/api/v1/programs/targets');
    expect(all.response.status).toBe(200);
    const listed = (all.body as TargetListItem[]).find((item) => item.id === taskTargetId);
    expect(listed).toMatchObject({ programId, programTitle: 'Requesting program', clientId, clientName: 'Avery Sample', masteryProbe: 80 });
    const forProgram = await api(admin, `/api/v1/programs/targets?programId=${programId}`);
    expect((forProgram.body as TargetListItem[]).map((item) => item.programId)).toEqual([programId, programId, programId]);
    const assigned = await api(therapist, '/api/v1/programs/targets');
    expect((assigned.body as TargetListItem[]).some((item) => item.id === taskTargetId)).toBe(true);

    const single = await api(admin, `/api/v1/programs/targets/${taskTargetId}`);
    expect(single.response.status).toBe(200);
    expect((single.body as TargetListItem).sd).toBe('Say "ball"');
    const malformed = await api(admin, '/api/v1/programs/targets/task-1700000000000-abcde');
    expect(malformed.response.status).toBe(404);

    const base = { title: 'Echoic single words', measurementMethod: 'probe', expectedTrialCount: 4, phase: 'baseline', status: 'in_treatment' };
    const sdOnly = await api(admin, `/api/v1/programs/${programId}/targets/${taskTargetId}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...base, sd: 'Say "car"' }),
    });
    expect(sdOnly.response.status).toBe(200);
    const kept = (sdOnly.body as ProgramDetail).targets.find((item) => item.id === taskTargetId);
    expect(kept).toMatchObject({ sd: 'Say "car"', masterySessions: 3, masteryProbe: 80, baselineSessions: 2, promptUsed: true, configurationVersion: 1 });
    const unchecked = await api(admin, `/api/v1/programs/${programId}/targets/${taskTargetId}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...base, promptUsed: false }),
    });
    expect(unchecked.response.status).toBe(200);
    expect((unchecked.body as ProgramDetail).targets.find((item) => item.id === taskTargetId)).toMatchObject({ promptUsed: false, configurationVersion: 1 });

    const noReason = await api(admin, `/api/v1/programs/${programId}/targets/${taskTargetId}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...base, masteryProbe: 90 }),
    });
    expect(noReason.response.status).toBe(400);
    const withReason = await api(admin, `/api/v1/programs/${programId}/targets/${taskTargetId}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...base, masteryProbe: 90, changeReason: 'Raised the probe criterion after review.' }),
    });
    expect(withReason.response.status).toBe(200);
    expect((withReason.body as ProgramDetail).targets.find((item) => item.id === taskTargetId)).toMatchObject({ masteryProbe: 90, configurationVersion: 2 });
  });

  it('lets an assigned therapist add tasks and change statuses but not see organisation records', async () => {
    const added = await api(therapist, `/api/v1/programs/${programId}/targets`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Therapist task', measurementMethod: 'frequency', phase: 'intervention' }),
    });
    expect(added.response.status).toBe(201);
    expect((added.body as ProgramDetail).targets.find((item) => item.title === 'Therapist task')?.status).toBe('in_treatment');

    const noReason = await api(therapist, `/api/v1/programs/${programId}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'on_hold', changeReason: '' }) });
    expect(noReason.response.status).toBe(400);
    const held = await api(therapist, `/api/v1/programs/${programId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'on_hold', changeReason: 'Family requested a short break.' }),
    });
    expect(held.response.status).toBe(200);
    expect((held.body as ProgramDetail).status).toBe('on_hold');
    const mastered = await api(therapist, `/api/v1/programs/${programId}/targets/${taskTargetId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'mastered', changeReason: 'Skill mastered across three sessions.' }),
    });
    expect(mastered.response.status).toBe(200);
    expect((mastered.body as ProgramDetail).targets.find((item) => item.id === taskTargetId)?.status).toBe('mastered');

    const reviewerChange = await api(reviewer, `/api/v1/programs/${programId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'in_treatment', changeReason: 'Reviewer should not change this.' }),
    });
    expect(reviewerChange.response.status).toBe(403);
    const reviewerTask = await api(reviewer, `/api/v1/programs/${programId}/targets`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Reviewer task', measurementMethod: 'frequency' }),
    });
    expect(reviewerTask.response.status).toBe(403);

    for (const path of ['/api/v1/clinics', '/api/v1/organizations', `/api/v1/organizations/${organizationId}`]) {
      expect((await api(therapist, path)).response.status).toBe(403);
    }
    expect((await api(admin, `/api/v1/organizations/${organizationId}`)).response.status).toBe(200);
  });

  it('isolates programs between organizations', async () => {
    await api(admin, '/api/v1/auth/switch-organization', { method: 'POST', body: JSON.stringify({ organizationId: otherOrganizationId }) });
    const foreign = await api(admin, `/api/v1/programs/${programId}`);
    expect(foreign.response.status).toBe(404);
    const foreignTarget = await api(admin, `/api/v1/programs/targets/${taskTargetId}`);
    expect(foreignTarget.response.status).toBe(404);
    const foreignList = await api(admin, '/api/v1/programs/targets');
    expect(foreignList.body).toEqual([]);
    await api(admin, '/api/v1/auth/switch-organization', { method: 'POST', body: JSON.stringify({ organizationId }) });
    const home = await api(admin, `/api/v1/programs/${programId}`);
    expect(home.response.status).toBe(200);

    const customProgram = await api(admin, '/api/v1/programs', {
      method: 'POST',
      body: JSON.stringify({
        clientId,
        title: 'Custom Measurement Program',
        domain: 'Adaptive',
        measurementProcedure: 'Custom Interval Probe',
        sd: 'Touch your nose',
        teachingMethod: 'NET',
      }),
    });
    expect(customProgram.response.status).toBe(201);
    expect((customProgram.body as ProgramDetail).measurementProcedure).toBe('Custom Interval Probe');
    expect((customProgram.body as ProgramDetail).sd).toBe('Touch your nose');
    expect((customProgram.body as ProgramDetail).teachingMethod).toBe('NET');
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
