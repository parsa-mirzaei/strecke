/**
 * Runs a sheet export (CSV) through the real ingestion and exercise generator and prints what came out.
 * For the learner's own data: the output goes to the terminal only and must never be committed.
 *
 *   node tools/real-data-report.ts data/seed/seed-50.csv [examples=10]
 */
import { readFileSync } from 'node:fs';
import { parseCsv } from '../core/src/csv.ts';
import { exercisesFor, EXERCISE_TYPES } from '../core/src/exercises.ts';
import { toWordRecord } from '../core/src/record.ts';
import { ingest, introductionOrder } from '../core/src/sheet/ingest.ts';

const [, , file, n = '10'] = process.argv;
if (!file) { console.error('usage: node tools/real-data-report.ts <csv> [examples]'); process.exit(2); }
const { library, report } = ingest(null, parseCsv(readFileSync(file, 'utf8')), Date.now());
const words = introductionOrder(library).map((it) => toWordRecord({ ...it.row, status: 'active' }));

console.log(`rows ingested: ${words.length}; skipped: ${report.issues.filter((i) => i.skipped).length}; with notes: ${report.issues.filter((i) => !i.skipped).length}; duplicates: ${report.duplicates.length}; unknown columns: ${report.unknownColumns.join(', ') || '-'}`);
for (const i of report.issues) console.log(`  line ${i.line} ${i.skipped ? 'SKIPPED' : 'note'}: ${i.notes.join('; ')}`);

const perType = Object.fromEntries(EXERCISE_TYPES.map((t) => [t, 0]));
const all = words.map((w) => ({ w, xs: exercisesFor(w, words, { extended: true, fewerOptions: true }) }));
for (const { xs } of all) for (const x of xs) perType[x.type]!++;
console.log('\nrows qualifying per exercise type:');
for (const t of EXERCISE_TYPES) console.log(`  ${t.padEnd(13)} ${perType[t]}`);
const twoOpt = all.flatMap(({ xs }) => xs).filter((x) => x.options.length === 2).length;
console.log(`choice exercises with only two options: ${twoOpt}`);

console.log(`\n${n} generated exercises (choice types first):`);
const choice = all.flatMap(({ w, xs }) => xs.filter((x) => x.options.length > 0 && x.type !== 'artikel' && x.type !== 'praeposition').map((x) => ({ w, x })));
const step = Math.max(1, Math.floor(choice.length / Number(n)));
for (let i = 0; i < choice.length && i / step < Number(n); i += step) {
  const { w, x } = choice[i]!;
  console.log(`- [${x.type}] ${w.de}: ${x.gapped || x.sentence || w.de}\n    answer: ${x.answer}\n    options: ${x.options.join(' | ')}`);
}
