/**
 * Every user-facing string goes through the string table (D53). This test parses each component with
 * the TypeScript compiler and fails on JSX text or on a user-facing attribute (aria-label, title,
 * placeholder, alt) that contains a letter outside `{…}`. Learning content is data, not code, so it
 * never shows up here.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { de } from './de';
import { en } from './en';
import { setLocale, t } from './index';

const SRC = join(__dirname, '..');
const USER_FACING_ATTRS = new Set(['aria-label', 'title', 'placeholder', 'alt', 'aria-description']);

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return tsxFiles(p);
    return p.endsWith('.tsx') && !p.endsWith('.test.tsx') ? [p] : [];
  });
}

export function literalStrings(source: string, file = 'x.tsx'): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isJsxText(n) && /\p{L}/u.test(n.text)) found.push(n.text.trim());
    if (ts.isJsxAttribute(n) && n.initializer && ts.isStringLiteral(n.initializer)) {
      const name = n.name.getText(sf);
      if (USER_FACING_ATTRS.has(name) && /\p{L}/u.test(n.initializer.text)) found.push(`${name}="${n.initializer.text}"`);
    }
    // {'Some text'} as a JSX child.
    if (ts.isJsxExpression(n) && n.expression && (ts.isStringLiteral(n.expression) || ts.isNoSubstitutionTemplateLiteral(n.expression))
      && ts.isJsxElement(n.parent) && /\p{L}/u.test(n.expression.text)) found.push(n.expression.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

describe('UI strings', () => {
  it('no component contains literal user-facing text', () => {
    const offenders = tsxFiles(SRC).flatMap((f) => literalStrings(readFileSync(f, 'utf8'), f).map((s) => `${f.slice(SRC.length + 1)}: ${s}`));
    expect(offenders).toEqual([]);
  });

  it('the checker itself catches text, attributes and string children', () => {
    expect(literalStrings('const a = <p>Hallo <b>{x}</b></p>;')).toEqual(['Hallo']);
    expect(literalStrings('const a = <button aria-label="Close" class="x" />;')).toEqual(['aria-label="Close"']);
    expect(literalStrings("const a = <p>{'Weiter'}</p>;")).toEqual(['Weiter']);
    expect(literalStrings("const a = <p>{t('ok')} · {'  ·  '}</p>;")).toEqual([]);
  });

  it('German has exactly the English keys, and no value is empty', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    for (const [k, v] of [...Object.entries(en), ...Object.entries(de)]) expect(v.trim(), k).not.toBe('');
  });

  it('placeholders match between languages', () => {
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const k of Object.keys(en) as (keyof typeof en)[]) expect(ph(de[k]), k).toEqual(ph(en[k]));
  });

  it('English is the default; the rating labels are as specified', () => {
    setLocale('en');
    expect([1, 2, 3, 4].map((r) => t(`rate.${r}` as 'rate.1'))).toEqual(["Didn't know", 'Partly', 'Knew it', 'Instantly']);
    setLocale('de');
    expect(t('practice.next')).toBe('Weiter');
    expect(t('practice.almost', { answer: 'Verspätung' })).toBe('Fast: Verspätung');
    setLocale('en');
  });

  it('no string uses loss or praise language, or the colour red', () => {
    const banned = /\b(wrong|failed|missed|great job|awesome|super!|falsch|verpasst|toll gemacht|streak|red)\b/i;
    const all = [...Object.entries(en), ...Object.entries(de)].filter(([k]) => !k.startsWith('restore.problem') && k !== 'notice.saveFailed');
    expect(all.filter(([, v]) => banned.test(v))).toEqual([]);
  });
});
