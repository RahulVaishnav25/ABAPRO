<script setup lang="ts">
import AppIcon from '@/components/navigation/AppIcon.vue';

defineProps<{
  title: string;
  description?: string;
  /** A link back to the parent page, shown above the title. */
  backTo?: string;
  backLabel?: string;
}>();
</script>

<template>
  <header class="page-header">
    <div class="page-heading">
      <RouterLink v-if="backTo" class="page-back" :to="backTo">
        <AppIcon name="arrow-left" class="flip-rtl" :size="16" />
        {{ backLabel ?? 'Back' }}
      </RouterLink>
      <h1>{{ title }}</h1>
      <p v-if="description">{{ description }}</p>
      <slot name="meta" />
    </div>
    <div v-if="$slots.actions" class="page-actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  gap: var(--space-4);
  align-items: flex-end;
  padding-bottom: var(--space-2);
}

.page-heading {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.page-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  margin-bottom: var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: 500;
  text-decoration: none;
}

.page-back:hover {
  color: var(--color-ink);
}

h1 {
  font-size: var(--text-2xl);
  font-weight: 650;
  letter-spacing: -0.02em;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

p {
  color: var(--color-text-muted);
  font-size: var(--text-base);
  max-width: 72ch;
}

.page-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  flex-shrink: 0;
}

@media (max-width: 720px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  h1 {
    font-size: var(--text-xl);
  }
}
</style>
