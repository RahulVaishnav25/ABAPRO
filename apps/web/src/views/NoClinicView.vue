<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import EmptyState from '@/components/ui/EmptyState.vue';
import PageContainer from '@/components/ui/PageContainer.vue';

const { t } = useI18n();
</script>

<template>
  <PageContainer>
    <EmptyState icon="clinics" :title="t('clinics.none.title')" :description="t('clinics.none.description')" />
  </PageContainer>
</template>
