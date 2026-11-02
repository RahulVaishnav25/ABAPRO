<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { acceptInvitationRequest } from '@/api/resources';
import AppButton from '@/components/ui/AppButton.vue';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { errorMessage } from '@/lib/loader';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const toast = useToastStore();
const { t } = useI18n();
const error = ref('');
const saving = ref(false);

const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''));
const signInHref = computed(() => `/api/v1/auth/login?returnTo=${encodeURIComponent(route.fullPath)}`);

async function accept(): Promise<void> {
  error.value = '';
  if (!token.value) {
    error.value = t('pages.invite.invalid');
    return;
  }
  saving.value = true;
  try {
    auth.user = await acceptInvitationRequest(token.value);
    toast.push({ tone: 'success', title: t('pages.invite.accepted'), message: auth.user.organization?.name });
    await router.push('/');
  } catch (acceptError) {
    error.value = errorMessage(acceptError, t('pages.invite.error'));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="accept">
    <section>
      <p class="eyebrow">{{ t('pages.invite.eyebrow') }}</p>
      <h1>{{ t('pages.invite.title') }}</h1>
      <p v-if="!token" class="form-error" role="alert">{{ t('pages.invite.invalid') }}</p>
      <template v-else-if="!auth.isAuthenticated">
        <p>{{ t('pages.invite.signInFirst') }}</p>
        <a class="action" :href="signInHref">{{ t('pages.invite.signIn') }}</a>
      </template>
      <template v-else>
        <p>{{ t('pages.invite.signedInAs', { email: auth.user?.email ?? '' }) }}</p>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <AppButton :loading="saving" @click="accept">{{ t('pages.invite.accept') }}</AppButton>
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
