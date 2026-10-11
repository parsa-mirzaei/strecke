/**
 * UI strings (DECISIONS D53). Every user-facing string goes through `t()`; components hold no literal
 * copy (a test enforces this). English is the default UI language, German the other. Learning content
 * from the sheet is German whatever the UI language.
 */
import { de } from './de';
import { en, type StringKey } from './en';

export type Locale = 'en' | 'de';
export const LOCALES: readonly Locale[] = ['en', 'de'];
export const TABLES: Record<Locale, Record<StringKey, string>> = { en, de };
export type { StringKey };

let current: Locale = 'en';

export function setLocale(l: Locale): void {
  current = l;
  if (typeof document !== 'undefined') document.documentElement.lang = l;
}

export function getLocale(): Locale {
  return current;
}

/** `{name}` placeholders are replaced by `vars.name`. A missing key falls back to English. */
export function t(key: StringKey, vars: Record<string, string | number> = {}): string {
  const s = TABLES[current][key] ?? en[key];
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Dates and times in the UI language, with the device's time zone. */
export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(current === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function formatTime(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const sameDay = new Date(now).toDateString() === d.toDateString();
  const loc = current === 'de' ? 'de-DE' : 'en-GB';
  return sameDay
    ? d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(loc, { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
}
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
