<script setup lang="ts">
import { computed, onMounted, ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ClientDirectoryItem } from '@abapro/shared';
import { allClientsRequest } from '@/api/parents';
import AppIcon from '@/components/navigation/AppIcon.vue';
import AppCheckbox from '@/components/ui/AppCheckbox.vue';
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue';
import { errorMessage } from '@/lib/loader';

/** Chooses any number of clients: chosen ones show as removable chips above a searchable list. */
const selected = defineModel<string[]>({ default: () => [] });
defineProps<{ label: string; hint?: string }>();

const { t } = useI18n();
const searchId = useId();
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
    error.value = errorMessage(loadError, t('onboarding.picker.error'));
    clients.value = [];
  }
});
</script>

<template>
  <fieldset class="picker">
    <legend class="picker-label">{{ label }}</legend>
    <p v-if="hint" class="picker-hint">{{ hint }}</p>

    <div class="picker-box">
      <!-- Chosen clients -->
      <div class="picker-chosen">
        <span class="picker-count" aria-live="polite">{{ t('onboarding.picker.selected', chosen.length) }}</span>
        <ul v-if="chosen.length" class="picker-chips">
          <li v-for="client in chosen" :key="client.id" class="picker-chip">
            <span dir="auto">{{ client.displayName }}</span>
            <span class="picker-chip-code">{{ client.clientCode }}</span>
            <button type="button" class="picker-chip-remove" :aria-label="t('onboarding.picker.remove', { name: client.displayName })" @click="toggle(client.id, false)">
              <AppIcon name="close" :size="12" />
            </button>
          </li>
        </ul>
        <button v-if="chosen.length > 1" type="button" class="picker-clear" @click="selected = []">{{ t('onboarding.picker.clear') }}</button>
      </div>

      <!-- Search and list -->
      <div class="picker-search">
        <AppIcon name="search" :size="16" class="picker-search-icon" />
        <label class="visually-hidden" :for="searchId">{{ t('onboarding.picker.search') }}</label>
        <input :id="searchId" v-model="search" type="search" class="control picker-input" :placeholder="t('onboarding.picker.placeholder')" autocomplete="off" />
      </div>
      <SkeletonBlock v-if="clients === null" height="120px" />
      <p v-else-if="error" class="picker-empty" role="alert">{{ error }}</p>
      <p v-else-if="shown.length === 0" class="picker-empty">{{ clients.length ? t('onboarding.picker.noMatches') : t('onboarding.picker.noClients') }}</p>
      <div v-else class="picker-list">
        <AppCheckbox
          v-for="client in shown"
          :key="client.id"
          class="picker-option"
          :class="{ 'is-selected': selected.includes(client.id) }"
          :model-value="selected.includes(client.id)"
          :label="`${client.displayName} (${client.clientCode})`"
          @update:model-value="toggle(client.id, $event)"
        />
      </div>
    </div>
  </fieldset>
</template>

<style scoped>
.picker {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  border: 0;
}

.picker-label {
  padding: 0;
  color: var(--color-ink);
  font-size: var(--text-sm);
  font-weight: 600;
}

.picker-hint,
.picker-empty {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.picker-empty {
  padding: var(--space-3);
}

.picker-box {
  overflow: hidden;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.picker-chosen {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-muted);
}

.picker-count {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  font-weight: 600;
}

.picker-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.picker-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px 2px 10px;
  border-radius: var(--radius-full);
  background: var(--color-primary-soft);
  color: var(--color-primary-ink);
  font-size: var(--text-sm);
  font-weight: 600;
}

.picker-chip-code {
  font-size: var(--text-xs);
  font-weight: 500;
  opacity: 0.8;
}

.picker-chip-remove {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.picker-chip-remove:hover {
  background: color-mix(in srgb, var(--color-primary) 20%, transparent);
}

.picker-clear {
  margin-inline-start: auto;
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-primary-ink);
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
}

.picker-search {
  position: relative;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
}

.picker-search-icon {
  position: absolute;
  top: 50%;
  inset-inline-start: calc(var(--space-3) + 10px);
  translate: 0 -50%;
  color: var(--color-text-subtle);
  pointer-events: none;
}

.picker-input {
  min-height: 36px;
  padding-inline-start: 32px;
}

.picker-list {
  display: grid;
  max-height: 240px;
  overflow-y: auto;
  padding: var(--space-1) 0;
}

.picker-option {
  padding: 4px var(--space-3);
}

.picker-option:hover {
  background: var(--color-surface-muted);
}

.picker-option.is-selected {
  background: color-mix(in srgb, var(--color-primary-soft) 60%, transparent);
}
</style>
