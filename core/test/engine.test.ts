import { describe, expect, it } from 'vitest';
import { exercisesFor, EXERCISE_TYPES, type Exercise, type ExerciseType } from '../src/exercises.ts';
import { toWordRecord, type WordRecord } from '../src/record.ts';
import { buildConfusions, collocationSplit, meaningsOverlap, sameStem } from '../src/engine/distractors.ts';
import { eligibleTypes, rowEligibility, thinRows } from '../src/engine/eligibility.ts';
import { chooseForRun, composeRun, effortCeiling, EFFORT } from '../src/engine/run.ts';
import { gapExceeded, splitRuns } from '../src/engine/runs.ts';
import { DEFAULT_SETTINGS } from '../src/engine/settings.ts';
import { DEFAULT_CONFIG, eventFromRow, eventToRow, initialState, ratingFor, replay, step, type LearnEvent, type WordState } from '../src/scheduler.ts';
import { by, rec, ROWS, sheet } from './fixtures/engine-sheet.ts';

const T0 = Date.parse('2026-10-07T08:00:00Z');
const MIN = 60_000, DAY = 86_400_000;

let seq = 0;
const ev = (w: WordRecord, over: Partial<LearnEvent> = {}): LearnEvent => ({
  id: `e_${String(++seq).padStart(8, '0')}`, ts: T0 + seq * MIN, wordId: w.id, kind: 'review', exercise: 'luecke',
  correct: true, ms: 2000, help: false, dontKnow: false, ...over,
});
const type = (xs: Exercise[], t: ExerciseType) => xs.find((x) => x.type === t);
const ext = (w: WordRecord, all: readonly WordRecord[], o = {}) => exercisesFor(w, all, { extended: true, ...o });

describe('eligibility: which columns allow which exercises', () => {
  const all = sheet();
  const table: Array<[string, string, ExerciseType[], ExerciseType[]]> = [
    // row, label, must have, must not have
    ['Termin', 'a full noun', ['karte', 'artikel', 'plural', 'bedeutung', 'luecke', 'kollokation', 'hoeren', 'tippen', 'reihenfolge', 'kontext2'], ['praeposition']],
    ['Haltestelle', 'full with prep', ['praeposition', 'plural', 'kollokation'], []],
    ['Fenster', 'article only', ['karte', 'artikel', 'bedeutung', 'hoeren'], ['plural', 'luecke', 'tippen', 'reihenfolge', 'kollokation', 'kontext2', 'praeposition']],
    ['pünktlich', 'adjective with one example', ['karte', 'luecke', 'tippen', 'reihenfolge'], ['artikel', 'plural', 'kontext2', 'kollokation']],
    ['gemütlich', 'adjective, no example', ['karte', 'bedeutung', 'hoeren'], ['luecke', 'tippen', 'reihenfolge']],
    ['sich kümmern', 'verb with prep and two forms', ['luecke', 'praeposition', 'kontext2'], ['artikel', 'plural']],
  ];
  for (const [de, label, has, hasNot] of table) {
    it(`${de} (${label})`, () => {
      const t = eligibleTypes(by(all, de), all);
      for (const x of has) expect(t, `${de} should have ${x}`).toContain(x);
      for (const x of hasNot) expect(t, `${de} should not have ${x}`).not.toContain(x);
    });
  }
  it('Reihenfolge needs 4 to 12 words; a short example gets none', () => {
    const short = rec({ de: 'Hunger', article: 'der', en: 'hunger', pos: 'noun', example_de: 'Ich habe Hunger.', example_en: 'I am hungry.' });
    expect(eligibleTypes(short, [short, ...all])).not.toContain('reihenfolge');
    expect(eligibleTypes(short, [short, ...all])).toContain('tippen');
  });
  it('Kollokation only when the collocation contains the word itself', () => {
    const odd = rec({ de: 'Termin', article: 'der', en: 'appointment', pos: 'noun', collocation: 'etwas ganz anderes machen' });
    expect(collocationSplit(odd)).toBeNull();
    expect(collocationSplit(by(all, 'Termin'))).toEqual({ answer: 'vereinbaren', gapped: 'einen Termin ___' });
  });
  it('the legacy catalogue is unchanged unless extended is asked for', () => {
    const t = exercisesFor(by(all, 'Termin'), all).map((x) => x.type);
    expect(t).not.toContain('plural');
    expect(t).not.toContain('reihenfolge');
  });
  it('nothing is invented: a row without de or en gives no exercise at all', () => {
    expect(ext(rec({ ...ROWS.termin!, en: '' }), all)).toEqual([]);
  });
});

describe('thin rows: which column would unlock which exercise', () => {
  const all = sheet();
  it('names the column for a bare noun', () => {
    const r = rowEligibility(by(all, 'Fenster'), all);
    const cols = Object.fromEntries(r.hints.map((h) => [h.column, h.unlocks]));
    expect(cols['plural']).toEqual(['plural']);
    expect(cols['example_de, example_en']).toEqual(expect.arrayContaining(['luecke', 'tippen', 'reihenfolge']));
    expect(cols['collocation']).toEqual(['kollokation']);
  });
  it('a complete row has no hints', () => {
    const full = rec({ ...ROWS.termin!, prep: 'bei' });
    expect(rowEligibility(full, [full, ...all]).hints).toEqual([]);
  });
  it('summary: most to gain first, per-column counts', () => {
    const s = thinRows(all);
    expect(s.rows[0]!.hints.length).toBeGreaterThan(0);
    expect(s.rows.every((r) => r.hints.length > 0)).toBe(true);
    expect(s.byColumn.find((c) => c.column === 'collocation')!.rows).toBeGreaterThan(3);
    const gains = s.rows.map((r) => r.hints.reduce((n, h) => n + h.unlocks.length, 0));
    expect(gains).toEqual([...gains].sort((a, b) => b - a));
  });
  it('a one-row sheet: suggestions, no crash, no choice exercises', () => {
    const only = rec('termin');
    expect(eligibleTypes(only, [only])).toEqual(['karte', 'artikel', 'tippen', 'reihenfolge']);
    expect(thinRows([only]).rows.length).toBe(1);
  });
});

describe('distractor rules', () => {
  const all = sheet();
  it('never the target itself, never twice, always from other rows of the sheet', () => {
    const own = new Set(all.flatMap((w) => [w.en, w.plural, ...w.examples.map((e) => e.form), w.de]));
    for (const w of all) for (const x of ext(w, all)) {
      if (!x.options.length) continue;
      expect(x.options.filter((o) => o === x.answer)).toHaveLength(1);
      expect(new Set(x.options.map((o) => o.toLowerCase())).size).toBe(x.options.length);
      if (x.type === 'artikel' || x.type === 'praeposition') continue;
      for (const o of x.options) if (o !== x.answer) expect(own.has(o) || all.some((v) => v.collocation.includes(o)), `${w.de}/${x.type}: ${o}`).toBe(true);
    }
  });
  it('ambiguity guard: a synonym of the answer is never a wrong meaning', () => {
    const rechnung = by(all, 'Rechnung');
    const opts = type(ext(rechnung, all), 'bedeutung')!.options;
    expect(opts).not.toContain('receipt, invoice');
    expect(meaningsOverlap('bill, invoice', 'receipt, invoice')).toBe(true);
    expect(meaningsOverlap('stop (bus, tram)', 'bus stop')).toBe(true);
    expect(meaningsOverlap('to take care of', 'to wait for')).toBe(false);
    expect(meaningsOverlap('delay', 'bill, invoice')).toBe(false);
  });
  it('ambiguity guard: the other meaning of a homonym is not a distractor', () => {
    const bank = by(all, 'Bank', 'bank');
    const x = type(ext(bank, all), 'bedeutung');
    expect(x?.options ?? []).not.toContain('bench');
  });
  it('ambiguity guard: an inflection of the answer is not a wrong form', () => {
    expect(sameStem('Verspätung', 'Verspätungen')).toBe(true);
    expect(sameStem('Termin', 'Rechnung')).toBe(false);
    const extra = rec({ de: 'Verspätungsanzeige', article: 'die', en: 'delay notice', pos: 'noun', example_de: 'Die Verspätungsanzeige hängt am Gleis.', example_en: 'The delay notice hangs at the platform.' });
    const pool = [...all, extra];
    const l = type(ext(by(pool, 'Verspätung'), pool), 'luecke');
    expect(l?.options ?? []).not.toContain('Verspätungsanzeige');
  });
  it('ambiguity guard: a form that already makes a phrase the sheet contains is dropped', () => {
    const a = rec({ de: 'Zeitung', article: 'die', en: 'newspaper', pos: 'noun', example_de: 'Ich lese jeden Morgen die Zeitung.', example_en: 'I read the paper every morning.' });
    const b = rec({ de: 'Buch', article: 'das', en: 'book', pos: 'noun', example_de: 'Ich lese jeden Morgen das Buch.', example_en: 'I read the book every morning.' });
    const c = rec({ de: 'Heft', article: 'das', en: 'notebook', pos: 'noun', example_de: 'Das Heft liegt auf dem Tisch.', example_en: 'The notebook is on the table.' });
    const d = rec({ de: 'Tisch', article: 'der', en: 'table', pos: 'noun', example_de: 'Der Tisch ist sehr groß.', example_en: 'The table is very big.' });
    const l = type(ext(a, [a, b, c, d]), 'luecke')!;
    expect(l.options).toContain('Zeitung');
    expect(l.options).toHaveLength(3);
    // 'Buch' is fine as a form, but "die Buch" is not what the sheet says; the guard only removes exact sheet phrases.
    const same = rec({ de: 'Zeitung', article: 'die', en: 'newspaper', pos: 'noun', example_de: 'Ich lese jeden Morgen die Zeitung.', example_en: '.' });
    const twin = rec({ de: 'Lektüre', article: 'die', en: 'reading', pos: 'noun', example_de: 'Ich lese jeden Morgen die Lektüre.', example_en: '.' });
    const e2 = rec({ de: 'Ordner', article: 'der', en: 'folder', pos: 'noun', example_de: 'Der Ordner steht im Regal.', example_en: '.' });
    const f2 = rec({ de: 'Stapel', article: 'der', en: 'pile', pos: 'noun', example_de: 'Der Stapel wird höher.', example_en: '.' });
    const l2 = type(ext(same, [same, twin, e2, f2]), 'luecke')!;
    expect(l2.options).not.toContain('Lektüre');
  });
  it('plural: other nouns plurals, never the singular or the same lemma', () => {
    const p = type(ext(by(all, 'Termin'), all), 'plural')!;
    expect(p.answer).toBe('Termine');
    expect(p.options).toHaveLength(3);
    expect(p.options).not.toContain('Termin');
  });
  it('collocation: a partner the sheet already pairs with the word is dropped', () => {
    const t = rec('termin');
    const alt = rec({ de: 'Arzt', article: 'der', en: 'doctor', pos: 'noun', collocation: 'einen Termin buchen' }); // also valid for Termin
    const x = rec({ de: 'Rechnung', article: 'die', en: 'bill', pos: 'noun', collocation: 'eine Rechnung bezahlen' });
    const y = rec({ de: 'Ausweis', article: 'der', en: 'ID card', pos: 'noun', collocation: 'einen Ausweis beantragen' });
    const z = rec({ de: 'Brief', article: 'der', en: 'letter', pos: 'noun', collocation: 'einen Brief schreiben' });
    const k = type(ext(t, [t, alt, x, y, z]), 'kollokation')!;
    expect(k.answer).toBe('vereinbaren');
    expect(k.options).not.toContain('buchen');
    expect(k.options.sort()).toEqual(expect.arrayContaining(['vereinbaren']));
    expect(k.options).toHaveLength(3);
  });
  it('previously confused options come first', () => {
    const rechnung = by(all, 'Rechnung');
    const base = type(ext(rechnung, all), 'bedeutung')!.options;
    const wrong = base.find((o) => o !== 'bill, invoice')!;
    const pool = all.filter((w) => w.pos === 'noun' && w.id !== rechnung.id && w.en !== 'receipt, invoice' && w.en !== wrong);
    const target = pool[pool.length - 1]!.en; // the least likely candidate by shape
    const conf = buildConfusions([{ wordId: rechnung.id, correct: false, chosen: target }, { wordId: rechnung.id, correct: false, chosen: target }]);
    const opts = type(ext(rechnung, all, { confusions: conf }), 'bedeutung')!.options;
    expect(opts).toContain(target);
  });
  it('too few candidates: fewer options when allowed, otherwise the exercise is skipped', () => {
    const a = rec('termin'), b = rec('rechnung'), c = rec('haltestelle');
    const small = [a, b, c];
    expect(type(ext(a, small), 'bedeutung')?.options).toHaveLength(3);
    const two = [a, b];
    expect(type(ext(a, two), 'bedeutung')).toBeUndefined();
    expect(type(ext(a, two, { fewerOptions: true }), 'bedeutung')?.options).toHaveLength(2);
    expect(type(ext(a, [a]), 'bedeutung', )).toBeUndefined();
  });
  it('very long compounds are ordinary strings: the exercise is built and the word survives', () => {
    const w = by(all, 'Krankenkassenbeitrag');
    const x = ext(w, all);
    expect(type(x, 'karte')!.target).toBe('Krankenkassenbeitrag');
    expect(type(x, 'tippen')!.answer).toBe('Krankenkassenbeitrag');
    expect(type(x, 'reihenfolge')!.tokens).toContain('Krankenkassenbeitrag');
  });
  it('ambiguity guard: a chunk whose blank is a whole utterance gets no choice cloze, but can still be typed', () => {
    const a = rec({ de: 'Habe ich das richtig verstanden?', en: 'Did I get that right?', pos: 'phrase', tier: 'chunk', example_de: 'Also morgen um neun? Habe ich das richtig verstanden?', example_en: 'So tomorrow at nine? Did I get that right?' });
    const b = rec({ de: 'Vielleicht, mal sehen.', en: "Maybe, we'll see.", pos: 'phrase', tier: 'chunk', example_de: 'Kommst du? Vielleicht, mal sehen.', example_en: "Are you coming? Maybe, we'll see." });
    const c = rec({ de: 'Wie bitte?', en: 'Pardon?', pos: 'phrase', tier: 'chunk', example_de: 'Wie bitte? Das habe ich nicht gehört.', example_en: "Pardon? I didn't hear that." });
    const t = ext(a, [a, b, c]).map((x) => x.type);
    expect(t).not.toContain('luecke');
    expect(t).toContain('tippen');
    expect(ext(c, [a, b, c]).map((x) => x.type)).toContain('tippen');
  });
  it('Reihenfolge: a permutation of the sentence that is never the sentence', () => {
    for (const w of all) {
      const r = type(ext(w, all), 'reihenfolge');
      if (!r) continue;
      expect([...r.tokens].sort()).toEqual(r.answer.split(' ').sort());
      expect(r.tokens.join(' ')).not.toBe(r.answer);
    }
  });
  it('deterministic: input order and repeated calls give the same exercises', () => {
    const a = all.map((w) => ext(w, all, { seed: 's1' }));
    expect(all.map((w) => ext(w, [...all].reverse(), { seed: 's1' }))).toEqual(a);
    expect(all.map((w) => ext(w, all, { seed: 's1' }))).toEqual(a);
  });
});

describe('ladder: exercise choice follows the word state', () => {
  const all = sheet();
  const w = by(all, 'Termin');
  const exs = ext(w, all);
  const st = (stage: number, over: Partial<WordState> = {}): WordState => ({ ...initialState(w), stage, introduced: stage > 0, ...over });
  const pick = (stage: number, o: Partial<WordState> = {}, prev: ExerciseType | null = null, recall = 0.95) =>
    chooseForRun(w, st(stage, o), exs, prev, recall, true)!.type;

  it('new → Karte', () => expect(pick(0)).toBe('karte'));
  it('building (stage 1) → the gate, a cloze', () => expect(pick(1)).toBe('luecke'));
  it('building → every third review is variety below the production exercises', () => {
    const t = pick(1, { reps: 2 });
    expect(t).not.toBe('luecke');
    expect(EFFORT[t]).toBeLessThanOrEqual(2);
  });
  it('secure (stage 3) → typed recall; stage 4 → second context', () => {
    expect(pick(3)).toBe('tippen');
    expect(pick(4)).toBe('kontext2');
  });
  it('secure (stage 5) rotates through production-like and listening exercises', () => {
    const seen = new Set([0, 1, 2, 3, 4, 5].map((reps) => pick(5, { reps })));
    expect(seen.size).toBeGreaterThanOrEqual(4);
    expect(seen.has('tippen') && seen.has('hoeren')).toBe(true);
    expect(seen.has('karte')).toBe(false);
  });
  it('low recall keeps variety easy', () => {
    expect(effortCeiling(0.4)).toBe(1);
    expect(effortCeiling(0.7)).toBe(2);
    expect(effortCeiling(0.95)).toBe(3);
    for (let reps = 2; reps < 30; reps += 3) expect(EFFORT[pick(3, { reps }, null, 0.4)] <= 1 || pick(3, { reps }, null, 0.4) === 'tippen').toBe(true);
  });
  it('avoids the type just shown and the word’s own last type', () => {
    expect(pick(1, {}, 'luecke')).not.toBe('luecke');
    expect(pick(3, { lastType: 'tippen' })).not.toBe('tippen');
  });
  it('with no listening voice, Hören is never chosen', () => {
    for (let reps = 0; reps < 12; reps++) expect(chooseForRun(w, st(5, { reps }), exs, null, 0.95, false)!.type).not.toBe('hoeren');
  });
  it('a word with only a bare record still gets something at every stage (the Karte as last resort)', () => {
    const bare = by(all, 'gemütlich');
    const bx = ext(bare, all, { fewerOptions: true });
    for (let s = 1; s <= 5; s++) expect(chooseForRun(bare, { ...initialState(bare), stage: s, introduced: true }, bx, null, 0.9, true)).not.toBeNull();
  });
});

describe('grading: Karte self-rating and automatic grades', () => {
  const w = by(sheet(), 'Termin');
  it('the four Karte steps map to Again, Hard, Good, Easy', () => {
    for (const r of [1, 2, 3, 4] as const) expect(ratingFor(ev(w, { exercise: 'karte', rating: r, correct: r > 1 }))).toBe(r);
  });
  it('automatic: wrong → Again, right → Good; slow or helped → Hard; Easy is never inferred', () => {
    expect(ratingFor(ev(w, { correct: false }))).toBe(1);
    expect(ratingFor(ev(w, { exercise: 'plural' }))).toBe(3);
    expect(ratingFor(ev(w, { exercise: 'plural', ms: 60_000 }))).toBe(2);
    expect(ratingFor(ev(w, { exercise: 'plural', ms: 100 }))).toBe(3);
  });
  it('a new word rated Nicht gewusst stays new; any other step introduces it', () => {
    const s0 = initialState(w);
    expect(step(s0, ev(w, { exercise: 'karte', rating: 1, correct: false }), new Set(['karte']), 0.9).stage).toBe(0);
    for (const r of [2, 3, 4] as const) expect(step(s0, ev(w, { exercise: 'karte', rating: r, correct: true }), new Set(['karte']), 0.9).stage).toBe(1);
  });
  it('easier ratings give longer memory (FSRS state differs by rating)', () => {
    const s = (r: 1 | 2 | 3 | 4) => step(initialState(w), ev(w, { exercise: 'karte', rating: r, correct: r > 1 }), new Set(['karte']), 0.9).memory!.stability;
    expect(s(1)).toBeLessThan(s(2));
    expect(s(2)).toBeLessThan(s(3));
    expect(s(3)).toBeLessThan(s(4));
  });
  it('a rated Karte and the run id survive the Sheet row round trip', () => {
    const e = ev(w, { exercise: 'karte', rating: 4, correct: true, run: 'r_ab12', chosen: undefined });
    expect(eventFromRow(eventToRow(e))).toMatchObject({ exercise: 'karte', kind: 'review', rating: 4, run: 'r_ab12', correct: true });
    // legacy rows keep working
    expect(eventFromRow({ event_id: 'e_x', ts: new Date(T0).toISOString(), type: 'seen', word_id: w.id, card_type: 'karte' })).toMatchObject({ kind: 'seen' });
  });
  it('replay stays deterministic with ratings and new exercise types', () => {
    const all = sheet();
    const events = [
      ev(all[0]!, { exercise: 'karte', rating: 3, correct: true }), ev(all[0]!, { exercise: 'plural', correct: false, chosen: 'x' }),
      ev(all[1]!, { exercise: 'reihenfolge' }), ev(all[1]!, { exercise: 'kollokation', correct: false }),
    ];
    const a = replay(all, events), b = replay(all, [...events].reverse());
    expect([...a]).toEqual([...b]);
  });
});

describe('run composition', () => {
  const all = sheet();
  const base = { words: all, events: [] as LearnEvent[], now: T0, seed: 'seed-1', canListen: true };

  it('a fresh sheet: a run of new words, capped by the setting, starting with a Karte', () => {
    const run = composeRun(base);
    expect(run.length).toBeGreaterThan(0);
    expect(run.length).toBeLessThanOrEqual(DEFAULT_SETTINGS.newPerRun + 1);
    expect(run.every((c) => c.reason === 'new' && c.exercise.type === 'karte')).toBe(true);
  });
  it('same sheet + state + seed = same run', () => {
    expect(composeRun(base).map((c) => c.exercise)).toEqual(composeRun(base).map((c) => c.exercise));
    const events = all.slice(0, 8).flatMap((w, i) => [ev(w, { exercise: 'karte', rating: 3, correct: true, ts: T0 - (5 + i) * DAY })]);
    const a = composeRun({ ...base, events, now: T0 + 2 * DAY });
    const b = composeRun({ ...base, events: [...events].reverse(), now: T0 + 2 * DAY });
    expect(b.map((c) => [c.word.id, c.exercise.type, c.exercise.options])).toEqual(a.map((c) => [c.word.id, c.exercise.type, c.exercise.options]));
  });
  const learned = (count: number) => all.slice(0, count).flatMap((w, i) => [
    ev(w, { exercise: 'karte', rating: 3, correct: true, ts: T0 - (20 + i) * DAY }),
    ev(w, { exercise: 'luecke', ts: T0 - (19 + i) * DAY }),
  ]);
  it('a mixed sheet: six cards, no word twice, new ones capped, no same type back to back', () => {
    const run = composeRun({ ...base, events: learned(10), now: T0 + 30 * DAY });
    expect(run).toHaveLength(6);
    expect(new Set(run.map((c) => c.word.id)).size).toBe(6);
    expect(run.filter((c) => c.reason === 'new').length).toBeLessThanOrEqual(DEFAULT_SETTINGS.newPerRun);
    for (let i = 1; i < run.length; i++) expect(run[i]!.exercise.type).not.toBe(run[i - 1]!.exercise.type);
    expect(run.filter((c) => c.reason === 'new').length).toBe(0); // ten due words fill the run: reviews first
    const light = composeRun({ ...base, events: learned(3), now: T0 + 30 * DAY });
    expect(light.filter((c) => c.reason === 'new').length).toBe(DEFAULT_SETTINGS.newPerRun);
  });
  it('a burst of new rows trickles in: never more than the cap per run, none while due words fill the run', () => {
    const big = [...all, ...Array.from({ length: 40 }, (_, i) => rec({ de: `Neuwort${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`, article: 'das', en: `newword ${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`, pos: 'noun' }))];
    const run = composeRun({ ...base, words: big, events: learned(3), now: T0 + 30 * DAY });
    expect(run.filter((c) => c.reason === 'new').length).toBeLessThanOrEqual(DEFAULT_SETTINGS.newPerRun);
    const full = composeRun({ ...base, words: big, events: learned(12), now: T0 + 30 * DAY });
    expect(full.filter((c) => c.reason === 'new')).toHaveLength(0);
  });
  it('does not open with a new word when a review can open the run', () => {
    const run = composeRun({ ...base, events: learned(10), now: T0 + 30 * DAY });
    expect(run[0]!.reason).not.toBe('new');
  });
  it('due words come before practice, lowest predicted recall first', () => {
    const events = learned(10);
    const run = composeRun({ ...base, events, now: T0 + 30 * DAY, settings: { ...DEFAULT_SETTINGS, newPerRun: 0 } });
    expect(run.every((c) => c.reason === 'due')).toBe(true);
  });
  it('newPerRun 0 → no new words even on a fresh sheet is impossible only when nothing else exists', () => {
    const run = composeRun({ ...base, settings: { ...DEFAULT_SETTINGS, newPerRun: 0 } });
    expect(run.filter((c) => c.reason === 'new').length).toBeLessThanOrEqual(1);
  });
  it('run length follows the setting', () => {
    const run = composeRun({ ...base, events: learned(12), now: T0 + 30 * DAY, settings: { ...DEFAULT_SETTINGS, runLength: 4 } });
    expect(run).toHaveLength(4);
  });
  it('switched-off exercise types never appear', () => {
    const settings = { ...DEFAULT_SETTINGS, disabled: ['luecke', 'tippen', 'plural'] as ExerciseType[] };
    for (const seed of ['a', 'b', 'c', 'd']) {
      const run = composeRun({ ...base, seed, events: learned(12), now: T0 + 30 * DAY, settings });
      for (const c of run) expect(settings.disabled).not.toContain(c.exercise.type);
    }
  });
  it('no German voice → no Hören', () => {
    const events = all.flatMap((w, i) => [ev(w, { exercise: 'karte', rating: 3, ts: T0 - (60 + i) * DAY }), ...[1, 2, 3, 4, 5].map((k) => ev(w, { exercise: 'luecke', ts: T0 - (50 - k * 3 + i) * DAY }))]);
    for (const seed of ['a', 'b', 'c']) {
      const run = composeRun({ ...base, seed, events, canListen: false, now: T0 + 5 * DAY });
      expect(run.some((c) => c.exercise.type === 'hoeren')).toBe(false);
    }
  });
  it('focus: chosen words first, no new words', () => {
    const events = learned(10);
    const focus = [all[3]!.id, all[5]!.id];
    const run = composeRun({ ...base, events, now: T0 + 30 * DAY, focus });
    expect(run.slice(0, 2).map((c) => c.word.id).sort()).toEqual([...focus].sort());
    expect(run.some((c) => c.reason === 'new')).toBe(false);
  });
  it('one-row sheet: a run of exactly one card', () => {
    const only = rec('termin');
    const run = composeRun({ ...base, words: [only] });
    expect(run).toHaveLength(1);
    expect(run[0]!.exercise.type).toBe('karte');
    const later = composeRun({ ...base, words: [only], events: [ev(only, { exercise: 'karte', rating: 3, ts: T0 - 40 * DAY })], now: T0 });
    expect(later).toHaveLength(1);
    expect(later[0]!.exercise.type).not.toBe('karte');
  });
  it('an empty or all-suspended sheet gives an empty run', () => {
    expect(composeRun({ ...base, words: [] })).toEqual([]);
    expect(composeRun({ ...base, words: all.map((w) => ({ ...w, status: 'suspended' })) })).toEqual([]);
  });
  it('pending suggestions are not part of a run', () => {
    const run = composeRun({ ...base, words: all.map((w) => ({ ...w, status: 'pending' })) });
    expect(run).toEqual([]);
  });
  it('a large backlog silently pauses new words', () => {
    const run = composeRun({ ...base, events: learned(12), now: T0 + 30 * DAY, config: { ...DEFAULT_CONFIG, backlogPause: 3 } });
    expect(run.some((c) => c.reason === 'new')).toBe(false);
  });
  it('different seeds may vary distractor ties and exercise variety, never the rules', () => {
    for (const seed of ['p', 'q', 'r', 's', 't']) {
      const run = composeRun({ ...base, seed, events: learned(12), now: T0 + 30 * DAY });
      expect(new Set(run.map((c) => c.word.id)).size).toBe(run.length);
    }
  });
});

describe('every sheet row yields exercises, whatever it holds', () => {
  const all = sheet();
  it('every row has at least a Karte, and the catalogue covers all types somewhere', () => {
    const seen = new Set<ExerciseType>();
    for (const w of all) {
      const x = ext(w, all, { fewerOptions: true });
      expect(x.length, w.de).toBeGreaterThan(0);
      x.forEach((e) => seen.add(e.type));
    }
    expect([...seen].sort()).toEqual([...EXERCISE_TYPES].sort());
  });
});

describe('runs in the log', () => {
  const w = rec('termin');
  const e = (min: number, run?: string) => ({ ...ev(w), ts: T0 + min * MIN, ...(run ? { run } : {}) });
  it('events with run ids form runs, even without a gap', () => {
    const runs = splitRuns([e(0, 'a'), e(1, 'a'), e(2, 'b'), e(3, 'b'), e(4, 'b')], 20);
    expect(runs.map((r) => [r.id, r.cards])).toEqual([['a', 2], ['b', 3]]);
  });
  it('without run ids, an inactivity gap larger than N minutes starts a new run', () => {
    const runs = splitRuns([e(0), e(5), e(24), e(80), e(85)], 20);
    expect(runs.map((r) => r.cards)).toEqual([3, 2]);
    expect(splitRuns([e(0), e(25)], 30)).toHaveLength(1);
  });
  it('a long pause inside one run id still ends that run', () => {
    expect(splitRuns([e(0, 'a'), e(60, 'a')], 20)).toHaveLength(2);
  });
  it('duplicate event ids count once; empty log gives no runs', () => {
    const one = e(0, 'a');
    expect(splitRuns([one, one], 20)[0]!.cards).toBe(1);
    expect(splitRuns([], 20)).toEqual([]);
  });
  it('gapExceeded', () => {
    expect(gapExceeded(null, T0, 20)).toBe(false);
    expect(gapExceeded(T0, T0 + 19 * MIN, 20)).toBe(false);
    expect(gapExceeded(T0, T0 + 21 * MIN, 20)).toBe(true);
  });
});

describe('plain data in the record (no card carries content the sheet does not)', () => {
  it('toWordRecord keeps plural and collocation as typed', () => {
    const w = toWordRecord({ word_id: 'w_x0000001', de: 'Termin', article: 'der', plural: 'Termine', en: 'appointment', pos: 'noun', collocation: 'einen Termin machen' });
    expect([w.plural, w.collocation]).toEqual(['Termine', 'einen Termin machen']);
  });
});
