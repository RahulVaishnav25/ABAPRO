export type DashboardScope = 'organization' | 'caseload' | 'family';

export type SessionStatus = 'scheduled' | 'in_progress' | 'completed';

export interface DashboardMetric {
  key: string;
  label: string;
  value: number;
  detail: string;
}

export interface DashboardSession {
  id: string;
  clientCode: string;
  therapistName: string;
  service: string;
  startTime: string;
  status: SessionStatus;
}

export interface DashboardActivity {
  id: string;
  at: string;
  actor: string;
  summary: string;
}

export interface DashboardTrendPoint {
  date: string;
  completed: number;
  scheduled: number;
}

export interface PlatformClinicCountry {
  country: string;
  clinics: number;
}

export interface PlatformSessionTrendPoint {
  date: string;
  completed: number;
  scheduled: number;
  inProgress: number;
}

export interface PlatformDashboard {
  generatedAt: string;
  timezone: 'UTC';
  organisations: number;
  clinics: number;
  clients: number;
  activeClients: number;
  clinicsByCountry: PlatformClinicCountry[];
  sessionTrend: PlatformSessionTrendPoint[];
}

export interface DashboardResponse {
  source: 'synthetic';
  disclaimer: string;
  scope: DashboardScope;
  scopeLabel: string;
  organizationId: string;
  organizationName: string;
  timezone: string;
  generatedAt: string;
  metrics: DashboardMetric[];
  recentSessions: DashboardSession[];
  recentActivity: DashboardActivity[];
  sessionTrend: DashboardTrendPoint[];
}
