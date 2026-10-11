/**
 * Per-device preferences. Stored in IndexedDB (`settings`); theme and language are mirrored to
 * localStorage only so the first paint (index.html) can use them before the bundle loads.
 */
import { NS } from '../channel';
import { setLocale, type Locale } from '../i18n';

export type Theme = 'light' | 'dark' | 'system';

export interface Settings {
  locale: Locale;
  theme: Theme;
  haptics: boolean;
}

export const DEFAULT_SETTINGS: Settings = { locale: 'en', theme: 'system', haptics: true };

/** Must match --paper in app.css and the boot script in index.html. */
const PAPER = { light: '#F4F0E6', dark: '#13171D' };

export function normalizeSettings(x: unknown): Settings {
  const s = (typeof x === 'object' && x !== null ? x : {}) as Partial<Settings>;
  return {
    locale: s.locale === 'de' ? 'de' : 'en',
    theme: s.theme === 'light' || s.theme === 'dark' ? s.theme : 'system',
    haptics: s.haptics !== false,
  };
}

let current: Settings = DEFAULT_SETTINGS;

export function applySettings(s: Settings): void {
  current = s;
  setLocale(s.locale);
  if (typeof document === 'undefined') return;
  const light = s.theme === 'light' || (s.theme === 'system' && !window.matchMedia('(prefers-color-scheme: dark)').matches);
  const root = document.documentElement;
  root.dataset.theme = light ? 'light' : 'dark';
  root.style.colorScheme = light ? 'light' : 'dark';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? PAPER.light : PAPER.dark);
  try {
    localStorage.setItem(`${NS}.theme`, s.theme);
    localStorage.setItem(`${NS}.locale`, s.locale);
  } catch {
    /* mirror only; IndexedDB holds the real value */
  }
}

/** Keep the theme and status bar right when the device switches light/dark under "system". */
export function watchSystemTheme(): void {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (current.theme === 'system') applySettings(current);
  });
}
