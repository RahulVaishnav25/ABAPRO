<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { ClientDirectoryItem } from '@abapro/shared';
import { allClientsRequest } from '@/api/parents';
import AppInput from '@/components/ui/AppInput.vue';
import AppCheckbox from '@/components/ui/AppCheckbox.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import { errorMessage } from '@/lib/loader';

/** Chooses any number of clients, searchable by name or code. */
const selected = defineModel<string[]>({ default: () => [] });
defineProps<{ label: string; hint?: string }>();

const clients = ref<ClientDirectoryItem[] | null>(null);
const error = ref('');
const search = ref('');

const shown = computed(() => {
  const query = search.value.trim().toLowerCase();
  const list = clients.value ?? [];
  return query ? list.filter((client) => `${client.displayName} ${client.clientCode}`.toLowerCase().includes(query)) : list;
});
const chosen = computed(() => (clients.value ?? []).filter((client) => selected.value.includes(client.id)));

function toggle(id: string, checked: boolean): void {
  selected.value = checked ? [...new Set([...selected.value, id])] : selected.value.filter((item) => item !== id);
}

onMounted(async () => {
  try {
    clients.value = await allClientsRequest();
  } catch (loadError) {
    error.value = errorMessage(loadError, 'Clients could not be loaded.');
    clients.value = [];
  }
});
</script>

<template>
  <fieldset class="picker">
    <legend class="picker-label">{{ label }}</legend>
    <p v-if="hint" class="picker-hint">{{ hint }}</p>
    <p v-if="chosen.length" class="picker-chosen" aria-live="polite">
      <span v-for="client in chosen" :key="client.id" class="picker-chip">{{ client.displayName }} · {{ client.clientCode }}</span>
    </p>
    <AppInput v-model="search" label="Search clients" placeholder="Name or code" hide-label />
    <SkeletonBlock v-if="clients === null" height="120px" />
    <p v-else-if="error" class="picker-hint" role="alert">{{ error }}</p>
    <p v-else-if="shown.length === 0" class="picker-hint">{{ clients.length ? 'No clients match.' : 'There are no clients you can link yet.' }}</p>
    <div v-else class="picker-list">
      <AppCheckbox
        v-for="client in shown"
        :key="client.id"
        :model-value="selected.includes(client.id)"
        :label="`${client.displayName} (${client.clientCode})`"
        @update:model-value="toggle(client.id, $event)"
      />
    </div>
  </fieldset>
</template>

<style scoped>
.picker {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  border: 0;
}

.picker-label {
  padding: 0;
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--color-ink);
}

.picker-hint {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.picker-chosen {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
}

.picker-chip {
  padding: 3px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 12%, var(--color-surface));
  color: var(--color-primary-ink, var(--color-primary));
  font-size: 0.82rem;
  font-weight: 600;
}

.picker-list {
  display: grid;
  gap: 2px;
  max-height: 220px;
  overflow-y: auto;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 10px);
}
</style>
