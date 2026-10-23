<script setup lang="ts">
import { useRouter } from 'vue-router';
import CopyrightFooter from '@/components/CopyrightFooter.vue';
import AppButton from '@/components/ui/AppButton.vue';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();

function goHome(): void {
  void router.push(auth.isAuthenticated ? { name: auth.user?.platformAdmin ? 'platform-dashboard' : 'dashboard' } : { name: 'login' });
}
</script>

<template>
  <div class="missing-shell">
    <main class="missing">
      <p class="eyebrow">ABAPro</p>
      <h1>Page not found</h1>
      <p>That address is not part of the application.</p>
      <AppButton @click="goHome">{{ auth.isAuthenticated ? 'Go to dashboard' : 'Go to sign in' }}</AppButton>
    </main>
    <CopyrightFooter />
  </div>
</template>

<style scoped>
.missing-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.missing {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  padding: 32px;
  max-width: 560px;
}

.eyebrow {
  font-weight: 700;
  color: var(--color-primary);
}

p:last-of-type {
  color: var(--color-text-muted);
  margin-bottom: 8px;
}
</style>
