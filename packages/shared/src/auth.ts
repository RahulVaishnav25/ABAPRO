import type { Permission, Role } from './permissions';

export interface OrganizationSummary {
  id: string;
  name: string;
  timezone: string;
}

export interface ClinicSummary {
  id: string;
  name: string;
  location: string;
  address: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  platformAdmin: boolean;
  role: Role | null;
  roleLabel: string | null;
  organization: OrganizationSummary | null;
  organizations: OrganizationSummary[];
  clinic: ClinicSummary | null;
  clinics: ClinicSummary[];
  permissions: Permission[];
  /**
   * A parent account with no linked child yet, and no other organisation to use. Such an account cannot sign in;
   * the API refuses the sign-in and ends any session it still has.
   */
  parentAccessPending?: boolean;
}

export const PARENT_ACCESS_PENDING_MESSAGE =
  'Your parent account is not active yet. You can sign in once the clinic links your child to your account.';

export interface AuthProviderInfo {
  passwordResetEnabled: boolean;
  embeddedIdentity: boolean;
  mailboxUrl: string | null;
}

export interface SignInAccount {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  platformAdmin: boolean;
}

export interface LogoutResult {
  endSessionUrl: string | null;
}

export interface UnimplementedModuleResponse {
  implemented: false;
  module: string;
  title: string;
  message: string;
}
