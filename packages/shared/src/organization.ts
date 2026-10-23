import type { AuthUser } from './auth';
import type { Role } from './permissions';

export const LOCALES = ['en', 'en-US', 'en-GB', 'en-CA', 'es', 'es-MX', 'fr', 'fr-CA'] as const;

export type AppLocale = (typeof LOCALES)[number];

export const INVITABLE_ROLES = [
  'organization_admin',
  'clinical_supervisor',
  'therapist',
  'parent',
  'reviewer',
] as const satisfies readonly Role[];

export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export interface InvitationDraft {
  email: string;
  role: InvitableRole;
}

export interface CreateOrganizationRequest {
  name: string;
  contactEmail: string;
  contactPhone?: string;
  country: string;
  address?: string;
  companyIdentificationNumber?: string;
  taxNumber?: string;
  timezone: string;
  locale: AppLocale;
  primaryColor: string;
  logoContentType?: string;
  logoBase64?: string;
  invites: InvitationDraft[];
  clinics?: ClinicDraft[];
}

export interface UpdateOrganizationRequest {
  name: string;
  contactEmail: string;
  contactPhone: string;
  country: string;
  address?: string;
  companyIdentificationNumber?: string;
  taxNumber?: string;
}

export interface ClinicDraft {
  name: string;
  location: string;
  address?: string;
  contactEmail?: string;
  contactPhone?: string;
}

export interface OrganizationDirectoryClient {
  id: string;
  displayName: string;
  clientCode: string;
  status: string;
}

export interface OrganizationDirectoryUser {
  userId: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
}

export interface OrganizationDirectoryClinic {
  id: string;
  name: string;
  location: string;
  address: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  clientCount: number;
  clients: OrganizationDirectoryClient[];
  users: OrganizationDirectoryUser[];
}

export interface OrganizationMemberAccess {
  userId: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  clinicIds: string[];
}

export interface OrganizationDirectoryPage {
  items: OrganizationDirectoryItem[];
  total: number;
  page: number;
  pageSize: number;
  countries: string[];
}

export interface OrganizationDirectoryItem {
  id: string;
  name: string;
  contactEmail: string;
  contactPhone: string | null;
  country: string;
  address: string | null;
  companyIdentificationNumber: string | null;
  taxNumber: string | null;
  timezone: string;
  createdAt: string;
  member: boolean;
  clinics: OrganizationDirectoryClinic[];
  members: OrganizationMemberAccess[];
}

export interface ClinicDirectoryChild {
  id: string;
  displayName: string;
  clientCode: string;
  status: 'active' | 'inactive';
}

export interface ClinicDirectoryItem {
  id: string;
  name: string;
  location: string;
  address: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  organizationId: string;
  organizationName: string;
  country: string;
  childCount: number;
}

export interface ClinicDirectoryPage {
  items: ClinicDirectoryItem[];
  total: number;
  page: number;
  pageSize: number;
  organizations: Array<{ id: string; name: string }>;
  countries: string[];
}

export interface ClinicDetail extends ClinicDirectoryItem {
  children: ClinicDirectoryChild[];
}

export interface OrganizationSettingsView {
  organizationId: string;
  displayName: string;
  contactEmail: string;
  contactPhone: string | null;
  country: string;
  timezone: string;
  locale: string;
  primaryColor: string;
  hasLogo: boolean;
}

export interface InvitationCreated {
  status: 'invitation_sent';
  delivery: 'development-mailbox' | 'not-configured';
}

export interface SessionUserResponse {
  user: AuthUser;
}
