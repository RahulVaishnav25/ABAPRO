import { describe, expect, it } from 'vitest';
import { errorMessage, useLoader } from './loader';

describe('useLoader', () => {
  it('tracks loading and clears an earlier error on success', async () => {
    let fail = true;
    const states: boolean[] = [];
    const loader = useLoader(async () => {
      states.push(loader.loading.value);
      if (fail) throw new Error('The program could not be reached.');
    }, 'Programs could not be loaded.', false);

    expect(loader.loading.value).toBe(false);
    await loader.load();
    expect(loader.error.value).toBe('The program could not be reached.');
    expect(loader.loading.value).toBe(false);

    fail = false;
    await loader.load();
    expect(loader.error.value).toBe('');
    expect(states).toEqual([true, true]);
  });

  it('falls back when the failure is not an Error', async () => {
    const loader = useLoader(() => Promise.reject('offline'), 'Clinics could not be loaded.');
    await loader.load();
    expect(loader.error.value).toBe('Clinics could not be loaded.');
    expect(errorMessage(new Error('Denied'), 'fallback')).toBe('Denied');
  });
});
