<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import CopyrightFooter from '@/components/CopyrightFooter.vue';
import AppButton from '@/components/ui/AppButton.vue';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();
const { t } = useI18n();

function goHome(): void {
  void router.push(auth.isAuthenticated ? { name: auth.user?.platformAdmin ? 'platform-dashboard' : 'dashboard' } : { name: 'login' });
}
</script>

<template>
  <div class="missing-shell">
    <main class="missing">
      <p class="code" aria-hidden="true">404</p>
      <h1>{{ t('pages.notFound.title') }}</h1>
      <p class="missing-text">{{ t('pages.notFound.description') }}</p>
      <AppButton icon="arrow-left" @click="goHome">{{ auth.isAuthenticated ? t('pages.notFound.dashboard') : t('pages.notFound.signIn') }}</AppButton>
    </main>
    <CopyrightFooter />
  </div>
</template>

<style scoped>
.missing-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--color-bg);
}

.missing {
  display: grid;
  flex: 1;
  justify-items: center;
  align-content: center;
  gap: var(--space-3);
  padding: var(--space-8) var(--space-4);
  text-align: center;
}

.code {
  color: var(--color-primary);
  font-size: 3.5rem;
  font-weight: 700;
  letter-spacing: -0.04em;
  line-height: 1;
}

h1 {
  font-size: var(--text-2xl);
}

.missing-text {
  max-width: 44ch;
  margin-bottom: var(--space-2);
  color: var(--color-text-muted);
}
</style>
