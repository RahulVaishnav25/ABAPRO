<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { getTaskRequest, type TaskItem } from '@/api/tasks';
import CreateTaskModal from '@/components/programs/CreateTaskModal.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import { useLoader } from '@/lib/loader';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { t } = useI18n();

const taskId = computed(() => String(route.params.taskId ?? ''));
const task = ref<TaskItem | null>(null);

const { loading, error, load } = useLoader(async () => {
  task.value = await getTaskRequest(taskId.value);
}, t('tasks.pageError'));

function handleClose(): void {
  // Return to the page that opened the task, such as the Therapy Workspace.
  if (window.history.state?.back) {
    router.back();
  } else if (task.value?.programId) {
    void router.push(`/programs/${task.value.programId}`);
  } else {
    void router.push('/programs/tasks');
  }
}

function handleEdit(): void {
  void router.push(`/programs/tasks/${taskId.value}/edit`);
}

onMounted(() => void load());
</script>

<template>
  <PageContainer>
    <SkeletonBlock v-if="loading" height="260px" />
    <ErrorState
      v-else-if="error || !task"
      :title="t('tasks.pageUnavailable')"
      :description="error || t('tasks.notFound')"
      @retry="load"
    />
    <CreateTaskModal
      v-else
      :open="true"
      mode="preview"
      :task="task"
      :can-edit="auth.can('programs.edit')"
      @close="handleClose"
      @edit="handleEdit"
    />
  </PageContainer>
</template>
