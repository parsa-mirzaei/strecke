/**
 * UI strings (PORT_MAP feature B, ported from Round 4). Every user-facing string goes through `t()`;
 * components hold no literal copy (a test enforces this). English is the default UI language, German
 * the other. Learning content from the sheet stays German whatever the UI language.
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
export const getLocale = (): Locale => current;

/** `{name}` placeholders are replaced by `vars.name`. A missing key falls back to English. */
export function t(key: StringKey, vars: Record<string, string | number> = {}): string {
  const s = TABLES[current][key] ?? en[key];
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

const tag = () => (current === 'de' ? 'de-DE' : 'en-GB');
export const formatDate = (ts: number) => new Date(ts).toLocaleDateString(tag(), { day: 'numeric', month: 'short', year: 'numeric' });
export function formatTime(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const time = d.toLocaleTimeString(tag(), { hour: '2-digit', minute: '2-digit' });
  return new Date(now).toDateString() === d.toDateString() ? time : `${d.toLocaleDateString(tag(), { day: 'numeric', month: 'short' })} ${time}`;
}
export const formatNumber = (n: number) => n.toLocaleString(tag());
