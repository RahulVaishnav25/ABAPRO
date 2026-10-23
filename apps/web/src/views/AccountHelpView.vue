<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AuthSplit from '@/components/auth/AuthSplit.vue';

const route = useRoute();
const kind = computed(() => {
  if (route.name === 'forgot-password') return 'password';
  if (route.name === 'contact') return 'contact';
  return 'account';
});
</script>

<template>
  <AuthSplit>
    <article class="help-card">
      <template v-if="kind === 'password'">
        <h2>Forgot password</h2>
        <p>
          Your organisation administrator sets a new password for you. ABAPro does not email a reset link. Ask them to update your sign-in, then come back and sign in with the new password.
        </p>
      </template>
      <template v-else-if="kind === 'contact'">
        <h2>Contact us</h2>
        <p>
          For a new account or a new password, contact your organisation administrator. For questions about ABAPro, contact Techieora Private Limited.
        </p>
      </template>
      <template v-else>
        <h2>Need an account?</h2>
        <p>
          There is no public registration. Your organisation administrator, or the platform administrator, creates the email and password you use to sign in.
        </p>
      </template>
      <RouterLink class="back" :to="{ name: 'login' }">Back to sign in</RouterLink>
    </article>
  </AuthSplit>
</template>

<style scoped>
.help-card {
  width: min(440px, 100%);
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 28px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.help-card p {
  color: var(--color-text-muted);
}

.back {
  font-weight: 700;
  text-decoration: none;
}
</style>
