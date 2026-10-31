<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { ProgramCommunication } from '@abapro/shared';
import { communicationRequest } from '@/api/communication';
import AppTabs from '@/components/ui/AppTabs.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import { useLoader } from '@/lib/loader';
import AttachmentsPanel from './AttachmentsPanel.vue';
import HomeActivitiesPanel from './HomeActivitiesPanel.vue';
import NotesPanel from './NotesPanel.vue';

/** Notes, attachments and home activities for one program, shared with the child's parents. */
const props = defineProps<{ programId: string; legacyNotes: string }>();

const tab = ref('notes');
const data = ref<ProgramCommunication | null>(null);
const loader = useLoader(async () => {
  data.value = await communicationRequest(props.programId);
}, 'Notes and attachments could not be loaded.');

const attachmentCount = computed(() =>
  (data.value?.attachments.length ?? 0) + (data.value?.activities.reduce((sum, activity) => sum + activity.attachments.length, 0) ?? 0),
);
const tabs = computed(() => [
  { id: 'notes', label: `Notes (${data.value?.notes.length ?? 0})` },
  { id: 'attachments', label: `Attachments (${attachmentCount.value})` },
  { id: 'activities', label: `Home Activities (${data.value?.activities.filter((activity) => activity.status === 'active').length ?? 0} active)` },
]);

onMounted(() => void loader.load());
</script>

<template>
  <div class="communication">
    <ErrorState v-if="loader.error.value" title="Notes and attachments unavailable" :description="loader.error.value" @retry="loader.load" />
    <SkeletonBlock v-else-if="!data" height="220px" />
    <template v-else>
      <AppTabs v-model="tab" :tabs="tabs" label="Notes, attachments and home activities" />
      <div :id="`panel-${tab}`" class="communication-panel" role="tabpanel" :aria-labelledby="`tab-${tab}`">
        <NotesPanel v-if="tab === 'notes'" :data="data" :legacy-notes="legacyNotes" @updated="data = $event" />
        <AttachmentsPanel v-else-if="tab === 'attachments'" :data="data" @updated="data = $event" />
        <HomeActivitiesPanel v-else :data="data" @updated="data = $event" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.communication {
  display: grid;
  gap: 14px;
}

.communication-panel {
  min-height: 120px;
}
</style>
