<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import AuthSplit from '@/components/auth/AuthSplit.vue';
import AppIcon from '@/components/navigation/AppIcon.vue';

const route = useRoute();
const { t } = useI18n();
const kind = computed(() => {
  if (route.name === 'forgot-password') return 'password';
  if (route.name === 'contact') return 'contact';
  return 'account';
});
</script>

<template>
  <AuthSplit>
    <article class="help-card">
      <span class="help-icon" aria-hidden="true"><AppIcon :name="kind === 'password' ? 'info' : kind === 'contact' ? 'notification' : 'user'" :size="20" /></span>
      <h2>{{ t(`pages.help.${kind}Title`) }}</h2>
      <p>{{ t(`pages.help.${kind}`) }}</p>
      <RouterLink class="back" :to="{ name: 'login' }">
        <AppIcon name="arrow-left" :size="16" class="flip-rtl" />
        {{ t('pages.help.back') }}
      </RouterLink>
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

.help-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--color-primary-soft);
  color: var(--color-primary-ink);
}

.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--color-primary-ink);
  font-weight: 600;
  text-decoration: none;
}

.back:hover,
.back:focus-visible {
  text-decoration: underline;
}
</style>
