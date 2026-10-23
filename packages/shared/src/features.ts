import { PERMISSIONS, type Permission } from './permissions';

export interface AppFeature {
  key: string;
  title: string;
  description: string;
  route: string;
  apiPath: string;
  permission: Permission;
  nav: boolean;
  implemented: boolean;
}

export const APP_FEATURES = [
  {
    key: 'dashboard',
    title: 'Dashboard',
    description: 'Operational overview for the signed-in organization.',
    route: '/',
    apiPath: 'dashboard',
    permission: PERMISSIONS.dashboardView,
    nav: true,
    implemented: true,
  },
  {
    key: 'clients',
    title: 'Clients',
    description: 'Client records, assignments, and status.',
    route: '/clients',
    apiPath: 'clients',
    permission: PERMISSIONS.clientsView,
    nav: true,
    implemented: true,
  },
  {
    key: 'assessments',
    title: 'Assessments',
    description: 'Client assessments and clinician-written templates.',
    route: '/assessments',
    apiPath: 'assessments',
    permission: PERMISSIONS.assessmentsView,
    nav: false,
    implemented: true,
  },
  {
    key: 'programs',
    title: 'Programs',
    description: 'Client programs and reusable program templates.',
    route: '/programs',
    apiPath: 'programs',
    permission: PERMISSIONS.programsView,
    nav: false,
    implemented: true,
  },
  {
    key: 'sessions',
    title: 'Sessions / Data Collection',
    description: 'Live session data collection.',
    route: '/sessions',
    apiPath: 'sessions',
    permission: PERMISSIONS.sessionsView,
    nav: true,
    implemented: true,
  },
  {
    key: 'progress',
    title: 'Progress & Graphs',
    description: 'Target and program progress visualization.',
    route: '/progress',
    apiPath: 'progress',
    permission: PERMISSIONS.progressView,
    nav: true,
    implemented: false,
  },
  {
    key: 'reports',
    title: 'Reports',
    description: 'Clinical and operational reports.',
    route: '/reports',
    apiPath: 'reports',
    permission: PERMISSIONS.reportsView,
    nav: false,
    implemented: false,
  },
  {
    key: 'maintenance',
    title: 'Maintenance',
    description: 'Maintenance assessments and probes.',
    route: '/maintenance',
    apiPath: 'maintenance',
    permission: PERMISSIONS.maintenanceView,
    nav: false,
    implemented: false,
  },
  {
    key: 'team',
    title: 'Team',
    description: 'Therapists, supervisors, and assignments.',
    route: '/team',
    apiPath: 'team',
    permission: PERMISSIONS.teamView,
    nav: false,
    implemented: true,
  },
  {
    key: 'parentPortal',
    title: 'Parent Portal',
    description: 'Guardian access to linked learners.',
    route: '/parent-portal',
    apiPath: 'parent-portal',
    permission: PERMISSIONS.parentPortalView,
    nav: false,
    implemented: false,
  },
  {
    key: 'messages',
    title: 'Messages',
    description: 'Secure messages between care team members and guardians.',
    route: '/messages',
    apiPath: 'messages',
    permission: PERMISSIONS.messagesView,
    nav: false,
    implemented: false,
  },
  {
    key: 'settings',
    title: 'Organization Settings',
    description: 'Organization profile, branding, and access settings.',
    route: '/settings',
    apiPath: 'organization/settings',
    permission: PERMISSIONS.settingsView,
    nav: true,
    implemented: false,
  },
] as const satisfies readonly AppFeature[];

export type FeatureDefinition = (typeof APP_FEATURES)[number];
export type FeatureKey = FeatureDefinition['key'];

export function featureByKey(key: string): FeatureDefinition {
  const feature = APP_FEATURES.find((item) => item.key === key);
  if (!feature) {
    throw new Error(`Unknown application feature: ${key}`);
  }
  return feature;
}

export interface PrimaryNavigationItem {
  key: 'home' | 'children' | 'sessions' | 'progress' | 'settings' | 'organisations' | 'clinics' | 'platform';
  title: string;
  route: string;
  icon: 'home' | 'children' | 'sessions' | 'progress' | 'settings' | 'organisations' | 'clinics' | 'dashboard';
  matches: readonly string[];
}

export const PRIMARY_NAVIGATION = [
  { key: 'home', title: 'Dashboard', route: '/', icon: 'dashboard', matches: [] },
  { key: 'children', title: 'Clients', route: '/clients', icon: 'children', matches: ['/clients'] },
  { key: 'sessions', title: 'Sessions', route: '/sessions', icon: 'sessions', matches: ['/sessions'] },
  { key: 'progress', title: 'Progress', route: '/progress', icon: 'progress', matches: ['/progress'] },
  { key: 'settings', title: 'Settings', route: '/settings', icon: 'settings', matches: ['/settings', '/team'] },
] as const satisfies readonly PrimaryNavigationItem[];

const ORGANISATIONS_NAV = {
  key: 'organisations',
  title: 'Organisations',
  route: '/organizations',
  icon: 'organisations',
  matches: ['/organizations'],
} as const satisfies PrimaryNavigationItem;

const CLINICS_NAV = {
  key: 'clinics',
  title: 'Clinics',
  route: '/clinics',
  icon: 'clinics',
  matches: ['/clinics'],
} as const satisfies PrimaryNavigationItem;

const PLATFORM_DASHBOARD_NAV = {
  key: 'platform',
  title: 'Dashboard',
  route: '/platform',
  icon: 'dashboard',
  matches: ['/platform'],
} as const satisfies PrimaryNavigationItem;

export function navigationFor(
  permissions: readonly Permission[],
  options: { platformAdmin?: boolean; organizationId?: string } = {},
): PrimaryNavigationItem[] {
  const items: PrimaryNavigationItem[] = PRIMARY_NAVIGATION.filter((item) => {
    if (item.key === 'home') return !options.platformAdmin && permissions.includes(PERMISSIONS.dashboardView);
    if (item.key === 'children') return permissions.includes(PERMISSIONS.clientsView);
    if (item.key === 'sessions') return permissions.includes(PERMISSIONS.sessionsView);
    if (item.key === 'progress') return permissions.includes(PERMISSIONS.progressView);
    return permissions.includes(PERMISSIONS.settingsView) || permissions.includes(PERMISSIONS.teamView) || options.platformAdmin === true;
  });
  if (options.platformAdmin) {
    return [PLATFORM_DASHBOARD_NAV, ORGANISATIONS_NAV, CLINICS_NAV, ...items];
  }
  if (options.organizationId) {
    const organisation: PrimaryNavigationItem = {
      ...ORGANISATIONS_NAV,
      title: 'Organisation',
      route: `/organizations/${options.organizationId}`,
    };
    const homeIndex = items.findIndex((item) => item.key === 'home');
    items.splice(homeIndex + 1, 0, organisation, CLINICS_NAV);
  }
  return items;
}

export function navigationItemIsActive(item: PrimaryNavigationItem, path: string): boolean {
  if (item.key === 'home') return path === '/';
  return item.matches.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
