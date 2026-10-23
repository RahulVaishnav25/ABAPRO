<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { TableColumn } from './types';
import AppButton from './AppButton.vue';
import AppInput from './AppInput.vue';
import EmptyState from './EmptyState.vue';
import SkeletonBlock from './SkeletonBlock.vue';

const props = withDefaults(
  defineProps<{
    columns: TableColumn[];
    rows: Record<string, unknown>[];
    rowKey: string;
    caption: string;
    searchable?: boolean;
    searchPlaceholder?: string;
    pageSize?: number;
    loading?: boolean;
    density?: 'comfortable' | 'compact';
  }>(),
  {
    searchable: true,
    searchPlaceholder: 'Search this table',
    pageSize: 8,
    loading: false,
    density: 'comfortable',
  },
);

const search = ref('');
const page = ref(1);
const sortKey = ref<string | null>(null);
const sortDirection = ref<'asc' | 'desc'>('asc');

const filtered = computed(() => {
  const query = search.value.trim().toLowerCase();
  let next = props.rows;
  if (query) {
    next = next.filter((row) =>
      props.columns.some((column) => String(row[column.key] ?? '').toLowerCase().includes(query)),
    );
  }
  if (!sortKey.value) {
    return next;
  }
  const key = sortKey.value;
  const direction = sortDirection.value === 'asc' ? 1 : -1;
  return [...next].sort((left, right) => compareValues(left[key], right[key]) * direction);
});

const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / props.pageSize)));
const visibleRows = computed(() => {
  const start = (page.value - 1) * props.pageSize;
  return filtered.value.slice(start, start + props.pageSize);
});
const rangeStart = computed(() => (filtered.value.length === 0 ? 0 : (page.value - 1) * props.pageSize + 1));
const rangeEnd = computed(() => Math.min(page.value * props.pageSize, filtered.value.length));

watch([search, () => props.rows], () => {
  page.value = 1;
});

watch(pageCount, (count) => {
  if (page.value > count) {
    page.value = count;
  }
});

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }
  return String(left ?? '').localeCompare(String(right ?? ''));
}

function toggleSort(column: TableColumn): void {
  if (!column.sortable) {
    return;
  }
  if (sortKey.value === column.key) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
    return;
  }
  sortKey.value = column.key;
  sortDirection.value = 'asc';
}

function ariaSort(column: TableColumn): 'ascending' | 'descending' | 'none' | undefined {
  if (!column.sortable) {
    return undefined;
  }
  if (sortKey.value !== column.key) {
    return 'none';
  }
  return sortDirection.value === 'asc' ? 'ascending' : 'descending';
}

function rowId(row: Record<string, unknown>): string {
  return String(row[props.rowKey]);
}
</script>

<template>
  <section class="table-card">
    <div v-if="searchable" class="table-toolbar">
      <AppInput v-model="search" label="Search table" hide-label :placeholder="searchPlaceholder" />
    </div>
    <div class="table-scroll">
      <table class="data-table" :class="{ 'is-compact': density === 'compact' }">
        <caption class="visually-hidden">
          {{ caption }}
        </caption>
        <thead>
          <tr>
            <th
              v-for="column in columns"
              :key="column.key"
              scope="col"
              :aria-sort="ariaSort(column)"
              :class="{ 'align-end': column.align === 'end' }"
            >
              <button v-if="column.sortable" type="button" class="sort-button" @click="toggleSort(column)">
                {{ column.label }}
                <span aria-hidden="true">{{ sortKey === column.key ? (sortDirection === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </button>
              <template v-else>{{ column.label }}</template>
            </th>
          </tr>
        </thead>
        <tbody v-if="loading">
          <tr v-for="index in 4" :key="index">
            <td v-for="column in columns" :key="column.key">
              <SkeletonBlock height="16px" width="80%" />
            </td>
          </tr>
        </tbody>
        <tbody v-else-if="visibleRows.length > 0">
          <tr v-for="row in visibleRows" :key="rowId(row)">
            <td v-for="column in columns" :key="column.key" :class="{ 'align-end': column.align === 'end' }">
              <slot :name="`cell-${column.key}`" :row="row" :value="row[column.key]">
                {{ row[column.key] }}
              </slot>
            </td>
          </tr>
        </tbody>
      </table>
      <EmptyState
        v-if="!loading && visibleRows.length === 0"
        title="No matching records"
        description="Try a different search or filter."
      />
    </div>
    <div class="pager">
      <p>Showing {{ rangeStart }}–{{ rangeEnd }} of {{ filtered.length }}</p>
      <div class="pager-actions">
        <AppButton variant="secondary" size="sm" :disabled="page <= 1" @click="page -= 1">Previous</AppButton>
        <AppButton variant="secondary" size="sm" :disabled="page >= pageCount" @click="page += 1">Next</AppButton>
      </div>
    </div>
  </section>
</template>

<style scoped>
.table-toolbar :deep(.field) {
  width: min(320px, 100%);
}
</style>
