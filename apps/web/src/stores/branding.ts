import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import {
  DEFAULT_PLATFORM_BRANDING,
  type OrganizationBranding,
  type PlatformBranding,
} from '@abapro/shared';
import {
  getOrganizationBrandingRequest,
  getPlatformBrandingRequest,
  resetOrganizationBrandingRequest,
  resetPlatformBrandingRequest,
  updateOrganizationBrandingRequest,
  updatePlatformBrandingRequest,
} from '@/api/branding';
import { applyBrandingTheme } from '@/lib/theme';
import { useAuthStore } from './auth';

export const useBrandingStore = defineStore('branding', () => {
  const auth = useAuthStore();
  const loading = ref(false);
  const platformBranding = ref<PlatformBranding>({ ...DEFAULT_PLATFORM_BRANDING });
  const organizationBranding = ref<OrganizationBranding | null>(null);

  const effectiveBranding = computed<PlatformBranding>(() => {
    const platform = platformBranding.value;
    const org = organizationBranding.value;

    if (auth.user?.organization && org) {
      return {
        portalName: org.portalName || platform.portalName,
        logoUrl: org.logoUrl || platform.logoUrl,
        faviconUrl: org.faviconUrl || platform.faviconUrl,
        primaryColor: org.primaryColor || platform.primaryColor,
        secondaryColor: org.secondaryColor || platform.secondaryColor,
        loginHeadline: platform.loginHeadline,
        loginSubtitle: platform.loginSubtitle,
        updatedAt: org.updatedAt || platform.updatedAt,
      };
    }

    return platform;
  });

  async function initialize(): Promise<void> {
    loading.value = true;
    try {
      const platform = await getPlatformBrandingRequest();
      platformBranding.value = platform;
    } catch {
      // Fall back to default platform branding
    }

    if (auth.user?.organization?.id) {
      try {
        const org = await getOrganizationBrandingRequest(auth.user.organization.id);
        organizationBranding.value = org;
      } catch {
        organizationBranding.value = null;
      }
    } else {
      organizationBranding.value = null;
    }

    loading.value = false;
    applyEffectiveTheme();
  }

  function applyEffectiveTheme(): void {
    applyBrandingTheme({
      primaryColor: effectiveBranding.value.primaryColor,
      secondaryColor: effectiveBranding.value.secondaryColor,
      faviconUrl: effectiveBranding.value.faviconUrl,
      portalName: effectiveBranding.value.portalName,
    });
  }

  // Watch for changes in effective branding to update the live document
  watch(
    () => effectiveBranding.value,
    (branding) => {
      applyBrandingTheme({
        primaryColor: branding.primaryColor,
        secondaryColor: branding.secondaryColor,
        faviconUrl: branding.faviconUrl,
        portalName: branding.portalName,
      });
    },
    { deep: true },
  );

  // Watch for auth changes (e.g. logging in / switching orgs)
  watch(
    () => auth.user?.organization?.id,
    async (newOrgId) => {
      if (newOrgId) {
        try {
          const org = await getOrganizationBrandingRequest(newOrgId);
          organizationBranding.value = org;
        } catch {
          organizationBranding.value = null;
        }
      } else {
        organizationBranding.value = null;
      }
      applyEffectiveTheme();
    },
  );

  async function savePlatform(dto: Partial<PlatformBranding>): Promise<PlatformBranding> {
    const updated = await updatePlatformBrandingRequest(dto);
    platformBranding.value = updated;
    applyEffectiveTheme();
    return updated;
  }

  async function resetPlatform(): Promise<PlatformBranding> {
    const reset = await resetPlatformBrandingRequest();
    platformBranding.value = reset;
    applyEffectiveTheme();
    return reset;
  }

  async function saveOrganization(orgId: string, dto: Partial<OrganizationBranding>): Promise<OrganizationBranding> {
    const updated = await updateOrganizationBrandingRequest(orgId, dto);
    organizationBranding.value = updated;
    applyEffectiveTheme();
    return updated;
  }

  async function resetOrganization(orgId: string): Promise<OrganizationBranding> {
    const reset = await resetOrganizationBrandingRequest(orgId);
    organizationBranding.value = reset;
    applyEffectiveTheme();
    return reset;
  }

  return {
    loading,
    platformBranding,
    organizationBranding,
    effectiveBranding,
    initialize,
    applyEffectiveTheme,
    savePlatform,
    resetPlatform,
    saveOrganization,
    resetOrganization,
  };
});
