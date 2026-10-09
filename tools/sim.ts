/**
 * Compare scheduler designs on a synthetic learner (core/src/sim/sim.ts). The learner model is an
 * assumption, so the numbers are indicative, not proof.
 *
 *   node tools/sim.ts [seeds=5] [words=60] [days=60]
 */
import { ALL_DESIGNS, simulate, type SimResult } from '../core/src/sim/sim.ts';

const [seeds = 5, words = 120, days = 60] = process.argv.slice(2).map(Number);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };
const rows: string[] = [];
for (const design of ALL_DESIGNS) {
  const runs: SimResult[] = [];
  for (let s = 1; s <= seeds; s++) runs.push(simulate({ design, seed: String(s), words, days, addAtHalf: 20 }));
  const f = (k: (r: SimResult) => number | null, d = 2) => mean(runs.map((r) => k(r) ?? NaN)).toFixed(d);
  rows.push(`| ${design} | ${f((r) => r.retention)} | ${f((r) => r.production)} | ${f((r) => r.lateRetention)} | ${f((r) => r.cardsPerDay, 1)} | ${f((r) => r.duePerDay, 1)} | ${f((r) => r.introduced, 0)} | ${f((r) => r.known, 1)} ± ${sd(runs.map((r) => r.known)).toFixed(1)} | ${f((r) => r.daysToSecure, 1)} | ${f((r) => r.secureAtEnd, 1)} | ${f((r) => r.spread.karte * 100, 0)}/${f((r) => r.spread.recognition * 100, 0)}/${f((r) => r.spread.context * 100, 0)}/${f((r) => r.spread.production * 100, 0)} |`);
  console.error(`done ${design}`);
}
console.log(`Synthetic learner, ${words} words + 20 added on day ${Math.floor(days / 2)}, ${days} days, 2 runs of 6 cards a day, mean of ${seeds} seeds.\n`);
console.log('| design | retention | production | added words | cards/day | due/day | words met | words known | days to secure | secure at end | karte/recog/context/prod % |');
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
console.log(rows.join('\n'));
