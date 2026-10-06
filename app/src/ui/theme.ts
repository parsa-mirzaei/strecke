/** Dark first; light and "follow the system" are options. Stored per device. */

export type Theme = 'dark' | 'light' | 'system';

const KEY = 'strecke.theme';
// Must match --bg in app.css and the boot script in index.html.
const BG = { dark: '#16171b', light: '#f1f0ec' };

export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'system' ? v : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(t: Theme): void {
  const light = t === 'light' || (t === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches);
  const root = document.documentElement;
  root.dataset.theme = t;
  root.classList.remove('boot-light'); // first-paint helper from index.html
  root.style.colorScheme = light ? 'light' : 'dark';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? BG.light : BG.dark);
}

export function setTheme(t: Theme): void {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* storage unavailable: applies for this visit only */
  }
  applyTheme(t);
}

/** Keep the status bar colour right when the system scheme changes under "system". */
export function watchSystemTheme(): void {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (getTheme() === 'system') applyTheme('system');
  });
}
