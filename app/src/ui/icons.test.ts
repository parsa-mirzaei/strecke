import { describe, expect, it } from 'vitest';
import { IMAGE_KEYS } from '@core/schema.ts';
import { ICONS } from './icons';

const TAGS = new Set(['path', 'circle', 'ellipse', 'line', 'polygon', 'polyline', 'rect']);

describe('bundled icons', () => {
  it('every image_key the validator accepts has a pictogram', () => {
    for (const k of IMAGE_KEYS) expect(ICONS[k], k).toBeDefined();
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
