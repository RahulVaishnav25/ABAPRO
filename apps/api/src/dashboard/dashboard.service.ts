import { ForbiddenException, Injectable } from '@nestjs/common';
import type {
  AuthUser,
  DashboardActivity,
  DashboardMetric,
  DashboardResponse,
  DashboardScope,
  DashboardSession,
  DashboardTrendPoint,
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
      recentSessions: sessionsFor(user, scope),
      recentActivity: activityFor(scope),
      sessionTrend: trendFor(user.organization.timezone, organizationFactor, scope),
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
        key: 'sessionsToday',
        label: 'Sessions scheduled or completed today',
        value: scale(11, factor),
        detail: 'Today in the organization timezone',
      },
      {
        key: 'programsInProgress',
        label: 'Programs currently in progress',
        value: scale(36, factor),
        detail: 'Across active clients',
      },
      {
        key: 'targetsNeedingReview',
        label: 'Targets requiring review',
        value: scale(7, factor),
        detail: 'Awaiting supervisor review',
      },
    ],
  },
  caseload: {
    scopeLabel: 'Assigned caseload',
    metrics: () => [
      { key: 'activeClients', label: 'Total active clients', value: 4, detail: 'Assigned to you' },
      { key: 'activeTherapists', label: 'Active therapists', value: 1, detail: 'You' },
      {
        key: 'sessionsToday',
        label: 'Sessions scheduled or completed today',
        value: 3,
        detail: 'On your schedule',
      },
      { key: 'programsInProgress', label: 'Programs currently in progress', value: 9, detail: 'On your caseload' },
      { key: 'targetsNeedingReview', label: 'Targets requiring review', value: 2, detail: 'Submitted for review' },
    ],
  },
  family: {
    scopeLabel: 'Linked learners',
    metrics: () => [
      { key: 'activeClients', label: 'Total active clients', value: 1, detail: 'Linked to your account' },
      { key: 'activeTherapists', label: 'Active therapists', value: 2, detail: 'Working with your learner' },
      {
        key: 'sessionsToday',
        label: 'Sessions scheduled or completed today',
        value: 1,
        detail: 'For your learner',
      },
      { key: 'programsInProgress', label: 'Programs currently in progress', value: 3, detail: 'For your learner' },
      { key: 'targetsNeedingReview', label: 'Targets requiring review', value: 1, detail: 'Shared with your care team' },
    ],
  },
};

function sessionsFor(user: AuthUser, scope: DashboardScope): DashboardSession[] {
  const zone = user.organization?.timezone ?? 'UTC';
  if (scope === 'family') {
    return [
      {
        id: 'ses_family_1',
        clientCode: 'Sample Client 201',
        therapistName: 'Casey Nguyen',
        service: 'Skill acquisition',
        startTime: zonedDateTime(zone, 15, 0),
        status: 'scheduled',
      },
    ];
  }
  if (scope === 'caseload') {
    return [
      {
        id: 'ses_case_1',
        clientCode: 'Sample Client 014',
        therapistName: user.name,
        service: 'Skill acquisition',
        startTime: zonedDateTime(zone, 9, 0),
        status: 'completed',
      },
      {
        id: 'ses_case_2',
        clientCode: 'Sample Client 022',
        therapistName: user.name,
        service: 'Behavior reduction',
        startTime: zonedDateTime(zone, 11, 30),
        status: 'in_progress',
      },
      {
        id: 'ses_case_3',
        clientCode: 'Sample Client 031',
        therapistName: user.name,
        service: 'Skill acquisition',
        startTime: zonedDateTime(zone, 14, 0),
        status: 'scheduled',
      },
    ];
  }
  return [
    {
      id: 'ses_org_1',
      clientCode: 'Sample Client 014',
      therapistName: 'Casey Nguyen',
      service: 'Skill acquisition',
      startTime: zonedDateTime(zone, 9, 0),
      status: 'completed',
    },
    {
      id: 'ses_org_2',
      clientCode: 'Sample Client 018',
      therapistName: 'Casey Nguyen',
      service: 'Behavior reduction',
      startTime: zonedDateTime(zone, 10, 30),
      status: 'completed',
    },
    {
      id: 'ses_org_3',
      clientCode: 'Sample Client 022',
      therapistName: 'Jamie Ortiz',
      service: 'Skill acquisition',
      startTime: zonedDateTime(zone, 13, 0),
      status: 'in_progress',
    },
    {
      id: 'ses_org_4',
      clientCode: 'Sample Client 027',
      therapistName: 'Jamie Ortiz',
      service: 'Caregiver training',
      startTime: zonedDateTime(zone, 15, 30),
      status: 'scheduled',
    },
  ];
}

function activityFor(scope: DashboardScope): DashboardActivity[] {
  const now = Date.now();
  const items: DashboardActivity[] =
    scope === 'family'
      ? [
          {
            id: 'act_f1',
            at: new Date(now - 45 * 60 * 1000).toISOString(),
            actor: 'Casey Nguyen',
            summary: 'Submitted sample session notes for Sample Client 201.',
          },
          {
            id: 'act_f2',
            at: new Date(now - 5 * 60 * 60 * 1000).toISOString(),
            actor: 'Morgan Patel',
            summary: 'Shared a sample progress update for Sample Client 201.',
          },
        ]
      : [
          {
            id: 'act_1',
            at: new Date(now - 25 * 60 * 1000).toISOString(),
            actor: 'Morgan Patel',
            summary: 'Marked sample target T-102 ready for review.',
          },
          {
            id: 'act_2',
            at: new Date(now - 70 * 60 * 1000).toISOString(),
            actor: 'Casey Nguyen',
            summary: 'Submitted sample session notes for Sample Client 014.',
          },
          {
            id: 'act_3',
            at: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
            actor: 'Riley Chen',
            summary: 'Updated the sample team assignment for Sample Client 022.',
          },
        ];
  return items;
}

function trendFor(timeZone: string, factor: number, scope: DashboardScope): DashboardTrendPoint[] {
  const points: DashboardTrendPoint[] = [];
  for (let offset = -6; offset <= 0; offset += 1) {
    const index = offset + 6;
    const completedBase = scope === 'family' ? (index % 2 === 0 ? 1 : 0) : 4 + (index % 3);
    const scheduledBase = scope === 'family' ? 1 : 6 + (index % 2);
    points.push({
      date: calendarDate(timeZone, offset),
      completed: scale(completedBase, scope === 'organization' ? factor : 1),
      scheduled: scale(scheduledBase, scope === 'organization' ? factor : 1),
    });
  }
  return points;
}

export function calendarDate(timeZone: string, offsetDays: number): string {
  const today = zonedParts(new Date(), timeZone);
  const utc = new Date(Date.UTC(today.year, today.month - 1, today.day));
  utc.setUTCDate(utc.getUTCDate() + offsetDays);
  return utc.toISOString().slice(0, 10);
}

export function zonedDateTime(timeZone: string, hour: number, minute: number): string {
  const today = zonedParts(new Date(), timeZone);
  const guess = new Date(Date.UTC(today.year, today.month - 1, today.day, hour, minute, 0));
  const zoned = zonedParts(guess, timeZone);
  const zonedAsUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, zoned.second);
  const offset = zonedAsUtc - guess.getTime();
  return new Date(guess.getTime() - offset).toISOString();
}

function zonedParts(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}
