/**
 * Check a seed file against the record rules before it goes anywhere (DECISIONS D47).
 * Contains no content: seed files live in the gitignored data/seed/ folder.
 *
 *   node tools/seed-check.ts data/seed/seed-50.csv
 *
 * Prints a report (mix, coverage, exercises generated, rows with reasons) and exits 1 if any row is invalid.
 */
import { readFileSync } from 'node:fs';
import { checkSeed, seedReport } from '../core/src/seed.ts';

const file = process.argv[2];
if (!file) {
  console.error('usage: node tools/seed-check.ts <seed.csv>');
  process.exit(2);
}

const parsed = checkSeed(readFileSync(file, 'utf8'));
if (parsed.error) {
  console.error(`seed-check: file refused: ${parsed.error}`);
  process.exit(1);
}
const r = seedReport(parsed);
const pct = (n: number) => `${Math.round((100 * n) / Math.max(1, r.valid))} %`;
const line = (label: string, m: Record<string, number>) =>
  console.log(`${label.padEnd(18)}${Object.entries(m).map(([k, v]) => `${k} ${v}`).join(' · ')}`);

console.log(`seed-check: ${file}`);
console.log(`${'rows'.padEnd(18)}${r.rows} (${r.valid} valid)`);
line('tier', r.byTier);
line('pos', r.byPos);
line('domain', r.byDomain);
console.log(`${'chunks'.padEnd(18)}${pct(r.byTier.chunk ?? 0)} (target about 33 %)`);
console.log(`${'thin rows'.padEnd(18)}${r.thin}`);
console.log(`${'second example'.padEnd(18)}${r.withSecondExample} (${pct(r.withSecondExample)})`);
console.log(`${'prep / colloc.'.padEnd(18)}${r.withPrep} / ${r.withCollocation}`);
line('exercises', r.exercises);
if (r.invalid.length) {
  console.log('\ninvalid rows:');
  for (const row of r.invalid) console.log(`  line ${row.line} (${row.de || '?'}): ${row.reasons.join(', ')}`);
  process.exit(1);
}
console.log('\nseed-check: all rows valid');
