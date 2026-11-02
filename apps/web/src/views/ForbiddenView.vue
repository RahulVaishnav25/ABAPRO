<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import AppButton from '@/components/ui/AppButton.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();
const { t } = useI18n();
</script>

<template>
  <PageContainer>
    <EmptyState icon="alert" :title="t('pages.forbidden.title')" :description="t('pages.forbidden.description')">
      <template #actions>
        <AppButton variant="secondary" icon="arrow-left" @click="router.push({ name: auth.user?.platformAdmin ? 'platform-dashboard' : 'dashboard' })">
          {{ t('pages.forbidden.back') }}
        </AppButton>
      </template>
    </EmptyState>
  </PageContainer>
</template>
