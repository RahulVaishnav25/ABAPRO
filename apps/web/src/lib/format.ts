import type { BadgeTone } from '@/components/ui/types';
import { regional } from './regional';

/*
 * Locale- and timezone-aware formatting. Every value follows the active preferences in lib/regional.ts: the user's
 * own settings, then the organisation's, then the platform's.
 */

function hour12(): boolean | undefined {
  if (regional.timeFormat === '12h') return true;
  if (regional.timeFormat === '24h') return false;
  return undefined;
}

/** A YYYY-MM-DD day as a Date at noon UTC, so no timezone moves it to another day. */
function day(isoDate: string): Date {
  const [year, month, date] = isoDate.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1, 12));
}

/** Numeric dates in the chosen pattern, with the locale's own digits. */
function patterned(date: Date, timeZone: string): string | null {
  if (regional.dateFormat === 'auto') return null;
  const parts = new Intl.DateTimeFormat(regional.locale, { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  const [d, m, y] = [part('day'), part('month'), part('year')];
  if (regional.dateFormat === 'dd/mm/yyyy') return `${d}/${m}/${y}`;
  if (regional.dateFormat === 'mm/dd/yyyy') return `${m}/${d}/${y}`;
  return `${y}-${m}-${d}`;
}

/** A calendar day (YYYY-MM-DD), such as a review date. */
export function formatDate(isoDate: string | null | undefined, fallback = '—'): string {
  if (!isoDate) return fallback;
  const date = day(isoDate);
  return patterned(date, 'UTC') ?? new Intl.DateTimeFormat(regional.locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

/** A calendar day without the year, for compact lists and chart axes. */
export function formatShortDate(isoDate: string): string {
  return new Intl.DateTimeFormat(regional.locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(day(isoDate));
}

/** A moment, in the user's timezone. */
export function formatDateTime(iso: string | null | undefined, fallback = '—'): string {
  if (!iso) return fallback;
  const date = new Date(iso);
  const time = new Intl.DateTimeFormat(regional.locale, { timeZone: regional.timezone, hour: 'numeric', minute: '2-digit', hour12: hour12() }).format(date);
  const dated = patterned(date, regional.timezone)
    ?? new Intl.DateTimeFormat(regional.locale, { timeZone: regional.timezone, month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  return `${dated}, ${time}`;
}

/** The day of a moment, in the user's timezone. */
export function formatDayOf(iso: string | null | undefined, fallback = '—'): string {
  if (!iso) return fallback;
  const date = new Date(iso);
  return patterned(date, regional.timezone) ?? new Intl.DateTimeFormat(regional.locale, { timeZone: regional.timezone, dateStyle: 'medium' }).format(date);
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat(regional.locale, { timeZone: regional.timezone, hour: 'numeric', minute: '2-digit', hour12: hour12() }).format(new Date(iso));
}

/** "3 minutes ago", "in 2 days". */
export function formatRelative(iso: string): string {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  const format = new Intl.RelativeTimeFormat(regional.locale, { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(seconds, 'second');
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(regional.locale, options).format(value);
}

export function formatCurrency(value: number, currency = regional.currency): string {
  return new Intl.NumberFormat(regional.locale, { style: 'currency', currency }).format(value);
}

/** A country's name in the active language. */
export function formatRegion(code: string): string {
  try {
    return new Intl.DisplayNames([regional.locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Badge colour for a program or task status. */
export function careStatusTone(status: string): BadgeTone {
  if (status === 'in_treatment') return 'success';
  if (status === 'maintenance') return 'info';
  if (status === 'on_hold') return 'warning';
  if (status === 'mastered') return 'mastered';
  return 'neutral';
}

/** Badge tone for a task phase. */
export function phaseTone(phase: string): BadgeTone {
  switch ((phase || '').toLowerCase()) {
    case 'treatment':
    case 'intervention':
      return 'warning';
    case 'mastered':
      return 'success';
    case 'maintenance':
    case 'generalization':
      return 'info';
    default:
      return 'neutral';
  }
}
