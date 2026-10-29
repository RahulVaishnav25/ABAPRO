<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getTaskRequest, updateTaskRequest, type CreateTaskInput, type TaskItem } from '@/api/tasks';
import CreateTaskModal from '@/components/programs/CreateTaskModal.vue';
import ErrorState from '@/components/ui/ErrorState.vue';
import PageContainer from '@/components/ui/PageContainer.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import { useToastStore } from '@/stores/toast';
import { errorMessage, useLoader } from '@/lib/loader';

const route = useRoute();
const router = useRouter();
const toast = useToastStore();

const taskId = computed(() => String(route.params.taskId ?? ''));
const saving = ref(false);
const task = ref<TaskItem | null>(null);

const { loading, error, load } = useLoader(async () => {
  task.value = await getTaskRequest(taskId.value);
}, 'The task could not be loaded.');

function handleClose(): void {
  if (task.value?.programId) {
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
      title: 'Task updated',
      message: `Task "${updated.name}" has been updated successfully.`,
    });
    handleClose();
  } catch (err) {
    toast.push({
      tone: 'danger',
      title: 'Failed to update task',
      message: errorMessage(err, 'Failed to update task.'),
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
      title="Task edit unavailable"
      :description="error || 'Task not found.'"
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
