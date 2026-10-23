<script setup lang="ts">
import type { BadgeTone } from './types';

withDefaults(
  defineProps<{
    label: string;
    tone?: BadgeTone;
  }>(),
  { tone: 'neutral' },
);
</script>

<template>
  <span class="badge" :class="`badge-${tone}`">{{ label }}</span>
</template>
