<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { init, type ECharts, type EChartsCoreOption } from 'echarts/core';
import '@/charts/register';
import EmptyState from './EmptyState.vue';
import SkeletonBlock from './SkeletonBlock.vue';

const props = defineProps<{
  title: string;
  description?: string;
  option: EChartsCoreOption | null;
  summary?: string;
  loading?: boolean;
  sourceLabel?: string;
}>();

const host = ref<HTMLElement | null>(null);
let chart: ECharts | null = null;
let observer: ResizeObserver | null = null;

async function render(): Promise<void> {
  await nextTick();
  if (!host.value || !props.option || props.loading) {
    chart?.dispose();
    chart = null;
    observer?.disconnect();
    observer = null;
    return;
  }
  if (!chart) {
    chart = init(host.value);
    observer = new ResizeObserver(() => chart?.resize());
    observer.observe(host.value);
  }
  chart.setOption(props.option, true);
  chart.resize();
}

onMounted(() => {
  void render();
});

watch(() => props.option, () => void render(), { deep: true });
watch(() => props.loading, () => void render());

onBeforeUnmount(() => {
  observer?.disconnect();
  chart?.dispose();
});
</script>

<template>
  <section class="panel graph-panel" :aria-label="title">
    <header class="graph-header">
      <div>
        <h2>{{ title }}</h2>
        <p v-if="description">{{ description }}</p>
      </div>
      <p v-if="sourceLabel" class="source-label">{{ sourceLabel }}</p>
    </header>
    <SkeletonBlock v-if="loading" height="280px" />
    <EmptyState v-else-if="!option" title="No graph data" description="A graph will appear when data is available." />
    <div v-else class="graph-frame" aria-hidden="true">
      <div ref="host" class="graph-canvas"></div>
    </div>
    <p v-if="summary" class="visually-hidden">{{ summary }}</p>
  </section>
</template>

<style scoped>
.graph-panel {
  padding: 16px;
}

.graph-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 8px;
}

.graph-header h2 {
  font-size: 1.05rem;
}

.graph-header p,
.source-label {
  color: var(--color-text-muted);
  font-size: 0.92rem;
}

.graph-canvas {
  width: 100%;
  height: 100%;
}
</style>
