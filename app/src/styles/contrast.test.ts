import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The palette lives in tokens.css only (R2-13). This test reads it and checks WCAG AA for every pair the
 * interface uses, in light and dark, so retuning a colour that breaks contrast fails here.
 */
const css = readFileSync(join(__dirname, 'tokens.css'), 'utf8');

function block(re: RegExp): Record<string, string> {
  const m = css.match(re);
  if (!m) throw new Error(`block not found: ${re}`);
  return Object.fromEntries([...m[1]!.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((x) => [x[1]!, x[2]!]));
}
const light = block(/:root \{([\s\S]*?)\n\}/);
const dark = { ...light, ...block(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/) };

const lum = (h: string) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };

/** [foreground, background, minimum ratio, why] */
const PAIRS: Array<[string, string, number, string]> = [
  ['ink', 'ground', 4.5, 'body text'], ['ink', 'card', 4.5, 'card text'],
  ['ink2', 'ground', 4.5, 'secondary text'], ['ink2', 'card', 4.5, 'secondary text on card'],
  ['on-amber', 'amber', 4.5, 'flap label'],
  ['teal-text', 'card', 4.5, 'secure numbers, right answer'], ['teal-text', 'ground', 4.5, 'secure numbers on page'],
  ['on-teal', 'teal', 4.5, 'selected Sofort'], ['on-mid', 'mid', 4.5, 'selected Gewusst'], ['on-fog-sel', 'fog-sel', 4.5, 'selected Nicht gewusst'],
  ['ground', 'ink', 4.5, 'primary button label'],
  ['amber-edge', 'card', 3, 'blank outline and Teilweise border (graphic)'],
  ['control', 'ground', 3, 'control borders on page'], ['control', 'card', 3, 'control borders on card'],
  ['mid', 'card', 3, 'Gewusst border (graphic)'], ['teal', 'card', 3, 'Sofort border and route stops (graphic)'],
  ['fog-mark', 'ground', 3, 'Nicht gewusst stop and bar (graphic)'],
  ['amber', 'ground', 2, 'amber fill (decoration; the label on it is checked above)'],
];

describe.each([['light', light], ['dark', dark]] as const)('contrast, %s', (_n, t) => {
  for (const [fg, bg, min, why] of PAIRS) {
    it(`${fg} on ${bg} ≥ ${min}:1 (${why})`, () => {
      expect(ratio(t[fg]!, t[bg]!), `${t[fg]} on ${t[bg]}`).toBeGreaterThanOrEqual(min);
    });
  }
  it('no red anywhere: no token is predominantly red', () => {
    for (const [k, v] of Object.entries(t)) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
      expect(!(r! > 150 && g! < 0.45 * r! && b! < 0.45 * r!), `${k} ${v}`).toBe(true);
    }
  });
});
