import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Product rules as tests (A1, A4): nothing the interface says or draws may break them. */
function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p, ext) : ext.test(f) && !/\.test\./.test(f) ? [p] : [];
  });
}
const src = join(__dirname);
const code = files(src, /\.(tsx?|css)$/);

describe('A4: no pressure, no red', () => {
  const FORBIDDEN = /streak|overdue|backlog|forecast|leaderboard|ranking|fällig|überfällig|rückstand|verpasst|aufholen|serie\b|you missed|punkte|xp\b|level\b/i;
  it('no streak, overdue, backlog, forecast, comparison or "missed" anywhere in the interface code', () => {
    for (const p of code) {
      const text = readFileSync(p, 'utf8');
      expect(FORBIDDEN.test(text), `${p}: ${text.match(FORBIDDEN)?.[0]}`).toBe(false);
    }
  });
  it('no red: no red colour value or word in CSS or components', () => {
    for (const p of files(src, /\.(tsx?|css)$/)) {
      const text = readFileSync(p, 'utf8');
      expect(/(?<![a-z-])red(?![a-z])|crimson|#f00\b|#ff0000|rgb\(\s*2[0-5]\d\s*,\s*[0-9]{1,2}\s*,\s*[0-9]{1,2}\s*\)/i.test(text), p).toBe(false);
    }
  });
});

describe('A1: leaving a card is a labelled button', () => {
  it('no swipe or touch-move navigation is wired up outside the flap', () => {
    for (const p of files(src, /\.tsx?$/)) {
      const text = readFileSync(p, 'utf8');
      if (/Karte\.tsx$/.test(p)) continue; // the flap peel: reveal only
      expect(/onTouchMove|onTouchEnd|onPointerMove|swipe/i.test(text), p).toBe(false);
    }
  });
  it('the flap gesture only reveals: it never calls onNext or onAnswer', () => {
    const k = readFileSync(join(src, 'run/Karte.tsx'), 'utf8');
    const handlers = k.slice(k.indexOf('const down'), k.indexOf('function rate'));
    expect(handlers).not.toMatch(/onNext|onAnswer/);
  });
  it('every exercise has an exit that is a text button: Weiter or a rating, plus Fertig in the header', () => {
    const run = readFileSync(join(src, 'run/Run.tsx'), 'utf8');
    expect(run).toContain('>Fertig</button>');
    for (const f of ['Choice', 'Typed', 'Reorder']) expect(readFileSync(join(src, `run/${f}.tsx`), 'utf8')).toContain('>Weiter</button>');
    const karte = readFileSync(join(src, 'run/Karte.tsx'), 'utf8');
    for (const label of ['Nicht gewusst', 'Teilweise', 'Gewusst', 'Sofort']) expect(karte).toContain(label);
  });
});

describe('F1/A5: no hard-coded word content', () => {
  it('the UI has no German vocabulary list of its own: words come from records', () => {
    const demo = ['Haltestelle', 'Termin', 'Rechnung', 'Verspätung'];
    for (const p of code) for (const w of demo) expect(readFileSync(p, 'utf8').includes(w), `${p}: ${w}`).toBe(false);
  });
});
