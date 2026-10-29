export interface ThemeConfig {
  primaryColor?: string;
  secondaryColor?: string;
  faviconUrl?: string;
  portalName?: string;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return isNaN(r) || isNaN(g) || isNaN(b) ? null : { r, g, b };
  }
  if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return isNaN(r) || isNaN(g) || isNaN(b) ? null : { r, g, b };
  }
  return null;
}

export function adjustBrightness(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const factor = 1 + percent / 100;
  const clamp = (val: number) => Math.min(255, Math.max(0, Math.round(val)));
  const r = clamp(rgb.r * factor).toString(16).padStart(2, '0');
  const g = clamp(rgb.g * factor).toString(16).padStart(2, '0');
  const b = clamp(rgb.b * factor).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

export function hexToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/**
 * Applies the branding theme dynamically to the DOM:
 * - Updates CSS variables on document.documentElement
 * - Updates favicon link tag
 * - Updates document title if specified
 */
export function applyBrandingTheme(theme: ThemeConfig): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;

  if (theme.primaryColor && /^#[0-9a-fA-F]{3,6}$/.test(theme.primaryColor)) {
    const primary = theme.primaryColor;
    const hover = adjustBrightness(primary, -12);
    const soft = hexToRgba(primary, 0.12);
    const ink = adjustBrightness(primary, -28);
    const focus = `0 0 0 3px ${hexToRgba(primary, 0.28)}`;

    root.style.setProperty('--color-primary', primary);
    root.style.setProperty('--color-primary-hover', hover);
    root.style.setProperty('--color-primary-soft', soft);
    root.style.setProperty('--color-primary-ink', ink);
    root.style.setProperty('--focus', focus);
  }

  if (theme.secondaryColor && /^#[0-9a-fA-F]{3,6}$/.test(theme.secondaryColor)) {
    const secondary = theme.secondaryColor;
    const hover = adjustBrightness(secondary, -12);
    const soft = hexToRgba(secondary, 0.12);

    root.style.setProperty('--color-secondary', secondary);
    root.style.setProperty('--color-secondary-hover', hover);
    root.style.setProperty('--color-secondary-soft', soft);
  }

  if (theme.faviconUrl) {
    let link = document.querySelector<HTMLLinkElement>("link[rel*='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = theme.faviconUrl;
  }

  if (theme.portalName) {
    if (!document.title || document.title === 'ABAPro' || document.title.includes('ABAPro')) {
      document.title = document.title.replace('ABAPro', theme.portalName);
    }
  }
}
