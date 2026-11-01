<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { getTaskRequest, updateTaskRequest, type CreateTaskInput, type TaskItem } from '@/api/tasks';
import CreateTaskModal from '@/components/programs/CreateTaskModal.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import { useToastStore } from '@/stores/toast';
import { errorMessage, useLoader } from '@/lib/loader';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const toast = useToastStore();

const taskId = computed(() => String(route.params.taskId ?? ''));
const saving = ref(false);
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

async function handleSubmit(payload: CreateTaskInput): Promise<void> {
  if (!taskId.value) return;
  saving.value = true;
  try {
    const updated = await updateTaskRequest(taskId.value, payload);
    task.value = updated;
    toast.push({
      tone: 'success',
      title: t('tasks.updated'),
      message: t('tasks.updatedMessage', { name: updated.name }),
    });
    handleClose();
  } catch (err) {
    toast.push({
      tone: 'danger',
      title: t('tasks.updateFailed'),
      message: errorMessage(err, t('tasks.checkInputs')),
    });
  } finally {
    saving.value = false;
  }
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
      mode="edit"
      :task="task"
      :submitting="saving"
      @close="handleClose"
      @submit="handleSubmit"
    />
  </PageContainer>
</template>
