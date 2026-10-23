<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useToastStore } from '@/stores/toast';

const toastStore = useToastStore();
const { toasts } = storeToRefs(toastStore);
</script>

<template>
  <div class="toast-host" aria-live="polite" aria-relevant="additions">
    <article v-for="toast in toasts" :key="toast.id" class="toast" :class="`toast-${toast.tone}`">
      <div>
        <strong>{{ toast.title }}</strong>
        <p v-if="toast.message">{{ toast.message }}</p>
      </div>
      <button type="button" @click="toastStore.dismiss(toast.id)">Dismiss</button>
    </article>
  </div>
</template>
