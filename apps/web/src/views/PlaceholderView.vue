<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { featureByKey, type UnimplementedModuleResponse } from '@abapro/shared';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { routeTitle } from '@/i18n';
import { moduleStatusRequest } from '@/api/resources';
import AppTextarea from '@/components/ui/AppTextarea.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import FileUpload from '@/components/ui/FileUpload.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import { useLoader } from '@/lib/loader';

const route = useRoute();
const { t } = useI18n();
const title = computed(() => routeTitle(route) || feature.value.title);
const status = ref<UnimplementedModuleResponse | null>(null);
const draft = ref('');
const files = ref<File[]>([]);

const feature = computed(() => featureByKey(String(route.meta.featureKey)));

const { loading, error, load } = useLoader(async () => {
  status.value = null;
  status.value = await moduleStatusRequest(feature.value.apiPath);
}, t('pages.placeholder.error'));

watch(() => route.fullPath, () => void load(), { immediate: true });
</script>

<template>
  <PageContainer>
    <PageHeader :title="title" :description="feature.description" />
    <SkeletonBlock v-if="loading" height="160px" />
    <ErrorState v-else-if="error" :title="t('pages.placeholder.unavailable')" :description="error" @retry="load" />
    <section v-else class="settings-card state-card">
      <EmptyState icon="info" :title="t('pages.placeholder.notReady')" :description="status?.message" />
      <FileUpload
        v-if="feature.key === 'settings'"
        v-model="files"
        disabled
        :label="t('pages.placeholder.logo')"
        :hint="t('pages.placeholder.logoHint')"
      />
      <AppTextarea
        v-if="feature.key === 'messages'"
        v-model="draft"
        disabled
        :label="t('pages.placeholder.message')"
        :hint="t('pages.placeholder.messageHint')"
        :placeholder="t('pages.placeholder.messagePlaceholder')"
      />
    </section>
  </PageContainer>
</template>

<style scoped>
.state-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 16px 20px;
}
</style>
