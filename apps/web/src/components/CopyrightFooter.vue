<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const year = new Date().getFullYear();
</script>

<template>
  <footer class="copyright">
    <p dir="auto">{{ t('shell.footer', { year }) }}</p>
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
