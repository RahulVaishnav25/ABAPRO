<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { computed, ref, watch } from 'vue';
import type { TableColumn } from './types';
import AppButton from './AppButton.vue';
import AppInput from './AppInput.vue';
import EmptyState from './EmptyState.vue';
import SkeletonBlock from './SkeletonBlock.vue';

const { t } = useI18n();

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
    /**
     * Server mode: the rows are one page that the server already searched, sorted and paged.
     * Pass the total row count, the current page and sort; the table emits changes instead of applying them.
     */
    total?: number;
    page?: number;
    sort?: string;
    direction?: 'asc' | 'desc';
  }>(),
  {
    searchable: true,
    searchPlaceholder: undefined,
    pageSize: 8,
    loading: false,
    density: 'comfortable',
    total: undefined,
    page: 1,
    sort: undefined,
    direction: 'asc',
  },
);
const emit = defineEmits<{ 'update:page': [page: number]; sort: [key: string] }>();

const server = computed(() => props.total !== undefined);
const search = ref('');
const localPage = ref(1);
const localSortKey = ref<string | null>(null);
const localSortDirection = ref<'asc' | 'desc'>('asc');
const page = computed(() => (server.value ? props.page : localPage.value));
const sortKey = computed(() => (server.value ? props.sort ?? null : localSortKey.value));
const sortDirection = computed(() => (server.value ? props.direction : localSortDirection.value));
const totalRows = computed(() => (server.value ? props.total ?? 0 : filtered.value.length));

function setPage(next: number): void {
  if (server.value) emit('update:page', next);
  else localPage.value = next;
}

const filtered = computed(() => {
  if (server.value) return props.rows;
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

const pageCount = computed(() => Math.max(1, Math.ceil(totalRows.value / props.pageSize)));
const visibleRows = computed(() => {
  if (server.value) return props.rows;
  const start = (page.value - 1) * props.pageSize;
  return filtered.value.slice(start, start + props.pageSize);
});
const rangeStart = computed(() => (totalRows.value === 0 ? 0 : (page.value - 1) * props.pageSize + 1));
const rangeEnd = computed(() => Math.min(page.value * props.pageSize, totalRows.value));

watch([search, () => props.rows], () => {
  if (!server.value) localPage.value = 1;
});

watch(pageCount, (count) => {
  if (!server.value && localPage.value > count) {
    localPage.value = count;
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
  if (server.value) {
    emit('sort', column.key);
    return;
  }
  if (localSortKey.value === column.key) {
    localSortDirection.value = localSortDirection.value === 'asc' ? 'desc' : 'asc';
    return;
  }
  localSortKey.value = column.key;
  localSortDirection.value = 'asc';
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
    <div v-if="searchable && !server" class="table-toolbar">
      <AppInput v-model="search" :label="t('table.search')" hide-label :placeholder="searchPlaceholder ?? t('table.searchPlaceholder')" />
    </div>
    <div class="table-scroll">
      <table class="data-table is-responsive" :class="{ 'is-compact': density === 'compact' }">
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
            <td v-for="column in columns" :key="column.key" :data-label="column.label" :class="{ 'align-end': column.align === 'end' }">
              <slot :name="`cell-${column.key}`" :row="row" :value="row[column.key]">
                {{ row[column.key] }}
              </slot>
            </td>
          </tr>
        </tbody>
      </table>
      <slot v-if="!loading && visibleRows.length === 0" name="empty">
        <EmptyState :title="t('table.noMatches')" :description="t('table.noMatchesHint')" />
      </slot>
    </div>
    <div class="pager">
      <p>{{ t('table.showing', { start: rangeStart, end: rangeEnd, total: totalRows }) }}</p>
      <div v-if="pageCount > 1" class="pager-actions">
        <AppButton variant="secondary" size="sm" icon="chevron-left" :disabled="page <= 1" @click="setPage(page - 1)">{{ t('common.previous') }}</AppButton>
        <span class="pager-page">{{ page }} / {{ pageCount }}</span>
        <AppButton variant="secondary" size="sm" icon-end="chevron-right" :disabled="page >= pageCount" @click="setPage(page + 1)">{{ t('common.next') }}</AppButton>
      </div>
    </div>
  </section>
</template>

<style scoped>
.table-toolbar :deep(.field) {
  width: min(320px, 100%);
}
</style>
