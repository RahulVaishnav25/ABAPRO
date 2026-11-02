import { describe, expect, it } from 'vitest';
import { safeRedirect } from './redirect';

describe('safeRedirect', () => {
  it('allows in-app paths and rejects external targets', () => {
    expect(safeRedirect('/clients')).toBe('/clients');
    expect(safeRedirect('https://example.com')).toBe('/');
    expect(safeRedirect('//example.com')).toBe('/');
    expect(safeRedirect(undefined)).toBe('/');
  });

  it('never returns someone to a page that only explains why they cannot continue', () => {
    expect(safeRedirect('/forbidden')).toBe('/');
    expect(safeRedirect('/no-clinic')).toBe('/');
    expect(safeRedirect('/login?redirect=/clients')).toBe('/');
    expect(safeRedirect('/clients?status=active')).toBe('/clients?status=active');
  });
});
