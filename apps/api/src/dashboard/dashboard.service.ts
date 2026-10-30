import { ForbiddenException, Injectable } from '@nestjs/common';
import type {
  AuthUser,
  DashboardActivity,
  DashboardMetric,
  DashboardResponse,
  DashboardScope,
  Role,
} from '@abapro/shared';

const DISCLAIMER =
  'Synthetic development data. These figures are not clinical records and are not production analytics.';

@Injectable()
export class DashboardService {
  getForUser(user: AuthUser): DashboardResponse {
    if (!user.organization || !user.role) {
      throw new ForbiddenException('Choose an organization before opening the dashboard.');
    }
    const scope = scopeForRole(user.role);
    const profile = PROFILES[scope];
    const organizationFactor = organizationScale(user.organization.id);
    return {
      source: 'synthetic',
      disclaimer: DISCLAIMER,
      scope,
      scopeLabel: profile.scopeLabel,
      organizationId: user.organization.id,
      organizationName: user.organization.name,
      timezone: user.organization.timezone,
      generatedAt: new Date().toISOString(),
      metrics: profile.metrics(organizationFactor),
      recentActivity: activityFor(scope),
    };
  }
}

function organizationScale(organizationId: string): number {
  const total = [...organizationId].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return total % 2 === 0 ? 1 : 0.5;
}

function scopeForRole(role: Role): DashboardScope {
  if (role === 'parent') return 'family';
  if (role === 'therapist') return 'caseload';
  return 'organization';
}

function scale(value: number, factor: number): number {
  return Math.max(1, Math.round(value * factor));
}

const PROFILES: Record<
  DashboardScope,
  { scopeLabel: string; metrics: (factor: number) => DashboardMetric[] }
> = {
  organization: {
    scopeLabel: 'Organization totals',
    metrics: (factor) => [
      { key: 'activeClients', label: 'Total active clients', value: scale(24, factor), detail: 'Status: active' },
      { key: 'activeTherapists', label: 'Active therapists', value: scale(8, factor), detail: 'Credentialed staff' },
      {
        key: 'programsInProgress',
        label: 'Programs currently in progress',
        value: scale(36, factor),
        detail: 'Across active clients',
      },
    ],
  },
  caseload: {
    scopeLabel: 'Assigned caseload',
    metrics: () => [
      { key: 'activeClients', label: 'Total active clients', value: 4, detail: 'Assigned to you' },
      { key: 'activeTherapists', label: 'Active therapists', value: 1, detail: 'You' },
      { key: 'programsInProgress', label: 'Programs currently in progress', value: 9, detail: 'On your caseload' },
    ],
  },
  family: {
    scopeLabel: 'Linked learners',
    metrics: () => [
      { key: 'activeClients', label: 'Total active clients', value: 1, detail: 'Linked to your account' },
      { key: 'activeTherapists', label: 'Active therapists', value: 2, detail: 'Working with your learner' },
      { key: 'programsInProgress', label: 'Programs currently in progress', value: 3, detail: 'For your learner' },
    ],
  },
};

function activityFor(scope: DashboardScope): DashboardActivity[] {
  const now = Date.now();
  const items: DashboardActivity[] =
    scope === 'family'
      ? []
      : [
          {
            id: 'act_3',
            at: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
            actor: 'Riley Chen',
            summary: 'Updated the sample team assignment for Sample Client 022.',
          },
        ];
  return items;
}
