import type { OrganizationBranding, PlatformBranding } from '@abapro/shared';
import { apiRequest, encodedPath } from './client';

export function getPlatformBrandingRequest(): Promise<PlatformBranding> {
  return apiRequest<PlatformBranding>('/branding/platform');
}

export function updatePlatformBrandingRequest(dto: Partial<PlatformBranding>): Promise<PlatformBranding> {
  return apiRequest<PlatformBranding>('/branding/platform', {
    method: 'PUT',
    body: dto,
  });
}

export function resetPlatformBrandingRequest(): Promise<PlatformBranding> {
  return apiRequest<PlatformBranding>('/branding/platform/reset', {
    method: 'POST',
  });
}

export function getOrganizationBrandingRequest(organizationId: string): Promise<OrganizationBranding | null> {
  return apiRequest<OrganizationBranding | null>(encodedPath`/branding/organization/${organizationId}`);
}

export function updateOrganizationBrandingRequest(
  organizationId: string,
  dto: Partial<OrganizationBranding>,
): Promise<OrganizationBranding> {
  return apiRequest<OrganizationBranding>(encodedPath`/branding/organization/${organizationId}`, {
    method: 'PUT',
    body: dto,
  });
}

export function resetOrganizationBrandingRequest(organizationId: string): Promise<OrganizationBranding> {
  return apiRequest<OrganizationBranding>(encodedPath`/branding/organization/${organizationId}/reset`, {
    method: 'POST',
  });
}
