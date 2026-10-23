import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { permissionsForRole, type AuthUser } from '@abapro/shared';
import { describe, expect, it } from 'vitest';
import { readAppConfig } from '../src/config/app-config';
import { PERMISSIONS_KEY } from '../src/common/auth.decorators';
import { consumeRateLimit, resetRateLimits } from '../src/common/http';
import { PermissionsGuard } from '../src/common/permissions.guard';
import { DashboardService, zonedDateTime } from '../src/dashboard/dashboard.service';

const productionSecrets = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://localhost/abapro',
  OIDC_ISSUER: 'https://id.example.com',
  OIDC_CLIENT_ID: 'abapro-web',
  OIDC_CLIENT_SECRET: 'production-client-secret-value',
  COOKIE_SECRET: 'production-cookie-secret-32-characters-min',
};

describe('application config', () => {
  it('rejects the embedded identity provider in production', () => {
    expect(() => readAppConfig({ ...productionSecrets, EMBEDDED_OIDC: 'true' })).toThrow(/Embedded OpenID Connect/);
  });

  it('requires a database and a production cookie secret', () => {
    expect(() => readAppConfig({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL/);
    expect(() =>
      readAppConfig({
        ...productionSecrets,
        COOKIE_SECRET: 'dev-only-cookie-secret-change-me!!',
      }),
    ).toThrow(/COOKIE_SECRET/);
  });
});

describe('rate limit', () => {
  it('blocks a key after the configured number of attempts', () => {
    resetRateLimits();
    expect(consumeRateLimit('login-test', 2, 60_000)).toBe(true);
    expect(consumeRateLimit('login-test', 2, 60_000)).toBe(true);
    expect(consumeRateLimit('login-test', 2, 60_000)).toBe(false);
  });
});

describe('permissions guard', () => {
  it('denies a therapist the settings permission', () => {
    const reflector = {
      getAllAndOverride: (key: string) => (key === PERMISSIONS_KEY ? ['settings.view'] : false),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    const user = {
      permissions: ['dashboard.view'],
    } as AuthUser;
    const context = {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});

describe('synthetic dashboard', () => {
  const dashboard = new DashboardService();

  it('labels organization data as synthetic and scopes guardians separately', () => {
    const admin = fixtureUser('organization_admin', 'North Shore Therapy');
    const parent = fixtureUser('parent', 'North Shore Therapy');
    const adminDashboard = dashboard.getForUser(admin);
    const parentDashboard = dashboard.getForUser(parent);

    expect(adminDashboard.source).toBe('synthetic');
    expect(adminDashboard.disclaimer).toMatch(/Synthetic development data/);
    expect(adminDashboard.scope).toBe('organization');
    expect(parentDashboard.scope).toBe('family');
    expect(parentDashboard.metrics.find((metric) => metric.key === 'activeClients')?.value).toBe(1);
    expect(adminDashboard.metrics.find((metric) => metric.key === 'activeClients')?.value).toBeGreaterThan(1);
    expect(adminDashboard.recentSessions.every((session) => session.clientCode.startsWith('Sample Client'))).toBe(true);
  });

  it('places a zoned session time on the requested local hour', () => {
    const iso = zonedDateTime('America/Chicago', 9, 30);
    const hour = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
    }).format(new Date(iso));
    expect(hour).toBe('09:30');
  });
});

function fixtureUser(role: AuthUser['role'] & string, organizationName: string): AuthUser {
  return {
    id: 'user-1',
    email: `${role}@example.com`,
    name: 'Sample User',
    emailVerified: false,
    role,
    roleLabel: role,
    organization: {
      id: '11111111-1111-4111-8111-111111111111',
      name: organizationName,
      timezone: 'America/Chicago',
    },
    organizations: [],
    permissions: [...permissionsForRole(role)],
  };
}
