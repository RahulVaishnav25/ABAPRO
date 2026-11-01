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
  <!-- The text always names the status; the colour and dot only support it. -->
  <span class="badge" :class="`badge-${tone}`">{{ label }}</span>
</template>
