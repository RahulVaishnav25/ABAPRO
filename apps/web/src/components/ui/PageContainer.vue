<template>
  <div class="page-container">
    <slot />
  </div>
</template>

<style scoped>
.page-container {
  width: min(var(--content-max), 100%);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
</style>
