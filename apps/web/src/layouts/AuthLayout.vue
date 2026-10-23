<script setup lang="ts">
import CopyrightFooter from '@/components/CopyrightFooter.vue';
</script>

<template>
  <div class="auth-layout">
    <div class="auth-body">
      <RouterView />
    </div>
    <CopyrightFooter />
  </div>
</template>

<style scoped>
.auth-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.auth-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.auth-body > :deep(*) {
  flex: 1;
}
</style>
