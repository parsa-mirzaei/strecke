/**
 * Which exercises a row's columns allow, and what a thin row would gain from one more column
 * (ENGINE.md "Eligibility"). The hints are for Settings > Daten: help, not a to-do list. Nothing is
 * ever invented to fill a gap.
 */
import { exercisesFor, EXERCISE_TYPES, type ExerciseType } from '../exercises.ts';
import { collocationSplit } from './distractors.ts';
import type { WordRecord } from '../record.ts';

export interface Hint {
  /** The sheet column (or columns) that would unlock more. */
  column: string;
  unlocks: ExerciseType[];
  /** Short German reason for the UI. */
  why: string;
}

export interface RowEligibility {
  wordId: string;
  de: string;
  available: ExerciseType[];
  hints: Hint[];
}

/** Types the row can produce right now, with the other rows of the sheet as the distractor pool. */
export function eligibleTypes(w: WordRecord, all: readonly WordRecord[]): ExerciseType[] {
  const have = new Set(exercisesFor(w, all, { extended: true, fewerOptions: true }).map((x) => x.type));
  return EXERCISE_TYPES.filter((t) => have.has(t));
}

export function rowEligibility(w: WordRecord, all: readonly WordRecord[]): RowEligibility {
  const available = eligibleTypes(w, all);
  const has = new Set(available);
  const hints: Hint[] = [];
  const add = (column: string, unlocks: ExerciseType[], why: string) => {
    const missing = unlocks.filter((t) => !has.has(t));
    if (missing.length) hints.push({ column, unlocks: missing, why });
  };
  if (w.pos === 'noun' && !w.article) add('article', ['artikel'], 'Artikel fehlt');
  if (w.pos === 'noun' && w.article && !w.plural) add('plural', ['plural'], 'Mehrzahl fehlt');
  if (!w.examples.length) add('example_de, example_en', ['luecke', 'tippen', 'reihenfolge'], 'Beispielsatz fehlt');
  else if (w.examples.length < 2) add('example_2_de, example_2_en', ['kontext2'], 'Zweiter Beispielsatz fehlt');
  if (!w.collocation) add('collocation', ['kollokation'], 'Wortverbindung fehlt');
  else if (!collocationSplit(w)) hints.push({ column: 'collocation', unlocks: ['kollokation'], why: 'Wortverbindung enthält das Wort nicht' });
  if (!w.prep && (w.pos === 'verb' || w.pos === 'adj')) add('prep', ['praeposition'], 'Präposition fehlt');
  // A record with sentences but no choice exercise usually lacks neighbours of the same word class.
  if (!has.has('bedeutung') && !w.wrong.length) hints.push({ column: 'wrong_1, wrong_2', unlocks: ['bedeutung', 'hoeren'], why: 'zu wenige ähnliche Wörter für Antwortmöglichkeiten' });
  return { wordId: w.id, de: w.de, available, hints };
}

export interface ThinSummary {
  /** Rows that would gain at least one exercise type, most to gain first. */
  rows: RowEligibility[];
  /** Per column: how many rows would gain, and what. */
  byColumn: Array<{ column: string; rows: number; unlocks: ExerciseType[] }>;
}

export function thinRows(words: readonly WordRecord[]): ThinSummary {
  const active = words.filter((w) => w.status !== 'suspended');
  const rows = active.map((w) => rowEligibility(w, active)).filter((r) => r.hints.length);
  const gain = (r: RowEligibility) => r.hints.reduce((n, h) => n + h.unlocks.length, 0);
  rows.sort((a, b) => gain(b) - gain(a) || (a.de < b.de ? -1 : 1));
  const cols = new Map<string, { rows: number; unlocks: Set<ExerciseType> }>();
  for (const r of rows) for (const h of r.hints) {
    const c = cols.get(h.column) ?? { rows: 0, unlocks: new Set<ExerciseType>() };
    c.rows++;
    h.unlocks.forEach((t) => c.unlocks.add(t));
    cols.set(h.column, c);
  }
  const byColumn = [...cols].map(([column, c]) => ({ column, rows: c.rows, unlocks: [...c.unlocks] })).sort((a, b) => b.rows - a.rows);
  return { rows, byColumn };
}

