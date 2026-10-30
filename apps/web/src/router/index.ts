import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { APP_FEATURES, PERMISSIONS } from '@abapro/shared';
import { useAuthStore } from '@/stores/auth';
import { safeRedirect } from '@/lib/redirect';

const AppLayout = () => import('@/layouts/AppLayout.vue');
const AuthLayout = () => import('@/layouts/AuthLayout.vue');
const DashboardView = () => import('@/views/DashboardView.vue');
const ForbiddenView = () => import('@/views/ForbiddenView.vue');
const LoginView = () => import('@/views/LoginView.vue');
const AccountHelpView = () => import('@/views/AccountHelpView.vue');
const NotFoundView = () => import('@/views/NotFoundView.vue');
const OnboardingView = () => import('@/views/OnboardingView.vue');
const AcceptInvitationView = () => import('@/views/AcceptInvitationView.vue');
const SettingsView = () => import('@/views/SettingsView.vue');
const TeamView = () => import('@/views/TeamView.vue');
const ClientsView = () => import('@/views/clients/ClientsView.vue');
const ClientFormView = () => import('@/views/clients/ClientFormView.vue');
const ClientProfileView = () => import('@/views/clients/ClientProfileView.vue');
const AssessmentsView = () => import('@/views/programs/AssessmentsView.vue');
const AssessmentFormView = () => import('@/views/programs/AssessmentFormView.vue');
const ProgramsView = () => import('@/views/programs/ProgramsView.vue');
const TasksView = () => import('@/views/programs/TasksView.vue');
const TaskDetailView = () => import('@/views/programs/TaskDetailView.vue');
const TaskEditView = () => import('@/views/programs/TaskEditView.vue');
const ProgramFormView = () => import('@/views/programs/ProgramFormView.vue');
const ProgramDetailView = () => import('@/views/programs/ProgramDetailView.vue');
const OrganizationsView = () => import('@/views/OrganizationsView.vue');
const ClinicsView = () => import('@/views/ClinicsView.vue');
const ClinicDetailView = () => import('@/views/ClinicDetailView.vue');
const OrganizationOnboardingView = () => import('@/views/OrganizationOnboardingView.vue');
const OrganizationDetailView = () => import('@/views/OrganizationDetailView.vue');
const NoClinicView = () => import('@/views/NoClinicView.vue');
const PlaceholderView = () => import('@/views/PlaceholderView.vue');

const shellTitles: Partial<Record<string, string>> = {
  dashboard: 'Dashboard',
  clients: 'Clients',
  settings: 'Settings',
};

const featureRoutes: RouteRecordRaw[] = APP_FEATURES.map((feature) => ({
  path: feature.route === '/' ? '' : feature.route.replace(/^\//, ''),
  name: feature.key,
  component:
    feature.key === 'settings'
      ? SettingsView
      : feature.key === 'team'
        ? TeamView
        : feature.key === 'clients'
          ? ClientsView
          : feature.key === 'assessments'
            ? AssessmentsView
            : feature.key === 'programs'
              ? ProgramsView
              : feature.implemented
                ? DashboardView
                : PlaceholderView,
  meta: {
    title: shellTitles[feature.key] ?? feature.title,
    permission: feature.key === 'settings' ? undefined : feature.permission,
    anyPermission: feature.key === 'settings' ? [PERMISSIONS.settingsView, PERMISSIONS.teamView] : undefined,
    breadcrumb: shellTitles[feature.key] ?? feature.title,
    featureKey: feature.key,
  },
}));

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      component: AuthLayout,
      meta: { public: true },
      children: [
        {
          path: '',
          name: 'login',
          component: LoginView,
          meta: { public: true, title: 'Sign in' },
        },
      ],
    },
    {
      path: '/',
      component: AppLayout,
      children: [
        {
          path: 'clients/new',
          name: 'client-create',
          component: ClientFormView,
          meta: { title: 'New client', breadcrumb: 'New client', permission: PERMISSIONS.clientsCreate },
        },
        {
          path: 'clients/:clientId/edit',
          name: 'client-edit',
          component: ClientFormView,
          meta: { title: 'Edit client', breadcrumb: 'Edit client', permission: PERMISSIONS.clientsEdit },
        },
        {
          path: 'clients/:clientId',
          name: 'client-profile',
          component: ClientProfileView,
          meta: { title: 'Client', breadcrumb: 'Client', permission: PERMISSIONS.clientsView },
        },
        {
          path: 'assessments/new',
          name: 'assessment-new',
          component: AssessmentFormView,
          meta: { title: 'New assessment', breadcrumb: 'New assessment', permission: PERMISSIONS.assessmentsCreate },
        },
        {
          path: 'assessments/:assessmentId/edit',
          name: 'assessment-edit',
          component: AssessmentFormView,
          meta: { title: 'Edit assessment', breadcrumb: 'Edit assessment', permission: PERMISSIONS.assessmentsCreate },
        },
        {
          path: 'assessments/:assessmentId',
          name: 'assessment-detail',
          component: AssessmentFormView,
          meta: { title: 'Assessment', breadcrumb: 'Assessment', permission: PERMISSIONS.assessmentsView },
        },
        {
          path: 'programs/tasks',
          name: 'tasks',
          component: TasksView,
          meta: { title: 'Tasks', breadcrumb: 'Tasks', permission: PERMISSIONS.programsView },
        },
        {
          path: 'tasks',
          redirect: '/programs/tasks',
        },
        {
          path: 'programs/tasks/:taskId',
          name: 'task-detail',
          component: TaskDetailView,
          meta: { title: 'Task preview', breadcrumb: 'Task preview', permission: PERMISSIONS.programsView },
        },
        {
          path: 'tasks/:taskId',
          redirect: (to) => `/programs/tasks/${String(to.params.taskId)}`,
        },
        {
          path: 'programs/tasks/:taskId/edit',
          name: 'task-edit',
          component: TaskEditView,
          meta: { title: 'Edit task', breadcrumb: 'Edit task', permission: PERMISSIONS.programsView },
        },
        {
          path: 'tasks/:taskId/edit',
          redirect: (to) => `/programs/tasks/${String(to.params.taskId)}/edit`,
        },
        {
          path: 'programs/new',
          name: 'program-new',
          component: ProgramFormView,
          meta: { title: 'New program', breadcrumb: 'New program', permission: PERMISSIONS.programsEdit },
        },
        {
          path: 'programs/:programId/edit',
          name: 'program-edit',
          component: ProgramFormView,
          meta: { title: 'Edit program', breadcrumb: 'Edit program', permission: PERMISSIONS.programsEdit },
        },
        {
          path: 'programs/:programId',
          name: 'program-detail',
          component: ProgramDetailView,
          meta: { title: 'Program', breadcrumb: 'Program', permission: PERMISSIONS.programsView },
        },
        {
          path: 'platform',
          name: 'platform-dashboard',
          component: DashboardView,
          meta: { title: 'Dashboard', breadcrumb: 'Dashboard', platformAdmin: true },
        },
        {
          path: 'organizations',
          name: 'organizations',
          component: OrganizationsView,
          meta: { title: 'Organisations', breadcrumb: 'Organisations', platformAdmin: true },
        },
        {
          path: 'organizations/new',
          name: 'organization-new',
          component: OrganizationOnboardingView,
          meta: { title: 'Create organisation', breadcrumb: 'Create organisation', platformAdmin: true },
        },
        {
          path: 'organizations/:organizationId',
          name: 'organization-detail',
          component: OrganizationDetailView,
          meta: { title: 'Organisation', breadcrumb: 'Organisation' },
        },
        {
          path: 'clinics',
          name: 'clinics',
          component: ClinicsView,
          meta: { title: 'Clinics', breadcrumb: 'Clinics' },
        },
        {
          path: 'clinics/:clinicId',
          name: 'clinic-detail',
          component: ClinicDetailView,
          meta: { title: 'Clinic', breadcrumb: 'Clinic' },
        },
        {
          path: 'no-clinic',
          name: 'no-clinic',
          component: NoClinicView,
          meta: { title: 'No clinic yet', breadcrumb: 'No clinic yet' },
        },
        ...featureRoutes,
        {
          path: 'forbidden',
          name: 'forbidden',
          component: ForbiddenView,
          meta: { title: 'Access denied', breadcrumb: 'Access denied' },
        },
      ],
    },
    {
      path: '/forgot-password',
      component: AuthLayout,
      meta: { public: true },
      children: [
        {
          path: '',
          name: 'forgot-password',
          component: AccountHelpView,
          meta: { public: true, title: 'Forgot password' },
        },
      ],
    },
    {
      path: '/account-access',
      component: AuthLayout,
      meta: { public: true },
      children: [
        {
          path: '',
          name: 'account-access',
          component: AccountHelpView,
          meta: { public: true, title: 'Need an account?' },
        },
      ],
    },
    {
      path: '/contact',
      component: AuthLayout,
      meta: { public: true },
      children: [
        {
          path: '',
          name: 'contact',
          component: AccountHelpView,
          meta: { public: true, title: 'Contact us' },
        },
      ],
    },
    {
      path: '/onboarding',
      component: AuthLayout,
      children: [
        {
          path: '',
          name: 'onboarding',
          component: OnboardingView,
          meta: { title: 'Create organization' },
        },
      ],
    },
    {
      path: '/invitations/accept',
      component: AuthLayout,
      meta: { public: true },
      children: [
        {
          path: '',
          name: 'accept-invitation',
          component: AcceptInvitationView,
          meta: { public: true, title: 'Accept invitation' },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: NotFoundView,
      meta: { public: true, title: 'Page not found' },
    },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.ready) {
    await auth.restore();
  }

  const isPublic = to.matched.some((record) => record.meta.public);
  if (!isPublic && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.meta.platformAdmin && auth.isAuthenticated && !auth.user?.platformAdmin) {
    return { name: 'forbidden' };
  }
  if (auth.isAuthenticated && auth.user?.platformAdmin && to.name === 'dashboard') {
    return { name: 'platform-dashboard' };
  }
  if (auth.isAuthenticated && !auth.user?.organization && !isPublic) {
    const isClinicalRoute = to.path.startsWith('/programs') || to.path === '/tasks' || to.name === 'tasks';
    if (auth.user?.platformAdmin && isClinicalRoute) {
      try {
        const { apiRequest } = await import('@/api/client');
        const orgs = await apiRequest<{ items: Array<{ id: string }> }>('/organizations?pageSize=1');
        if (orgs.items.length > 0) {
          await auth.switchOrganization(orgs.items[0].id);
          return true;
        }
      } catch {
        return true;
      }
    }
    const directoryPage = to.name === 'settings' || to.name === 'organization-detail' || to.name === 'clinics' || to.name === 'clinic-detail';
    const platformPage = auth.user?.platformAdmin && (to.matched.some((record) => record.meta.platformAdmin) || directoryPage);
    const destination = auth.user?.platformAdmin ? 'platform-dashboard' : 'no-clinic';
    if (!platformPage && to.name !== destination) {
      return { name: destination };
    }
  }
  if (to.name === 'login' && auth.isAuthenticated) {
    if (!auth.user?.organization) {
      return { name: auth.user?.platformAdmin ? 'platform-dashboard' : 'no-clinic' };
    }
    return safeRedirect(to.query.redirect);
  }
  const allowed = to.meta.anyPermission;
  if (allowed?.length && auth.isAuthenticated && !allowed.some((permission) => auth.can(permission))) {
    if (auth.user?.platformAdmin) return true;
    return { name: 'forbidden' };
  }
  if (!allowed?.length && to.meta.permission && auth.isAuthenticated && !auth.can(to.meta.permission)) {
    if (auth.user?.platformAdmin) return true;
    return { name: 'forbidden' };
  }
  return true;
});

router.afterEach((to) => {
  const title = to.meta.title;
  document.title = title ? `${title} · ABAPro` : 'ABAPro';
});
