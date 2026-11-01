import { ref, type Ref } from 'vue';
import { translateServerMessage } from '@/i18n';

/** A failure's message in the interface language when it is a known server message, else as sent. */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? translateServerMessage(error.message) : fallback;
}

export interface Loader {
  loading: Ref<boolean>;
  error: Ref<string>;
  load: () => Promise<void>;
}

/**
 * Runs `work` with the page's loading and error state. A failure shows the error's message,
 * or `fallback` when it has none.
 */
export function useLoader(work: () => Promise<void>, fallback: string, initiallyLoading = true): Loader {
  const loading = ref(initiallyLoading);
  const error = ref('');

  async function load(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
      await work();
    } catch (loadError) {
      error.value = errorMessage(loadError, fallback);
    } finally {
      loading.value = false;
    }
  }

  return { loading, error, load };
}
