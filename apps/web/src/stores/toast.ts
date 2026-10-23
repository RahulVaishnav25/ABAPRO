import { defineStore } from 'pinia';
import { ref } from 'vue';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface Toast {
  id: string;
  title: string;
  message?: string;
  tone: ToastTone;
}

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([]);

  function push(toast: Omit<Toast, 'id'>): void {
    const id = crypto.randomUUID();
    toasts.value = [...toasts.value, { ...toast, id }];
    window.setTimeout(() => dismiss(id), 4200);
  }

  function dismiss(id: string): void {
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
  }

  return { toasts, push, dismiss };
});
