import { describe, expect, it } from 'vitest';
import { safeRedirect } from './redirect';

describe('safeRedirect', () => {
  it('allows in-app paths and rejects external targets', () => {
    expect(safeRedirect('/clients')).toBe('/clients');
    expect(safeRedirect('https://example.com')).toBe('/');
    expect(safeRedirect('//example.com')).toBe('/');
    expect(safeRedirect(undefined)).toBe('/');
  });
});
