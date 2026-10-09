import { DEFAULT_SETTINGS, parseSettings, type Settings } from '@core/engine/settings.ts';
import type { KeyValueStore } from '@core/data/adapter.ts';

const KEY = 'strecke.settings.v1';

export async function loadSettings(store: KeyValueStore): Promise<Settings> {
  try { return parseSettings(await store.get<unknown>(KEY)); } catch { return DEFAULT_SETTINGS; }
}

export async function saveSettings(store: KeyValueStore, s: Settings): Promise<void> {
  try { await store.set(KEY, s); } catch { /* the settings still apply for this visit */ }
}

/** Theme and reduced motion on the document. "system" leaves the choice to the browser. */
export function applyAppearance(s: Settings): void {
  const root = document.documentElement;
  const forced = import.meta.env.DEV ? new URLSearchParams(location.search).get('theme') : null;
  if (forced === 'light' || forced === 'dark') root.dataset.theme = forced;
  else if (s.theme === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = s.theme;
  const bg = getComputedStyle(root).getPropertyValue('--ground').trim();
  if (bg) document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg));
}
