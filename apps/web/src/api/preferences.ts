import type { EffectivePreferences, RegionalSettings, UserPreferences } from '@abapro/shared';
import { apiRequest } from './client';

export interface MyPreferences {
  user: UserPreferences;
  effective: EffectivePreferences;
}

export function myPreferencesRequest(): Promise<MyPreferences> {
  return apiRequest('/me/preferences');
}

export function saveMyPreferencesRequest(body: UserPreferences): Promise<MyPreferences> {
  return apiRequest('/me/preferences', { method: 'PUT', body });
}

export function organizationRegionalRequest(): Promise<RegionalSettings> {
  return apiRequest('/organization/regional');
}

export function saveOrganizationRegionalRequest(body: RegionalSettings): Promise<RegionalSettings> {
  return apiRequest('/organization/regional', { method: 'PUT', body });
}

export function platformRegionalRequest(): Promise<RegionalSettings> {
  return apiRequest('/platform/regional');
}

export function savePlatformRegionalRequest(body: RegionalSettings): Promise<RegionalSettings> {
  return apiRequest('/platform/regional', { method: 'PUT', body });
}
