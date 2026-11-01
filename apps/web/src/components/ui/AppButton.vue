<script setup lang="ts">
import { computed, useSlots } from 'vue';
import AppIcon from '@/components/navigation/AppIcon.vue';
import type { ButtonSize, ButtonVariant } from './types';

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant;
    size?: ButtonSize;
    type?: 'button' | 'submit' | 'reset';
    loading?: boolean;
    disabled?: boolean;
    block?: boolean;
    /** An AppIcon name shown before the label; with no label the button is square and needs an aria-label. */
    icon?: string;
    /** An AppIcon name shown after the label. */
    iconEnd?: string;
  }>(),
  {
    variant: 'primary',
    size: 'md',
    type: 'button',
    loading: false,
    disabled: false,
    block: false,
    icon: undefined,
    iconEnd: undefined,
  },
);

const slots = useSlots();
const iconOnly = computed(() => Boolean(props.icon) && !slots.default);
const iconSize = computed(() => (props.size === 'sm' ? 16 : 18));
/** Left and right arrows point the other way in right-to-left layouts. */
const directional = (name?: string) => Boolean(name && /^(arrow|chevron)-(left|right)$/.test(name));
</script>

<template>
  <button
    :type="type"
    class="btn"
    :class="[`btn-${variant}`, `btn-${size}`, { 'btn-block': block, 'btn-icon': iconOnly }]"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
  >
    <span v-if="loading" class="spinner" aria-hidden="true"></span>
    <AppIcon v-else-if="icon" :name="icon" :size="iconSize" :class="{ 'flip-rtl': directional(icon) }" />
    <slot />
    <AppIcon v-if="iconEnd" :name="iconEnd" :size="iconSize" :class="{ 'flip-rtl': directional(iconEnd) }" />
  </button>
</template>
