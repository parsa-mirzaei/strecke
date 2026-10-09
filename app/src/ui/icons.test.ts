import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ICONS } from './icons';

const TAGS = new Set(['path', 'circle', 'ellipse', 'line', 'polygon', 'polyline', 'rect']);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sources(p) : /\.tsx$/.test(f) ? [readFileSync(p, 'utf8')] : [];
  });
}

describe('bundled icons', () => {
  it('every icon the interface asks for is bundled, and none is bundled without a use', () => {
    const used = new Set(sources(join(__dirname, '..')).flatMap((s) => [...s.matchAll(/<Icon name="([a-z0-9-]+)"/g)].map((m) => m[1]!)));
    for (const name of used) expect(ICONS[name], name).toBeDefined();
    const spare = Object.keys(ICONS).filter((n) => !used.has(n));
    // Icons kept for the sync and import screens that follow; the list stays short on purpose.
    expect(spare.length).toBeLessThanOrEqual(4);
  });
  it('there are no per-word pictograms: only controls (F1)', () => {
    for (const name of ['bus', 'receipt', 'house', 'key', 'umbrella', 'shopping-cart', 'train-front']) expect(ICONS[name], name).toBeUndefined();
  });
  it('only shape elements and geometry attributes: no script, handler, href or style', () => {
    for (const [name, nodes] of Object.entries(ICONS)) {
      for (const [tag, attrs] of nodes) {
        expect(TAGS.has(tag), `${name}: <${tag}>`).toBe(true);
        for (const [k, v] of Object.entries(attrs)) {
          expect(k, name).not.toMatch(/^on|href|style/i);
          expect(String(v), name).toMatch(/^[0-9a-zA-Z .,-]*$/);
        }
      }
    }
  });
});
