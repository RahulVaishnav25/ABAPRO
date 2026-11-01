<script setup lang="ts">
import type { TabItem } from './types';

/**
 * In-page tabs (a tab list bound to v-model) or, when every tab has a `to`, page tabs: links in a nav that show the
 * current page.
 */
const model = defineModel<string>({ default: '' });

const props = defineProps<{
  tabs: TabItem[];
  label: string;
}>();

function move(event: KeyboardEvent): void {
  const ids = props.tabs.map((tab) => tab.id);
  const index = ids.indexOf(model.value);
  const rtl = getComputedStyle(event.currentTarget as Element).direction === 'rtl';
  const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
  const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
  const next = { [forward]: index + 1, [backward]: index - 1, Home: 0, End: ids.length - 1 }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  const id = ids[(next + ids.length) % ids.length];
  if (!id) return;
  model.value = id;
  (event.currentTarget as HTMLElement).querySelector<HTMLElement>(`#tab-${id}`)?.focus();
}
</script>

<template>
  <nav v-if="tabs.every((tab) => tab.to)" class="tabs" :aria-label="label">
    <RouterLink v-for="tab in tabs" :key="tab.id" :to="tab.to!" class="tab" exact-active-class="is-active">
      {{ tab.label }}
      <span v-if="tab.count !== undefined" class="tab-count">{{ tab.count }}</span>
    </RouterLink>
  </nav>
  <div v-else class="tabs" role="tablist" :aria-label="label" @keydown="move">
    <button
      v-for="tab in tabs"
      :id="`tab-${tab.id}`"
      :key="tab.id"
      class="tab"
      type="button"
      role="tab"
      :aria-selected="model === tab.id"
      :aria-controls="`panel-${tab.id}`"
      :tabindex="model === tab.id ? 0 : -1"
      @click="model = tab.id"
    >
      {{ tab.label }}
      <span v-if="tab.count !== undefined" class="tab-count">{{ tab.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.tab-count {
  min-width: 20px;
  padding: 0 6px;
  border-radius: var(--radius-full);
  background: var(--color-surface-sunken);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 18px;
  text-align: center;
}

.tab.is-active .tab-count,
.tab[aria-selected='true'] .tab-count {
  background: var(--color-primary-soft);
  color: var(--color-primary-ink);
}
</style>
