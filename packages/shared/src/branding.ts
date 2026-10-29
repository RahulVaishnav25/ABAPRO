export interface PlatformBranding {
  portalName: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  secondaryColor: string;
  loginHeadline: string;
  loginSubtitle: string;
  updatedAt?: string;
}

export interface OrganizationBranding {
  organizationId: string;
  portalName: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  secondaryColor: string;
  updatedAt?: string;
}

export const DEFAULT_PLATFORM_BRANDING: PlatformBranding = {
  portalName: 'ABAPro',
  logoUrl: '',
  faviconUrl: '',
  primaryColor: '#0e6b62',
  secondaryColor: '#18794e',
  loginHeadline: 'Better care starts with clarity.',
  loginSubtitle: "One simple workspace for your team, your sessions, and every client's progress.",
};

export const DEFAULT_ORGANIZATION_BRANDING: Omit<OrganizationBranding, 'organizationId'> = {
  portalName: '',
  logoUrl: '',
  faviconUrl: '',
  primaryColor: '#0e6b62',
  secondaryColor: '#18794e',
};
