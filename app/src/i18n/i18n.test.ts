/**
 * Every user-facing string goes through the string table (PORT_MAP feature B). The checker parses each
 * component with the TypeScript compiler and fails on literal text: JSX text, user-facing attributes
 * and props, and strings in expressions (ternaries, tables). Learning content is data, never code here.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { literalStrings } from './checker';
import { de } from './de';
import { en } from './en';
import { setLocale, t } from './index';

const SRC = join(__dirname, '..');
function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return tsxFiles(p);
    return p.endsWith('.tsx') && !p.includes('.test.') ? [p] : [];
  });
}

describe('UI strings', () => {
  it('no component contains literal user-facing text', () => {
    const offenders = tsxFiles(SRC).flatMap((f) => literalStrings(readFileSync(f, 'utf8'), f).map((s) => `${f.slice(SRC.length + 1)}: ${s}`));
    expect(offenders).toEqual([]);
  });

  it('the checker catches text, attributes, props, ternaries and string tables', () => {
    expect(literalStrings('const a = <p>Hallo <b>{x}</b></p>;')).toEqual(['Hallo']);
    expect(literalStrings('const a = <button aria-label="Close" class="x" />;')).toEqual(['aria-label="Close"']);
    expect(literalStrings('const a = <Field label="Neue Karten" />;')).toEqual(['label="Neue Karten"']);
    expect(literalStrings("const a = <p>{ok ? 'Richtig.' : 'Nochmal'}</p>;")).toEqual(['Richtig.', 'Nochmal']);
    expect(literalStrings("const ASK = { artikel: 'Welcher Artikel passt?' };")).toEqual(['Welcher Artikel passt?']);
    expect(literalStrings("const a = <p class={`tag ${x}`}>{t('ok')}</p>;")).toEqual([]);
    expect(literalStrings("el.style.transform = `rotateX(${d}deg)`; document.querySelector('.chips .chip');")).toEqual([]);
  });

  it('German has exactly the English keys, no value is empty, placeholders match', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(en[k].trim(), k).not.toBe('');
      expect(de[k].trim(), k).not.toBe('');
      expect(ph(de[k]), k).toEqual(ph(en[k]));
    }
  });

  it('English is the default; the rating labels are as specified (Again/Hard/Good/Easy)', () => {
    setLocale('en');
    expect([1, 2, 3, 4].map((r) => t(`rate.${r}` as 'rate.1'))).toEqual(["Didn't know", 'Partly', 'Knew it', 'Instantly']);
    setLocale('de');
    expect([1, 2, 3, 4].map((r) => t(`rate.${r}` as 'rate.1'))).toEqual(['Nicht gewusst', 'Teilweise', 'Gewusst', 'Sofort']);
    expect(t('common.next')).toBe('Weiter');
    expect(t('typed.near', { answer: 'Verspätung' })).toBe('Fast: Verspätung');
    setLocale('en');
  });

  it('no loss, praise or pressure language in either language', () => {
    const banned = /\b(wrong|failed|missed|great job|awesome|falsch|verpasst|toll gemacht|streak|overdue|backlog|überfällig|rückstand)\b/i;
    const allowed = new Set(['data.col.wrong', 'col.wrong_1', 'col.wrong_2']);
    const all = [...Object.entries(en), ...Object.entries(de)].filter(([k]) => !allowed.has(k));
    expect(all.filter(([, v]) => banned.test(v))).toEqual([]);
  });
});
