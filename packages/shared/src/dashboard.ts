export type DashboardScope = 'organization' | 'caseload' | 'family';

export interface DashboardMetric {
  key: string;
  label: string;
  value: number;
  detail: string;
}

export interface DashboardActivity {
  id: string;
  at: string;
  actor: string;
  summary: string;
}

export interface PlatformClinicCountry {
  country: string;
  clinics: number;
}

export interface PlatformDashboard {
  generatedAt: string;
  timezone: 'UTC';
  organisations: number;
  clinics: number;
  clients: number;
  activeClients: number;
  clinicsByCountry: PlatformClinicCountry[];
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
  recentActivity: DashboardActivity[];
}
