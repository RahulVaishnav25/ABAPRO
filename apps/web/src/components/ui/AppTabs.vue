<script setup lang="ts">
import type { TabItem } from './types';

const model = defineModel<string>({ required: true });

defineProps<{
  tabs: TabItem[];
  label: string;
}>();
</script>

<template>
  <div class="tabs" role="tablist" :aria-label="label">
    <button
      v-for="tab in tabs"
      :id="`tab-${tab.id}`"
      :key="tab.id"
      class="tab"
      type="button"
      role="tab"
      :aria-selected="model === tab.id"
      :tabindex="model === tab.id ? 0 : -1"
      @click="model = tab.id"
    >
      {{ tab.label }}
    </button>
  </div>
</template>
