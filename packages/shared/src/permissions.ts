export const PERMISSIONS = {
  dashboardView: 'dashboard.view',
  clientsView: 'clients.view',
  clientsCreate: 'clients.create',
  clientsEdit: 'clients.edit',
  clientsSensitiveView: 'clients.sensitive.view',
  documentsUpload: 'documents.upload',
  documentsDownload: 'documents.download',
  assessmentsView: 'assessments.view',
  assessmentsCreate: 'assessments.create',
  programsView: 'programs.view',
  programsEdit: 'programs.edit',
  targetsEdit: 'targets.edit',
  sessionsView: 'sessions.view',
  observationsRecord: 'observations.record',
  observationsAmend: 'observations.amend',
  phasesApprove: 'phases.approve',
  progressView: 'progress.view',
  graphsView: 'graphs.view',
  graphsExport: 'graphs.export',
  reportsView: 'reports.view',
  reportsCreate: 'reports.create',
  reportsApprove: 'reports.approve',
  maintenanceView: 'maintenance.view',
  assignmentsManage: 'assignments.manage',
  teamView: 'team.view',
  teamMembershipManage: 'team.membership.manage',
  parentPortalView: 'parent_portal.view',
  guardiansManage: 'guardians.manage',
  messagesView: 'messages.view',
  settingsView: 'settings.view',
  settingsManage: 'settings.manage',
  auditView: 'audit.view',
  accessExceptionGrant: 'access.exception.grant',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLES = {
  platformAdmin: 'platform_admin',
  organizationAdmin: 'organization_admin',
  clinicalSupervisor: 'clinical_supervisor',
  therapist: 'therapist',
  parent: 'parent',
  reviewer: 'reviewer',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LABELS: Record<Role, string> = {
  platform_admin: 'Platform Administrator',
  organization_admin: 'Organization Administrator',
  clinical_supervisor: 'Clinical Supervisor / BCBA',
  therapist: 'Therapist / RBT',
  parent: 'Parent / Guardian',
  reviewer: 'Read-only Reviewer',
};

export interface PermissionDefinition {
  key: Permission;
  label: string;
  group: string;
  mutates: boolean;
}

export const PERMISSION_CATALOG: readonly PermissionDefinition[] = [
  { key: PERMISSIONS.dashboardView, label: 'View the dashboard', group: 'Dashboard', mutates: false },
  { key: PERMISSIONS.clientsView, label: 'View clients', group: 'Clients', mutates: false },
  { key: PERMISSIONS.clientsCreate, label: 'Create client profiles', group: 'Clients', mutates: true },
  { key: PERMISSIONS.clientsEdit, label: 'Edit client profiles', group: 'Clients', mutates: true },
  { key: PERMISSIONS.clientsSensitiveView, label: 'View medical and sensitive information', group: 'Clients', mutates: false },
  { key: PERMISSIONS.documentsUpload, label: 'Upload documents', group: 'Documents', mutates: true },
  { key: PERMISSIONS.documentsDownload, label: 'Download documents', group: 'Documents', mutates: false },
  { key: PERMISSIONS.assessmentsView, label: 'View assessments', group: 'Clinical records', mutates: false },
  { key: PERMISSIONS.assessmentsCreate, label: 'Create assessments', group: 'Clinical records', mutates: true },
  { key: PERMISSIONS.programsView, label: 'View programs', group: 'Clinical records', mutates: false },
  { key: PERMISSIONS.programsEdit, label: 'Create and edit programs', group: 'Clinical records', mutates: true },
  { key: PERMISSIONS.targetsEdit, label: 'Create and edit targets', group: 'Clinical records', mutates: true },
  { key: PERMISSIONS.sessionsView, label: 'View sessions', group: 'Clinical records', mutates: false },
  { key: PERMISSIONS.observationsRecord, label: 'Record session observations', group: 'Clinical records', mutates: true },
  { key: PERMISSIONS.observationsAmend, label: 'Amend recorded observations', group: 'Clinical records', mutates: true },
  { key: PERMISSIONS.phasesApprove, label: 'Approve phase transitions', group: 'Clinical records', mutates: true },
  { key: PERMISSIONS.progressView, label: 'View progress', group: 'Progress', mutates: false },
  { key: PERMISSIONS.graphsView, label: 'View graphs', group: 'Progress', mutates: false },
  { key: PERMISSIONS.graphsExport, label: 'Export graphs', group: 'Progress', mutates: false },
  { key: PERMISSIONS.reportsView, label: 'View reports', group: 'Reports', mutates: false },
  { key: PERMISSIONS.reportsCreate, label: 'Create reports', group: 'Reports', mutates: true },
  { key: PERMISSIONS.reportsApprove, label: 'Approve reports', group: 'Reports', mutates: true },
  { key: PERMISSIONS.maintenanceView, label: 'View maintenance', group: 'Reports', mutates: false },
  { key: PERMISSIONS.assignmentsManage, label: 'Manage therapist assignments', group: 'Team', mutates: true },
  { key: PERMISSIONS.teamView, label: 'View the team', group: 'Team', mutates: false },
  { key: PERMISSIONS.teamMembershipManage, label: 'Manage team memberships', group: 'Team', mutates: true },
  { key: PERMISSIONS.parentPortalView, label: 'View the parent portal', group: 'Family access', mutates: false },
  { key: PERMISSIONS.guardiansManage, label: 'Manage parent and guardian access', group: 'Family access', mutates: true },
  { key: PERMISSIONS.messagesView, label: 'View messages', group: 'Family access', mutates: false },
  { key: PERMISSIONS.settingsView, label: 'View branding and settings', group: 'Administration', mutates: false },
  { key: PERMISSIONS.settingsManage, label: 'Manage branding and settings', group: 'Administration', mutates: true },
  { key: PERMISSIONS.auditView, label: 'View audit history', group: 'Administration', mutates: false },
  { key: PERMISSIONS.accessExceptionGrant, label: 'Grant exceptional support access', group: 'Administration', mutates: true },
];

const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS);

export const EXCEPTIONAL_ACCESS_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.clientsView,
  PERMISSIONS.clientsSensitiveView,
  PERMISSIONS.documentsDownload,
  PERMISSIONS.assessmentsView,
  PERMISSIONS.programsView,
  PERMISSIONS.progressView,
  PERMISSIONS.graphsView,
  PERMISSIONS.reportsView,
  PERMISSIONS.maintenanceView,
];

const PLATFORM_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.dashboardView,
  PERMISSIONS.teamView,
  PERMISSIONS.auditView,
  PERMISSIONS.accessExceptionGrant,
];

const ORGANIZATION_ADMIN_PERMISSIONS = ALL_PERMISSIONS.filter(
  (permission) => permission !== PERMISSIONS.accessExceptionGrant,
);

const SUPERVISOR_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.dashboardView,
  PERMISSIONS.clientsView,
  PERMISSIONS.clientsCreate,
  PERMISSIONS.clientsEdit,
  PERMISSIONS.clientsSensitiveView,
  PERMISSIONS.documentsUpload,
  PERMISSIONS.documentsDownload,
  PERMISSIONS.assessmentsView,
  PERMISSIONS.assessmentsCreate,
  PERMISSIONS.programsView,
  PERMISSIONS.programsEdit,
  PERMISSIONS.targetsEdit,
  PERMISSIONS.sessionsView,
  PERMISSIONS.observationsRecord,
  PERMISSIONS.observationsAmend,
  PERMISSIONS.phasesApprove,
  PERMISSIONS.progressView,
  PERMISSIONS.graphsView,
  PERMISSIONS.graphsExport,
  PERMISSIONS.reportsView,
  PERMISSIONS.reportsCreate,
  PERMISSIONS.reportsApprove,
  PERMISSIONS.maintenanceView,
  PERMISSIONS.assignmentsManage,
  PERMISSIONS.teamView,
  PERMISSIONS.parentPortalView,
  PERMISSIONS.guardiansManage,
  PERMISSIONS.messagesView,
  PERMISSIONS.auditView,
];

const THERAPIST_CEILING: readonly Permission[] = [
  PERMISSIONS.dashboardView,
  PERMISSIONS.clientsView,
  PERMISSIONS.documentsUpload,
  PERMISSIONS.documentsDownload,
  PERMISSIONS.assessmentsView,
  PERMISSIONS.programsView,
  PERMISSIONS.sessionsView,
  PERMISSIONS.observationsRecord,
  PERMISSIONS.progressView,
  PERMISSIONS.graphsView,
  PERMISSIONS.messagesView,
];

const THERAPIST_DEFAULTS = THERAPIST_CEILING.filter((permission) => permission !== PERMISSIONS.documentsUpload);

const PARENT_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.dashboardView,
  PERMISSIONS.progressView,
  PERMISSIONS.graphsView,
  PERMISSIONS.parentPortalView,
  PERMISSIONS.messagesView,
  PERMISSIONS.documentsDownload,
];

const REVIEWER_DEFAULTS: readonly Permission[] = [
  PERMISSIONS.dashboardView,
  PERMISSIONS.clientsView,
  PERMISSIONS.documentsDownload,
  PERMISSIONS.assessmentsView,
  PERMISSIONS.programsView,
  PERMISSIONS.progressView,
  PERMISSIONS.graphsView,
  PERMISSIONS.reportsView,
  PERMISSIONS.maintenanceView,
];

const REVIEWER_CEILING: readonly Permission[] = [
  ...REVIEWER_DEFAULTS,
  PERMISSIONS.clientsSensitiveView,
];

export const ROLE_CEILINGS: Record<Role, readonly Permission[]> = {
  platform_admin: PLATFORM_PERMISSIONS,
  organization_admin: ORGANIZATION_ADMIN_PERMISSIONS,
  clinical_supervisor: SUPERVISOR_PERMISSIONS,
  therapist: THERAPIST_CEILING,
  parent: PARENT_PERMISSIONS,
  reviewer: REVIEWER_CEILING,
};

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  platform_admin: PLATFORM_PERMISSIONS,
  organization_admin: ORGANIZATION_ADMIN_PERMISSIONS,
  clinical_supervisor: SUPERVISOR_PERMISSIONS,
  therapist: THERAPIST_DEFAULTS,
  parent: PARENT_PERMISSIONS,
  reviewer: REVIEWER_DEFAULTS,
};

export const ORGANIZATION_ADMIN_REQUIRED: readonly Permission[] = [
  PERMISSIONS.teamMembershipManage,
  PERMISSIONS.settingsManage,
];

const MUTATING = new Set(PERMISSION_CATALOG.filter((item) => item.mutates).map((item) => item.key));

export function isRole(value: string): value is Role {
  return (Object.values(ROLES) as string[]).includes(value);
}

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as readonly string[]).includes(value);
}

export function permissionsForRole(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function ceilingForRole(role: Role): readonly Permission[] {
  return ROLE_CEILINGS[role];
}

export function isMutatingPermission(permission: Permission): boolean {
  return MUTATING.has(permission);
}

export function hasPermission(permissions: readonly Permission[], required: Permission): boolean {
  return permissions.includes(required);
}

export function effectivePermissions(role: Role, granted: readonly Permission[] | null): Permission[] {
  const ceiling = new Set(ceilingForRole(role));
  const source = granted ?? permissionsForRole(role);
  return ALL_PERMISSIONS.filter((permission) => source.includes(permission) && ceiling.has(permission));
}

export function grantViolation(role: Role, requested: readonly string[]): string | null {
  if (role === ROLES.platformAdmin) {
    return 'Platform administrator access cannot be customized.';
  }
  const ceiling = new Set<string>(ceilingForRole(role));
  if (requested.some((permission) => !isPermission(permission) || !ceiling.has(permission))) {
    return 'That permission is outside the platform limit for this role.';
  }
  if (role === ROLES.organizationAdmin && ORGANIZATION_ADMIN_REQUIRED.some((permission) => !requested.includes(permission))) {
    return 'Organization administrators must keep membership and settings management.';
  }
  return null;
}
