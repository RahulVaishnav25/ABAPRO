<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { featureByKey, type UnimplementedModuleResponse } from '@abapro/shared';
import { useRoute } from 'vue-router';
import { moduleStatusRequest } from '@/api/resources';
import AppTextarea from '@/components/ui/AppTextarea.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import FileUpload from '@/components/ui/FileUpload.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';

const route = useRoute();
const loading = ref(true);
const error = ref('');
const status = ref<UnimplementedModuleResponse | null>(null);
const draft = ref('');
const files = ref<File[]>([]);

const feature = computed(() => featureByKey(String(route.meta.featureKey)));

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  status.value = null;
  try {
    status.value = await moduleStatusRequest(feature.value.apiPath);
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'This page could not be loaded.';
  } finally {
    loading.value = false;
  }
}

watch(() => route.fullPath, () => void load(), { immediate: true });
</script>

<template>
  <PageContainer>
    <PageHeader :title="feature.title" :description="feature.description" />
    <SkeletonBlock v-if="loading" height="160px" />
    <ErrorState v-else-if="error" title="This section is unavailable" :description="error" @retry="load" />
    <section v-else class="panel state-card">
      <EmptyState title="Not implemented yet" :description="status?.message" />
      <FileUpload
        v-if="feature.key === 'settings'"
        v-model="files"
        disabled
        label="Organization logo"
        hint="Private file storage is not connected. This control stays disabled until organization settings are implemented."
      />
      <AppTextarea
        v-if="feature.key === 'messages'"
        v-model="draft"
        disabled
        label="Message"
        hint="Messages are not implemented yet. This field does not send anything."
        placeholder="Write a message"
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
