import type { AppLocale } from './organization';

/**
 * Languages and regional preferences.
 *
 * The interface language and the formats for dates, times and numbers are resolved in this order, the first set
 * value winning: the user's own preference, the organisation's setting, the platform default, then English.
 */

/** Interface languages. Adding one means adding its message file in the web app and an entry here. */
export const LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', dir: 'ltr' },
  { code: 'fr', name: 'French', nativeName: 'Français', dir: 'ltr' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', dir: 'rtl' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', dir: 'rtl' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];
export type TextDirection = 'ltr' | 'rtl';

export const LANGUAGE_CODES: readonly LanguageCode[] = LANGUAGES.map((language) => language.code);
export const RTL_LANGUAGES: readonly LanguageCode[] = LANGUAGES.filter((language) => language.dir === 'rtl').map((language) => language.code);
export const DEFAULT_LANGUAGE: LanguageCode = 'en';

/** The interface language for a locale such as en-GB, or null when it is not supported. */
export function languageOf(locale: string | null | undefined): LanguageCode | null {
  const base = (locale ?? '').split(/[-_]/)[0]?.toLowerCase() ?? '';
  return (LANGUAGE_CODES as readonly string[]).includes(base) ? (base as LanguageCode) : null;
}

export function directionOf(language: LanguageCode): TextDirection {
  return RTL_LANGUAGES.includes(language) ? 'rtl' : 'ltr';
}

/** auto follows the locale's own convention. */
export const DATE_FORMATS = ['auto', 'dd/mm/yyyy', 'mm/dd/yyyy', 'yyyy-mm-dd'] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];
export const TIME_FORMATS = ['auto', '12h', '24h'] as const;
export type TimeFormat = (typeof TIME_FORMATS)[number];

/** Settings a level may set; anything left out falls through to the next level. */
export interface RegionalSettings {
  /** A language, optionally with a region (en-GB), which also sets the date and number conventions. */
  locale?: AppLocale;
  timezone?: string;
  dateFormat?: DateFormat;
  timeFormat?: TimeFormat;
  /** ISO 4217 code, such as USD. */
  currency?: string;
}

/** The user's own preferences. Currency is set by the organisation only. */
export type UserPreferences = Omit<RegionalSettings, 'currency'>;

export type PreferenceSource = 'user' | 'organization' | 'platform' | 'default';

export interface EffectivePreferences {
  /** The interface language. */
  language: LanguageCode;
  dir: TextDirection;
  /** For formatting: the language with the region that set it, such as en-GB. */
  locale: string;
  timezone: string;
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
  currency: string;
  /** Where each value came from, for showing "Using your organisation's setting". */
  sources: Record<'locale' | 'timezone' | 'dateFormat' | 'timeFormat' | 'currency', PreferenceSource>;
}

export const DEFAULT_REGIONAL: Required<RegionalSettings> = {
  locale: 'en',
  timezone: 'UTC',
  dateFormat: 'auto',
  timeFormat: 'auto',
  currency: 'USD',
};

/** Combines the levels into the values the interface uses. */
export function resolvePreferences(levels: {
  user?: UserPreferences | null;
  organization?: RegionalSettings | null;
  platform?: RegionalSettings | null;
}): EffectivePreferences {
  const order: Array<[Exclude<PreferenceSource, 'default'>, RegionalSettings | null | undefined]> = [
    ['user', levels.user],
    ['organization', levels.organization],
    ['platform', levels.platform],
  ];
  const sources = {} as EffectivePreferences['sources'];
  const pick = <K extends keyof RegionalSettings>(key: K): NonNullable<RegionalSettings[K]> => {
    for (const [source, settings] of order) {
      const value = settings?.[key];
      if (value) {
        sources[key] = source;
        return value as NonNullable<RegionalSettings[K]>;
      }
    }
    sources[key] = 'default';
    return DEFAULT_REGIONAL[key] as NonNullable<RegionalSettings[K]>;
  };
  let locale: string = pick('locale');
  let language = languageOf(locale);
  if (!language) {
    language = DEFAULT_LANGUAGE;
    locale = DEFAULT_LANGUAGE;
  }
  // A user who picks only a language keeps the organisation's regional conventions for that language (en with an
  // en-GB organisation formats dates the British way).
  const organizationLocale = levels.organization?.locale;
  if (sources.locale === 'user' && !locale.includes('-') && organizationLocale && languageOf(organizationLocale) === language) {
    locale = organizationLocale;
  }
  return {
    language,
    dir: directionOf(language),
    locale,
    timezone: pick('timezone'),
    dateFormat: pick('dateFormat'),
    timeFormat: pick('timeFormat'),
    currency: pick('currency'),
    sources,
  };
}
