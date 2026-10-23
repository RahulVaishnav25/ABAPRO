import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthUser, ClinicDetail, ClinicDirectoryPage, OrganizationDirectoryItem, OrganizationDirectoryPage, PlatformDashboard } from '@abapro/shared';
import { createApplication, type RunningApplication } from '../src/create-application';

let running: RunningApplication;
let base = '';
let dataDir = '';

describe.sequential('organisation clinics', () => {
  beforeAll(async () => {
    const apiPort = await freePort();
    const oidcPort = await freePort();
    dataDir = await mkdtemp(join(tmpdir(), 'abapro-clinics-'));
    process.env.NODE_ENV = 'test';
    process.env.PORT = String(apiPort);
    process.env.OIDC_PORT = String(oidcPort);
    process.env.WEB_ORIGIN = `http://127.0.0.1:${apiPort}`;
    process.env.CORS_ORIGIN = process.env.WEB_ORIGIN;
    process.env.PGLITE_DIR = dataDir;
    process.env.RATE_LIMIT = 'false';
    process.env.EMBEDDED_OIDC = 'true';
    delete process.env.DATABASE_URL;
    running = await createApplication();
    await running.app.listen(running.config.port, '127.0.0.1');
    base = `http://127.0.0.1:${running.config.port}`;
  }, 90_000);

  afterAll(async () => {
    await running?.close();
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  });

  it('creates one organisation with several clinics and isolates their records', async () => {
    const admin = new CookieJar();
    const signedIn = await api(admin, '/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'super@abapro.test', password: 'SuperAccess!2026' }),
    });
    expect(signedIn.response.status).toBe(200);

    const created = await api(admin, '/api/v1/organizations', {
      method: 'POST',
      body: JSON.stringify({
        name: 'North Harbor',
        contactEmail: 'ops@north-harbor.test',
        country: 'US',
        timezone: 'America/New_York',
        locale: 'en-US',
        primaryColor: '#0e6b62',
        invites: [],
        clinics: [
          { name: 'Riverside', location: 'Boston', address: '10 River Street', contactEmail: 'riverside@north-harbor.test' },
          { name: 'Seaside', location: 'Salem', address: '4 Harbor Road', contactPhone: '555-0100' },
        ],
      }),
    });
    expect(created.response.status).toBe(201);
    const adminUser = created.body as AuthUser;
    expect(adminUser.organization?.name).toBe('North Harbor');
    expect(adminUser.clinics.map((clinic) => clinic.name).sort()).toEqual(['Riverside', 'Seaside']);
    expect(adminUser.clinic?.name).toBe('Riverside');

    const listed = await api(admin, '/api/v1/organizations?q=Salem');
    expect(listed.response.status).toBe(200);
    const directory = listed.body as OrganizationDirectoryPage;
    expect(directory.total).toBe(1);
    expect(directory.items).toHaveLength(1);
    expect(directory.items[0]?.clinics).toHaveLength(2);

    const client = await api(admin, '/api/v1/clients', {
      method: 'POST',
      body: JSON.stringify({ displayName: 'River Client' }),
    });
    expect(client.response.status).toBe(201);

    const riverside = await api(admin, '/api/v1/clients');
    expect(riverside.body).toMatchObject({ total: 1 });

    const seasideId = adminUser.clinics.find((clinic) => clinic.name === 'Seaside')?.id ?? '';
    const switched = await api(admin, '/api/v1/auth/switch-clinic', {
      method: 'POST',
      body: JSON.stringify({ clinicId: seasideId }),
    });
    expect(switched.response.status).toBe(200);
    expect((switched.body as AuthUser).clinic?.name).toBe('Seaside');
    const seaside = await api(admin, '/api/v1/clients');
    expect(seaside.body).toMatchObject({ total: 0 });

    const detail = await api(admin, `/api/v1/organizations/${adminUser.organization?.id}`);
    expect(detail.response.status).toBe(200);
    const organisation = detail.body as OrganizationDirectoryItem;
    const riversideClinic = organisation.clinics.find((clinic) => clinic.name === 'Riverside');
    expect(riversideClinic?.clients.map((item) => item.displayName)).toEqual(['River Client']);
    expect(organisation.members.some((member) => member.email === 'super@abapro.test')).toBe(false);

    const clinics = await api(admin, '/api/v1/clinics?q=Seaside');
    expect(clinics.response.status).toBe(200);
    const clinicPage = clinics.body as ClinicDirectoryPage;
    expect(clinicPage.total).toBe(1);
    expect(clinicPage.items[0]).toMatchObject({ name: 'Seaside', organizationName: 'North Harbor', childCount: 0, country: 'US' });
    expect(clinicPage.organizations.map((item) => item.name)).toContain('North Harbor');

    const byOrganisation = await api(admin, `/api/v1/clinics?organizationId=${adminUser.organization?.id}&country=US&q=North`);
    expect((byOrganisation.body as ClinicDirectoryPage).total).toBe(2);
    const otherCountry = await api(admin, '/api/v1/clinics?country=CA');
    expect((otherCountry.body as ClinicDirectoryPage).total).toBe(0);

    const clinicDetail = await api(admin, `/api/v1/clinics/${riversideClinic?.id}`);
    expect(clinicDetail.response.status).toBe(200);
    const riversideDetail = clinicDetail.body as ClinicDetail;
    expect(riversideDetail).toMatchObject({
      name: 'Riverside',
      organizationName: 'North Harbor',
      address: '10 River Street',
      contactEmail: 'riverside@north-harbor.test',
      childCount: 1,
    });
    expect(riversideDetail.children.map((child) => child.displayName)).toEqual(['River Client']);
    const missingClinic = await api(admin, '/api/v1/clinics/00000000-0000-4000-8000-000000000000');
    expect(missingClinic.response.status).toBe(404);

    const updatedOrganisation = await api(admin, `/api/v1/organizations/${adminUser.organization?.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: 'North Harbor',
        contactEmail: 'ops@north-harbor.test',
        contactPhone: '555-0199',
        country: 'US',
        address: '1 Harbor Way',
        companyIdentificationNumber: 'CIN-1',
        taxNumber: 'TAX-1',
      }),
    });
    expect(updatedOrganisation.response.status).toBe(200);
    expect(updatedOrganisation.body).toMatchObject({
      name: 'North Harbor',
      contactPhone: '555-0199',
      address: '1 Harbor Way',
      companyIdentificationNumber: 'CIN-1',
      taxNumber: 'TAX-1',
    });

    const updatedClinic = await api(admin, `/api/v1/clinics/${riversideClinic?.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: 'Riverside',
        location: 'Cambridge',
        address: '22 River Street',
        contactEmail: 'riverside@north-harbor.test',
        contactPhone: '555-0111',
      }),
    });
    expect(updatedClinic.response.status).toBe(200);
    expect(updatedClinic.body).toMatchObject({
      name: 'Riverside',
      location: 'Cambridge',
      address: '22 River Street',
      contactPhone: '555-0111',
      childCount: 1,
    });

    const outsider = await api(new CookieJar(), '/api/v1/auth/accounts', { method: 'GET' });
    expect(outsider.response.status).toBe(401);
    const account = await api(admin, '/api/v1/auth/accounts', {
      method: 'POST',
      body: JSON.stringify({ name: 'Clinic Therapist', email: 'therapist@north-harbor.test', password: 'ClinicAccess!2026' }),
    });
    expect(account.response.status).toBe(201);
    const therapistId = (account.body as { id: string }).id;
    const userRows = await running.database.query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, ['therapist@north-harbor.test']);
    await running.database.query(
      `INSERT INTO organization_memberships (organization_id, user_id, role) VALUES ($1, $2, 'therapist')`,
      [adminUser.organization?.id, userRows[0]?.id],
    );
    await running.database.query(
      `INSERT INTO clinic_access (organization_id, clinic_id, user_id) VALUES ($1, $2, $3)`,
      [adminUser.organization?.id, seasideId, userRows[0]?.id],
    );

    const therapist = new CookieJar();
    const therapistSignIn = await api(therapist, '/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'therapist@north-harbor.test', password: 'ClinicAccess!2026' }),
    });
    expect(therapistSignIn.response.status).toBe(200);
    const therapistUser = therapistSignIn.body as AuthUser;
    expect(therapistUser.clinics.map((clinic) => clinic.name)).toEqual(['Seaside']);
    const therapistClients = await api(therapist, '/api/v1/clients');
    expect(therapistClients.body).toMatchObject({ total: 0 });
    const denied = await api(therapist, '/api/v1/auth/switch-clinic', {
      method: 'POST',
      body: JSON.stringify({ clinicId: riversideClinic?.id }),
    });
    expect(denied.response.status).toBe(403);
    const hidden = await api(therapist, `/api/v1/clients/${(client.body as { id: string }).id}`);
    expect(hidden.response.status).toBe(404);
    const therapistClinicEdit = await api(therapist, `/api/v1/clinics/${seasideId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Seaside', location: 'Salem' }),
    });
    expect(therapistClinicEdit.response.status).toBe(403);
    const therapistClinicList = await api(therapist, '/api/v1/clinics');
    expect(therapistClinicList.response.status).toBe(200);
    expect((therapistClinicList.body as ClinicDirectoryPage).items.map((item) => item.name)).toEqual(['Seaside']);
    const therapistDashboard = await api(therapist, '/api/v1/platform/dashboard');
    expect(therapistDashboard.response.status).toBe(403);

    const portal = await api(admin, '/api/v1/platform/dashboard');
    expect(portal.response.status).toBe(200);
    const summary = portal.body as PlatformDashboard;
    expect(summary).toMatchObject({
      organisations: 1,
      clinics: 2,
      clients: 1,
      activeClients: 1,
      clinicsByCountry: [{ country: 'US', clinics: 2 }],
    });
    expect(summary.sessionTrend).toHaveLength(14);

    const roles = await api(admin, '/api/v1/platform/roles');
    expect(roles.response.status).toBe(200);
    expect(Array.isArray(roles.body)).toBe(true);
    const deniedRoles = await api(therapist, '/api/v1/platform/roles');
    expect(deniedRoles.response.status).toBe(403);
    const saved = await api(admin, '/api/v1/platform/roles', {
      method: 'PUT',
      body: JSON.stringify({ role: 'reviewer', permissions: ['dashboard.view', 'clients.view'] }),
    });
    expect(saved.response.status).toBe(200);
    expect(saved.body).toMatchObject({ role: 'reviewer', granted: ['dashboard.view', 'clients.view'] });

    const secondAdmin = await api(admin, '/api/v1/auth/accounts', {
      method: 'POST',
      body: JSON.stringify({ name: 'Second Admin', email: 'second.admin@example.test', password: 'SecondAccess!2026', platformAdmin: true }),
    });
    expect(secondAdmin.response.status).toBe(201);
    expect(secondAdmin.body).toMatchObject({ email: 'second.admin@example.test', platformAdmin: true });
    expect(therapistId).toBeTruthy();
  });

  it('creates a team member who can sign in and see only that organisation', async () => {
    const admin = new CookieJar();
    await api(admin, '/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'super@abapro.test', password: 'SuperAccess!2026' }),
    });
    const created = await api(admin, '/api/v1/organizations', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Member Harbor',
        contactEmail: 'ops@member-harbor.test',
        country: 'US',
        timezone: 'America/Chicago',
        locale: 'en-US',
        primaryColor: '#0e6b62',
        invites: [],
        clinics: [
          { name: 'North', location: 'Boston' },
          { name: 'South', location: 'Salem' },
        ],
      }),
    });
    const organizationId = (created.body as AuthUser).organization?.id ?? '';
    await api(admin, '/api/v1/organizations', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Other Harbor',
        contactEmail: 'ops@other-harbor.test',
        country: 'US',
        timezone: 'America/Chicago',
        locale: 'en-US',
        primaryColor: '#0e6b62',
        invites: [],
        clinics: [{ name: 'Elsewhere', location: 'Chicago' }],
      }),
    });
    const member = await api(admin, `/api/v1/organizations/${organizationId}/members`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Harbor Admin',
        email: 'harbor.admin@example.test',
        password: 'HarborAccess!2026',
        role: 'organization_admin',
      }),
    });
    expect(member.response.status).toBe(201);
    const directory = member.body as OrganizationDirectoryItem;
    expect(directory.members.some((person) => person.email === 'harbor.admin@example.test')).toBe(true);

    const staff = new CookieJar();
    const signedIn = await api(staff, '/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'harbor.admin@example.test', password: 'HarborAccess!2026' }),
    });
    expect(signedIn.response.status).toBe(200);
    const user = signedIn.body as AuthUser;
    expect(user.platformAdmin).toBe(false);
    expect(user.organization?.id).toBe(organizationId);
    expect(user.organizations.map((item) => item.id)).toEqual([organizationId]);
    expect(user.clinics.map((clinic) => clinic.name).sort()).toEqual(['North', 'South']);

    const ownOrganisation = await api(staff, `/api/v1/organizations/${organizationId}`);
    expect(ownOrganisation.response.status).toBe(200);
    const otherList = await api(staff, '/api/v1/organizations');
    expect(otherList.response.status).toBe(403);
    const clinics = await api(staff, '/api/v1/clinics');
    expect(clinics.response.status).toBe(200);
    const clinicPage = clinics.body as ClinicDirectoryPage;
    expect(clinicPage.items.map((item) => item.name).sort()).toEqual(['North', 'South']);
    expect(clinicPage.organizations.map((item) => item.id)).toEqual([organizationId]);
    const clients = await api(staff, '/api/v1/clients');
    expect(clients.response.status).toBe(200);
  });
});

async function api(jar: CookieJar, path: string, init: RequestInit = {}): Promise<{ response: Response; body: unknown; text: string }> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${base}${path}`, { ...init, headers: withCookie(jar, `${base}${path}`, headers) });
  const text = await response.text();
  jar.store(`${base}${path}`, response);
  return { response, text, body: text ? JSON.parse(text) as unknown : null };
}

function withCookie(jar: CookieJar, url: string, headers: Headers): Headers {
  const cookie = jar.header(url);
  if (cookie) headers.set('cookie', cookie);
  return headers;
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
      jar.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
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
