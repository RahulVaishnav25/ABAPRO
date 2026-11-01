import { createI18n } from 'vue-i18n';
import {
  DEFAULT_LANGUAGE,
  directionOf,
  LANGUAGE_CODES,
  languageOf,
  type EffectivePreferences,
  type LanguageCode,
} from '@abapro/shared';
import { regional } from '@/lib/regional';
import en from './locales/en.json';

/**
 * Interface translations. English is bundled; other languages load when first chosen. Every visible string uses
 * a key from locales/en.json, the source file.
 */
export type MessageSchema = typeof en;

export const i18n = createI18n<[MessageSchema], LanguageCode, false>({
  legacy: false,
  locale: DEFAULT_LANGUAGE,
  fallbackLocale: DEFAULT_LANGUAGE,
  messages: { en } as Record<LanguageCode, MessageSchema>,
  missingWarn: import.meta.env.DEV,
  fallbackWarn: false,
});

const loaders = import.meta.glob<{ default: MessageSchema }>('./locales/*.json');
const loaded = new Set<LanguageCode>([DEFAULT_LANGUAGE]);
const STORAGE_KEY = 'abapro.language';

async function load(language: LanguageCode): Promise<void> {
  if (loaded.has(language)) return;
  const loader = loaders[`./locales/${language}.json`];
  if (!loader) return;
  i18n.global.setLocaleMessage(language, (await loader()).default);
  loaded.add(language);
}

/** Switches the interface language and page direction. */
export async function setLanguage(language: LanguageCode): Promise<void> {
  await load(language);
  i18n.global.locale.value = language;
  regional.language = language;
  document.documentElement.lang = language;
  document.documentElement.dir = directionOf(language);
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Storage can be unavailable; the language still applies to this visit.
  }
}

/** Applies a signed-in user's resolved language, timezone and formats. */
export async function applyPreferences(preferences: EffectivePreferences): Promise<void> {
  regional.locale = preferences.locale;
  regional.timezone = preferences.timezone;
  regional.dateFormat = preferences.dateFormat;
  regional.timeFormat = preferences.timeFormat;
  regional.currency = preferences.currency;
  await setLanguage(preferences.language);
}

/** The language before sign-in: the last one used here, else the browser's, else the platform default. */
export function startingLanguage(platformDefault?: string): LanguageCode {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    stored = null;
  }
  for (const candidate of [stored, ...navigator.languages, platformDefault]) {
    const language = languageOf(candidate);
    if (language && LANGUAGE_CODES.includes(language)) return language;
  }
  return DEFAULT_LANGUAGE;
}

/** A route's title in the interface language, falling back to its English metadata. */
export function routeTitle(route: { name?: unknown; meta: { title?: unknown; breadcrumb?: unknown } }): string {
  const key = `routes.${String(route.name ?? '')}`;
  if (route.name && i18n.global.te(key)) return i18n.global.t(key);
  return String(route.meta.breadcrumb ?? route.meta.title ?? '');
}

/**
 * The API answers in English. Known messages are translated by their exact text; anything else is shown as sent.
 */
const SERVER_MESSAGES: Record<string, string> = {
  'The email or password is incorrect.': 'auth.wrongCredentials',
  'Your parent account is not active yet. You can sign in once the clinic links your child to your account.': 'auth.parentPending',
  'Your session has expired.': 'auth.sessionExpired',
  'The server could not be reached. Start the API and try again.': 'errors.unreachable',
};

export function translateServerMessage(message: string): string {
  const key = SERVER_MESSAGES[message];
  return key ? i18n.global.t(key) : message;
}
