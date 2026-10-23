<script setup lang="ts">
import { useRouter } from 'vue-router';
import AppButton from '@/components/ui/AppButton.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();
</script>

<template>
  <PageContainer>
    <PageHeader title="Access denied" description="Your role does not include permission to open this page." />
    <AppButton variant="secondary" @click="router.push({ name: auth.user?.platformAdmin ? 'platform-dashboard' : 'dashboard' })">Back to dashboard</AppButton>
  </PageContainer>
</template>
