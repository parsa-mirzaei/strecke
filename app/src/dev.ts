/**
 * URL parameters for design review (DECISIONS D50).
 *   ?style=1|2|3   visual direction; works in every build so the owner can compare on the phone
 * Development only (stripped from production by the DEV check):
 *   ?theme=light|dark   force a colour scheme
 *   ?word=<de>          start with this word
 *   ?state=cover|revealed|next   put the first card into a state and freeze motion (for screenshots)
 */
export const STYLES = ['1', '2', '3'] as const;
export type StyleId = (typeof STYLES)[number];
export const DEFAULT_STYLE: StyleId = '1';

const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
const STYLE_KEY = 'strecke.style';

export function initialStyle(): StyleId {
  const fromUrl = params.get('style');
  if (fromUrl && (STYLES as readonly string[]).includes(fromUrl)) {
    try { localStorage.setItem(STYLE_KEY, fromUrl); } catch { /* storage off: URL still wins */ }
    return fromUrl as StyleId;
  }
  try {
    const stored = localStorage.getItem(STYLE_KEY);
    if (stored && (STYLES as readonly string[]).includes(stored)) return stored as StyleId;
  } catch { /* ignore */ }
  return DEFAULT_STYLE;
}

export function applyStyle(style: StyleId): void {
  document.documentElement.dataset.style = style;
  try { localStorage.setItem(STYLE_KEY, style); } catch { /* ignore */ }
  syncThemeColor();
}

/** The browser bar takes the colour of the strip at the top (it differs per style and scheme). */
export function syncThemeColor(): void {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--strip-bg').trim();
  const paper = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
  const color = !bg || bg === 'transparent' ? paper : bg.startsWith('var(') ? paper : bg;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', color));
}

/** Review build for the owner's phone (`VITE_REVIEW=1`): shows the style switcher, no service worker. */
export const review = import.meta.env.VITE_REVIEW === '1';

export const dev = {
  enabled: import.meta.env.DEV,
  theme: import.meta.env.DEV ? params.get('theme') : null,
  word: import.meta.env.DEV ? params.get('word') : null,
  state: import.meta.env.DEV ? (params.get('state') as 'cover' | 'revealed' | 'next' | null) : null,
};

/** Screenshots: settle or freeze every running animation. */
export function settleAnimations(): void {
  document.getAnimations().forEach((a) => a.finish());
}
export function freezeAnimations(atMs: number): void {
  document.getAnimations().forEach((a) => {
    a.pause();
    const total = Number(a.effect?.getComputedTiming().endTime ?? 0);
    a.currentTime = Math.min(atMs, total);
  });
}
