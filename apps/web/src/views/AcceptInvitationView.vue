<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { acceptInvitationRequest } from '@/api/resources';
import AppButton from '@/components/ui/AppButton.vue';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const toast = useToastStore();
const error = ref('');
const saving = ref(false);

const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''));
const signInHref = computed(() => `/api/v1/auth/login?returnTo=${encodeURIComponent(route.fullPath)}`);

async function accept(): Promise<void> {
  error.value = '';
  if (!token.value) {
    error.value = 'This invitation is no longer valid.';
    return;
  }
  saving.value = true;
  try {
    auth.user = await acceptInvitationRequest(token.value);
    toast.push({ tone: 'success', title: 'Invitation accepted', message: auth.user.organization?.name });
    await router.push('/');
  } catch (acceptError) {
    error.value = acceptError instanceof Error ? acceptError.message : 'This invitation could not be accepted.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="accept">
    <section>
      <p class="eyebrow">Invitation</p>
      <h1>Join an organization</h1>
      <p v-if="!token" class="form-error" role="alert">This invitation is no longer valid.</p>
      <template v-else-if="!auth.isAuthenticated">
        <p>Sign in with the email address that received this invitation, then accept it.</p>
        <a class="action" :href="signInHref">Sign in to accept</a>
      </template>
      <template v-else>
        <p>Signed in as {{ auth.user?.email }}. Accepting adds this organization to your account.</p>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <AppButton :loading="saving" @click="accept">Accept invitation</AppButton>
      </template>
    </section>
  </div>
</template>

<style scoped>
.accept {
  min-height: 100%;
  display: grid;
  place-items: center;
  padding: 24px;
}

section {
  width: min(480px, 100%);
  display: grid;
  gap: 12px;
  padding: 28px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.eyebrow {
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 0.78rem;
  color: var(--color-accent, #0e6b62);
}

.form-error { color: var(--color-danger); }

.action {
  display: inline-flex;
  justify-content: center;
  min-height: 44px;
  align-items: center;
  padding: 10px 16px;
  border-radius: 8px;
  background: #0e6b62;
  color: white;
  text-decoration: none;
  font-weight: 650;
}
</style>
