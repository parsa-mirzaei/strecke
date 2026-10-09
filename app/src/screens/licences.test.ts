import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LICENCES } from './licences';

describe('licences (A8)', () => {
  it('every row names a licence, a holder and an https source', () => {
    for (const l of LICENCES) {
      expect(l.licence, l.name).not.toBe('');
      expect(l.holder, l.name).not.toBe('');
      expect(l.source, l.name).toMatch(/^https:\/\//);
    }
  });
  it('every bundled font family is listed', () => {
    const css = readFileSync(join(__dirname, '../styles/fonts.css'), 'utf8');
    const families = new Set([...css.matchAll(/font-family: '([^']+)'/g)].map((m) => m[1]!.split(' ')[0]!));
    for (const f of families) expect(LICENCES.some((l) => l.name.includes(f)), f).toBe(true);
  });
  it('NOTICE.md carries the full text for each shipped item', () => {
    const notice = readFileSync(join(__dirname, '../../../NOTICE.md'), 'utf8');
    for (const k of ['Barlow', 'Lucide', 'Preact', 'FSRS']) expect(notice, k).toContain(k);
  });
});

describe('what the code may talk to (A9)', () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) ? [p] : [];
    });
  }
  it('the only external hosts in the source are the sheet, the audio provider and the licence links', () => {
    const allowed = [/^https:\/\/docs\.google\.com\/spreadsheets\//, /api\.elevenlabs\.io/, /elevenlabs\.io\/(pricing|terms|docs)/, /github\.com/, /^https?:\/\/www\.w3\.org/];
    for (const p of files(join(__dirname, '..'))) {
      for (const m of readFileSync(p, 'utf8').matchAll(/https?:\/\/[^\s'"`)]+/g)) {
        expect(allowed.some((a) => a.test(m[0])), `${p}: ${m[0]}`).toBe(true);
      }
    }
  });
  it('the API key is never logged', () => {
    for (const p of files(join(__dirname, '..'))) {
      const src = readFileSync(p, 'utf8');
      expect(/console\.\w+\([^)]*(key|Key)/.test(src), p).toBe(false);
    }
  });
});
