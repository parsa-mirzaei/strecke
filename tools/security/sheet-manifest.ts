/**
 * Hash manifest for spreadsheet values captured from the Sheets API (`{ tab: values[][] }` JSON).
 * Used by the live recovery test: manifest before damage == manifest after restore proves the restore
 * is byte-exact. With two files, prints which tabs and rows differ.
 * Usage: node --experimental-strip-types tools/security/sheet-manifest.ts before.json [after.json]
 */
import { readFileSync } from 'node:fs';
import { canonical, sha256 } from '../../core/src/sha256.ts';

type Values = Record<string, string[][]>;
const load = (p: string): Values => JSON.parse(readFileSync(p, 'utf8'));
const manifest = (v: Values) =>
  Object.fromEntries(Object.entries(v).map(([tab, rows]) => [tab, { rows: rows.length, sha256: sha256(canonical(rows)) }]));

const [a, b] = process.argv.slice(2);
if (!a) throw new Error('usage: sheet-manifest.ts before.json [after.json]');
const before = load(a);
console.log(JSON.stringify({ file: a, manifest: manifest(before) }, null, 1));
if (b) {
  const after = load(b);
  const mb = manifest(before), ma = manifest(after);
  for (const tab of new Set([...Object.keys(mb), ...Object.keys(ma)])) {
    const same = mb[tab]?.sha256 === ma[tab]?.sha256;
    console.log(`${tab}: ${same ? 'IDENTICAL' : 'DIFFERS'}`);
    if (same) continue;
    const x = (before[tab] ?? []).map((r) => canonical(r)), y = (after[tab] ?? []).map((r) => canonical(r));
    const n = Math.max(x.length, y.length);
    for (let i = 0; i < n; i++) if (x[i] !== y[i]) console.log(`  row ${i + 1}: ${x[i] ?? '(none)'}  ->  ${y[i] ?? '(none)'}`);
  }
}
