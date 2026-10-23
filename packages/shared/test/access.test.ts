import { describe, expect, it } from 'vitest';
import {
  APP_FEATURES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ceilingForRole,
  grantViolation,
  hasPermission,
  isMutatingPermission,
  navigationFor,
  navigationItemIsActive,
  permissionsForRole,
} from '../src/index';

describe('role permissions', () => {
  it('gives organization administrators every permission except exceptional support access', () => {
    const clinical = Object.values(PERMISSIONS).filter((permission) => permission !== PERMISSIONS.accessExceptionGrant);
    expect(permissionsForRole('organization_admin')).toEqual(clinical);
    expect(permissionsForRole('platform_admin')).not.toContain(PERMISSIONS.clientsView);
    expect(permissionsForRole('platform_admin')).not.toContain(PERMISSIONS.clientsSensitiveView);
    expect(permissionsForRole('platform_admin')).toContain(PERMISSIONS.accessExceptionGrant);
  });

  it('keeps reviewer access read-only and rejects grants above the platform ceiling', () => {
    expect(ceilingForRole('reviewer').some((permission) => isMutatingPermission(permission))).toBe(false);
    expect(grantViolation('therapist', [PERMISSIONS.clientsView, PERMISSIONS.settingsManage])).toMatch(/platform limit/);
    expect(grantViolation('reviewer', [PERMISSIONS.observationsAmend])).toMatch(/platform limit/);
    expect(grantViolation('platform_admin', [PERMISSIONS.auditView])).toMatch(/cannot be customized/);
  });

  it('hides organization settings from clinical roles and guardians', () => {
    for (const role of ['clinical_supervisor', 'therapist', 'parent', 'reviewer'] as const) {
      expect(hasPermission(ROLE_PERMISSIONS[role], PERMISSIONS.settingsView)).toBe(false);
    }
  });

  it('limits guardians to family-facing navigation', () => {
    const titles = navigationFor(permissionsForRole('parent')).map((item) => item.title);
    expect(titles).toEqual(['Dashboard', 'Progress']);
  });

  it('limits therapists to direct-care navigation', () => {
    const keys = navigationFor(permissionsForRole('therapist')).map((item) => item.key);
    expect(keys).toEqual(['home', 'children', 'sessions', 'progress']);
  });

  it('keeps clinic administration inside Settings and highlights the section that contains the current page', () => {
    const admin = navigationFor(permissionsForRole('organization_admin'), { platformAdmin: true }).map((item) => item.key);
    expect(admin).toEqual(['platform', 'organisations', 'clinics', 'children', 'sessions', 'progress', 'settings']);
    expect(navigationFor([], { platformAdmin: true }).map((item) => item.key)).toEqual(['platform', 'organisations', 'clinics', 'settings']);
    expect(navigationFor(permissionsForRole('therapist')).map((item) => item.key)).not.toContain('organisations');
    expect(navigationFor(permissionsForRole('therapist'), { organizationId: 'org-1' }).map((item) => item.key)).toEqual(['home', 'organisations', 'clinics', 'children', 'sessions', 'progress']);
    const supervisor = navigationFor(permissionsForRole('clinical_supervisor')).map((item) => item.key);
    expect(supervisor).toEqual(['home', 'children', 'sessions', 'progress', 'settings']);
    const settings = navigationFor(permissionsForRole('clinical_supervisor')).find((item) => item.key === 'settings');
    expect(settings && navigationItemIsActive(settings, '/team')).toBe(true);
    expect(settings && navigationItemIsActive(settings, '/programs')).toBe(false);
    const children = navigationFor(permissionsForRole('therapist')).find((item) => item.key === 'children');
    expect(children && navigationItemIsActive(children, '/clients/abc')).toBe(true);
  });

  it('maps every feature to a unique route and permission', () => {
    const routes = APP_FEATURES.map((feature) => feature.route);
    expect(new Set(routes).size).toBe(routes.length);
    expect(APP_FEATURES.filter((feature) => feature.implemented).map((feature) => feature.key)).toEqual([
      'dashboard',
      'clients',
      'assessments',
      'programs',
      'sessions',
      'team',
    ]);
  });
});
