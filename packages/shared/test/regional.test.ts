import { describe, expect, it } from 'vitest';
import { languageOf, resolvePreferences } from '../src/index';

describe('regional preferences', () => {
  it('uses the user, then the organisation, then the platform, then English', () => {
    const resolved = resolvePreferences({
      user: { timezone: 'Asia/Dubai' },
      organization: { locale: 'en-GB', timezone: 'Europe/London', currency: 'GBP' },
      platform: { locale: 'fr', dateFormat: 'yyyy-mm-dd', timezone: 'Europe/Paris' },
    });
    expect(resolved).toMatchObject({ language: 'en', dir: 'ltr', locale: 'en-GB', timezone: 'Asia/Dubai', dateFormat: 'yyyy-mm-dd', timeFormat: 'auto', currency: 'GBP' });
    expect(resolved.sources).toEqual({ locale: 'organization', timezone: 'user', dateFormat: 'platform', timeFormat: 'default', currency: 'organization' });
    expect(resolvePreferences({})).toMatchObject({ language: 'en', locale: 'en', timezone: 'UTC', currency: 'USD' });
  });

  it('switches direction for right-to-left languages', () => {
    expect(resolvePreferences({ user: { locale: 'ar' } })).toMatchObject({ language: 'ar', dir: 'rtl' });
    expect(resolvePreferences({ organization: { locale: 'he-IL' } })).toMatchObject({ language: 'he', dir: 'rtl', locale: 'he-IL' });
  });

  it('keeps the organisation region when the user picks only its language', () => {
    expect(resolvePreferences({ user: { locale: 'en' }, organization: { locale: 'en-GB' } }).locale).toBe('en-GB');
    expect(resolvePreferences({ user: { locale: 'fr' }, organization: { locale: 'en-GB' } }).locale).toBe('fr');
  });

  it('maps locales to supported languages', () => {
    expect(languageOf('fr-CA')).toBe('fr');
    expect(languageOf('de-DE')).toBeNull();
  });
});
