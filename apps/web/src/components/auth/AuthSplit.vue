<script setup lang="ts">
import AuthShowcase from '@/components/auth/AuthShowcase.vue';
</script>

<template>
  <div class="split">
    <AuthShowcase class="showcase" />
    <section class="panel-wrap">
      <slot />
    </section>
  </div>
</template>

<style scoped>
.split {
  min-height: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
}

.panel-wrap {
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--color-bg);
  min-width: 0;
}

@media (max-width: 767px) {
  .split {
    grid-template-columns: 1fr;
  }

  .showcase {
    display: none;
  }
}
</style>
