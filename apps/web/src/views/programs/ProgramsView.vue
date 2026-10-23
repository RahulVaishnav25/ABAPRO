<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { ClientDirectoryItem, ProgramSummary, ProgramTemplate } from '@abapro/shared';
import { clientDirectoryRequest } from '@/api/clients';
import { copyProgramTemplateRequest, programTemplatesRequest, programsRequest } from '@/api/programs';
import { ApiError } from '@/api/client';
import AppButton from '@/components/ui/AppButton.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';

const auth = useAuthStore();
const toast = useToastStore();
const router = useRouter();
const loading = ref(true);
const error = ref('');
const programs = ref<ProgramSummary[]>([]);
const templates = ref<ProgramTemplate[]>([]);
const clients = ref<ClientDirectoryItem[]>([]);
const copyClientId = ref('');

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    programs.value = await programsRequest();
    templates.value = await programTemplatesRequest();
    clients.value = (await clientDirectoryRequest({ pageSize: 50 })).items;
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'Programs could not be loaded.';
  } finally {
    loading.value = false;
  }
}

async function copy(templateId: string): Promise<void> {
  if (!copyClientId.value) return;
  try {
    const program = await copyProgramTemplateRequest(templateId, copyClientId.value);
    toast.push({ tone: 'success', title: 'Program copied', message: 'The client program is now independent of the template.' });
    await router.push(`/programs/${program.id}`);
  } catch (copyError) {
    toast.push({ tone: 'danger', title: 'Program was not copied', message: copyError instanceof ApiError ? copyError.message : 'Try again.' });
  }
}

onMounted(() => void load());
</script>

<template>
  <PageContainer>
    <PageHeader title="Programs" description="Client programs are separate from reusable templates. Editing a template does not change programs already copied.">
      <template #actions>
        <AppButton v-if="auth.can('programs.edit')" variant="secondary" @click="router.push('/programs/templates/new')">New template</AppButton>
        <AppButton v-if="auth.can('programs.edit')" @click="router.push('/programs/new')">New program</AppButton>
      </template>
    </PageHeader>
    <SkeletonBlock v-if="loading" height="220px" />
    <ErrorState v-else-if="error" title="Programs unavailable" :description="error" @retry="load" />
    <template v-else>
      <section class="panel stack">
        <h2>Client programs</h2>
        <EmptyState v-if="programs.length === 0" title="No programs" description="Create a program for a client or copy a template." />
        <button v-for="program in programs" :key="program.id" class="row" type="button" @click="router.push(`/programs/${program.id}`)">
          <strong>{{ program.title }}</strong>
          <span>{{ program.clientName }} · {{ program.targetCount }} targets · {{ program.measurementType }}</span>
          <span>Start {{ program.startedOn || 'not set' }} · Review {{ program.reviewOn || 'not set' }}</span>
          <StatusBadge :tone="program.status === 'active' ? 'success' : 'neutral'" :label="program.status" />
        </button>
      </section>
      <section class="panel stack">
        <h2>Templates</h2>
        <AppSelect v-if="auth.can('programs.edit')" v-model="copyClientId" label="Copy into client" :options="[{ value: '', label: 'Select a client' }, ...clients.map((client) => ({ value: client.id, label: client.displayName }))]" />
        <EmptyState v-if="templates.length === 0" title="No templates" description="A template is a starting copy. It is not the client’s program." />
        <article v-for="template in templates" :key="template.id">
          <strong>{{ template.title }}</strong>
          <p>{{ template.objective || 'No objective' }} · {{ template.targets.length }} targets · {{ template.measurementType }}</p>
          <AppButton v-if="auth.can('programs.edit')" type="button" variant="secondary" :disabled="!copyClientId" @click="copy(template.id)">Copy to client</AppButton>
        </article>
      </section>
    </template>
  </PageContainer>
</template>

<style scoped>
.stack { display: grid; gap: 12px; }
.row { display: grid; gap: 4px; text-align: left; padding: 12px; border: 0; border-bottom: 1px solid var(--color-border); background: transparent; cursor: pointer; }
h2 { margin: 0; }
</style>
