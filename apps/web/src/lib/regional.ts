import { reactive } from 'vue';
import type { DateFormat, LanguageCode, TimeFormat } from '@abapro/shared';

/**
 * The language, timezone and formats in effect. Set from the signed-in user's resolved preferences, or from the
 * browser before sign-in. Formatting helpers read it, so templates update when it changes.
 */
export const regional = reactive<{
  language: LanguageCode;
  locale: string;
  timezone: string;
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
  currency: string;
}>({
  language: 'en',
  locale: 'en',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  dateFormat: 'auto',
  timeFormat: 'auto',
  currency: 'USD',
});
