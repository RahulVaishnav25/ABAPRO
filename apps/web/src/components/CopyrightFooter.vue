<script setup lang="ts">
const year = new Date().getFullYear();
</script>

<template>
  <footer class="copyright">
    <p>© {{ year }} Techieora Private Limited</p>
  </footer>
</template>

<style scoped>
.copyright {
  padding: 10px 16px;
  text-align: center;
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
}

.copyright p {
  color: var(--color-text-subtle);
  font-size: 0.82rem;
}
</style>
