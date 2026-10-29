import { describe, expect, it } from 'vitest';
import { adjustBrightness, hexToRgb, hexToRgba } from './theme';

describe('theme utilities', () => {
  it('converts hex colors to RGB correctly', () => {
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('invalid')).toBeNull();
  });

  it('adjusts brightness accurately', () => {
    const darker = adjustBrightness('#108070', -20);
    expect(darker).toMatch(/^#[0-9a-f]{6}$/);
    const lighter = adjustBrightness('#108070', 20);
    expect(lighter).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('creates rgba color strings with alpha', () => {
    expect(hexToRgba('#0e6b62', 0.5)).toBe('rgba(14, 107, 98, 0.5)');
  });
});
