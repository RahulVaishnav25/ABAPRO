<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import LanguagePicker from '@/components/navigation/LanguagePicker.vue';
import { passwordLoginRequest } from '@/api/resources';
import AuthSplit from '@/components/auth/AuthSplit.vue';
import AppButton from '@/components/ui/AppButton.vue';
import AppInput from '@/components/ui/AppInput.vue';
import { safeRedirect } from '@/lib/redirect';
import { useAuthStore } from '@/stores/auth';
import { errorMessage } from '@/lib/loader';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { t } = useI18n();
const email = ref('');
const password = ref('');
const saving = ref(false);
// Set when a parent account without a linked child is signed out or refused.
const formError = ref(route.query.error === 'parent_pending' ? t('auth.parentPending') : route.query.error === 'session_expired' ? t('auth.sessionExpired') : '');

async function submit(): Promise<void> {
  formError.value = '';
  saving.value = true;
  try {
    auth.user = await passwordLoginRequest(email.value.trim(), password.value);
    if (!auth.user.organization) {
      await router.push(auth.user.platformAdmin ? '/platform' : '/no-clinic');
      return;
    }
    await router.push(safeRedirect(route.query.redirect));
  } catch (error) {
    formError.value = errorMessage(error, t('auth.wrongCredentials'));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AuthSplit>
    <div class="signin">
      <form class="login-card" @submit.prevent="submit">
        <h2>{{ t('auth.signIn') }}</h2>
        <p class="lede">{{ t('auth.signInLede') }}</p>
        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
        <AppInput v-model="email" :label="t('auth.email')" type="email" autocomplete="username" required />
        <div class="password-field">
          <AppInput v-model="password" :label="t('auth.password')" type="password" autocomplete="current-password" required />
          <RouterLink class="forgot" :to="{ name: 'forgot-password' }">{{ t('auth.forgotPassword') }}</RouterLink>
        </div>
        <AppButton type="submit" :loading="saving">{{ t('auth.signIn') }}</AppButton>
      </form>
      <p class="signin-links">
        <RouterLink :to="{ name: 'account-access' }">{{ t('auth.needAccount') }}</RouterLink>
        <RouterLink :to="{ name: 'contact' }">{{ t('auth.contactUs') }}</RouterLink>
      </p>
      <LanguagePicker class="signin-language" />
    </div>
  </AuthSplit>
</template>

<style scoped>
.signin-language {
  align-self: center;
}

.login-card {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 28px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.lede,
.form-error {
  color: var(--color-text-muted);
}

.form-error {
  color: var(--color-danger);
}

.signin {
  width: min(440px, 100%);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.password-field {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.password-field :deep(.field) {
  width: 100%;
}

.forgot {
  font-size: 0.92rem;
}

.signin-links {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin: 0;
}
</style>
