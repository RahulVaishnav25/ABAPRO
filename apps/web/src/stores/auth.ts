import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { PARENT_ACCESS_PENDING_MESSAGE, type AuthUser, type Permission } from '@abapro/shared';
import { ApiError } from '@/api/client';
import { currentUserRequest, logoutRequest, switchClinicRequest, switchOrganizationRequest } from '@/api/resources';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null);
  const ready = ref(false);
  const switching = ref(false);
  /** Why the last session ended, shown on the sign-in page. */
  const signedOutReason = ref<'parent_pending' | null>(null);

  const isAuthenticated = computed(() => Boolean(user.value));

  function can(permission: Permission): boolean {
    return user.value?.permissions.includes(permission) ?? false;
  }

  function clearSession(): void {
    user.value = null;
  }

  async function restore(): Promise<void> {
    try {
      user.value = await currentUserRequest();
      signedOutReason.value = null;
    } catch (restoreError) {
      user.value = null;
      // A parent whose last linked child was removed is told why on the sign-in page.
      if (restoreError instanceof ApiError && restoreError.message === PARENT_ACCESS_PENDING_MESSAGE) signedOutReason.value = 'parent_pending';
    } finally {
      ready.value = true;
    }
  }

  async function switchOrganization(organizationId: string, clinicId?: string): Promise<void> {
    switching.value = true;
    try {
      user.value = await switchOrganizationRequest(organizationId, clinicId);
    } finally {
      switching.value = false;
    }
  }

  async function switchClinic(clinicId: string): Promise<void> {
    switching.value = true;
    try {
      user.value = await switchClinicRequest(clinicId);
    } finally {
      switching.value = false;
    }
  }

  async function logout(): Promise<string | null> {
    try {
      const result = await logoutRequest();
      user.value = null;
      return result.endSessionUrl;
    } catch {
      user.value = null;
      return null;
    }
  }

  return {
    user,
    ready,
    switching,
    isAuthenticated,
    can,
    restore,
    signedOutReason,
    switchOrganization,
    switchClinic,
    logout,
    clearSession,
  };
});
