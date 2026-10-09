import { describe, expect, it } from 'vitest';
import { bigTable, stressTable, tinyTable } from '../src/data/stress-sheet.ts';
import { composeRun } from '../src/engine/run.ts';
import { thinRows } from '../src/engine/eligibility.ts';
import { dashboard } from '../src/engine/stats.ts';
import { exercisesFor } from '../src/exercises.ts';
import { toWordRecord } from '../src/record.ts';
import { ingest, introductionOrder } from '../src/sheet/ingest.ts';

const T0 = Date.parse('2026-10-09T08:00:00Z');
const load = (table: string[][]) => {
  const { library, report } = ingest(null, table, T0);
  return { words: introductionOrder(library).map((it) => toWordRecord({ ...it.row, status: 'active' })), report };
};

describe('stress fixture: messy data', () => {
  const { words, report } = load(stressTable());
  it('ingests what it can, lists the rest in plain words', () => {
    const skipped = report.issues.filter((i) => i.skipped).map((i) => i.de);
    expect(skipped).toEqual(expect.arrayContaining(['Kühlschrank', 'klasse']));
    expect(report.duplicates).toHaveLength(1);
    expect(report.unknownColumns).toEqual(['Lernstand (eigene Spalte)']);
    expect(report.issues.find((i) => i.de === 'Schrank')!.notes).toContain('Artikel fehlt');
    expect(words.find((w) => w.de === 'Feierabend')!.note).toBe(''); // the emoji note cell is dropped, the word stays
    expect(words.some((w) => w.de === 'A')).toBe(true);
    expect(words.filter((w) => w.de === 'Bank')).toHaveLength(2);
  });
  it('every ingested row yields exercises; long rows keep their long sentences', () => {
    for (const w of words) expect(exercisesFor(w, words, { extended: true, fewerOptions: true }).length, w.de).toBeGreaterThan(0);
    expect(words.find((w) => w.de === 'mitbringen')!.examples[0]!.de.split(' ').length).toBeGreaterThanOrEqual(25);
  });
  it('a run can be composed many times without errors', () => {
    for (let i = 0; i < 20; i++) expect(composeRun({ words, events: [], now: T0, seed: `s${i}`, canListen: true }).length).toBeGreaterThan(0);
  });
  it('three rows are enough for a run', () => {
    const tiny = load(tinyTable()).words;
    expect(tiny).toHaveLength(3);
    expect(composeRun({ words: tiny, events: [], now: T0, seed: 'x', canListen: true }).length).toBeGreaterThan(0);
  });
  it('500 rows: ingest, compose and the dashboard stay fast', () => {
    const t = performance.now();
    const big = load(bigTable(500)).words;
    const t1 = performance.now();
    const run = composeRun({ words: big, events: [], now: T0, seed: 'big', canListen: true });
    const t2 = performance.now();
    dashboard({ words: big, events: [], now: T0, tzOffsetMin: 0 });
    const t3 = performance.now();
    expect(big.length).toBeGreaterThan(480);
    expect(run.length).toBeGreaterThan(0);
    expect(t1 - t).toBeLessThan(3000);
    expect(t2 - t1).toBeLessThan(500);
    expect(t3 - t2).toBeLessThan(500);
  });
  it('the thin-row hints work on 500 rows', () => {
    const big = load(bigTable(500)).words;
    const t = performance.now();
    thinRows(big);
    expect(performance.now() - t).toBeLessThan(8000);
  });
});
