import { describe, expect, it } from 'vitest';
import { blank, capabilities, exercisesFor, type Exercise, type ExerciseType } from '../src/exercises.ts';
import { recordProblems, toWordRecord, type WordRecord } from '../src/record.ts';
import { DEMO_WORDS } from '../src/data/demo-deck.ts';
import type { Row } from '../src/schema.ts';

const deck: WordRecord[] = DEMO_WORDS.map((w) => toWordRecord(w));
const byDe = (de: string) => deck.find((w) => w.de === de)!;
const rec = (row: Row) => toWordRecord({ word_id: 'w_test0001', status: 'active', ...row });
const types = (xs: Exercise[]) => xs.map((x) => x.type);
const one = (w: WordRecord, t: ExerciseType, all = deck) => exercisesFor(w, all).find((x) => x.type === t);

const full: Row = {
  de: 'Wohnung', article: 'die', plural: 'Wohnungen', en: 'flat, apartment', pos: 'noun', domain: 'alltag',
  example_de: 'Wir suchen eine Wohnung in der Nähe vom Bahnhof.', example_en: "We're looking for a flat near the station.",
  example_2_de: 'Die Wohnung hat zwei Zimmer und einen Balkon.', example_2_en: 'The flat has two rooms and a balcony.',
  collocation: 'eine Wohnung suchen', prep: 'in', note: 'in der Wohnung (Dativ)',
};

describe('demo deck', () => {
  it('every row passes the record rules', () => {
    for (const w of DEMO_WORDS) expect([w.de, recordProblems(w)]).toEqual([w.de, []]);
  });
  it('has about 20 items, about 2/3 core, all five domains and one thin row', () => {
    expect(deck.length).toBeGreaterThanOrEqual(20);
    const chunks = deck.filter((w) => w.tier === 'chunk').length;
    expect(chunks / deck.length).toBeGreaterThan(0.2);
    expect(chunks / deck.length).toBeLessThan(0.4);
    expect(new Set(deck.map((w) => w.domain).filter(Boolean))).toEqual(new Set(['alltag', 'amt', 'arbeit', 'uni', 'smalltalk']));
    expect(deck.filter((w) => !w.examples.length)).toHaveLength(1);
  });
  it('every word gets a Karte and at least one graded exercise', () => {
    for (const w of deck) {
      const t = types(exercisesFor(w, deck));
      expect(t[0]).toBe('karte');
      expect(t.length).toBeGreaterThan(1);
    }
  });
});

describe('catalogue: which columns give which exercises', () => {
  it('a full row gets all eight', () => {
    expect(types(exercisesFor(rec(full), deck))).toEqual(['karte', 'artikel', 'bedeutung', 'luecke', 'praeposition', 'hoeren', 'tippen', 'kontext2']);
  });
  it('a thin row (de, article, en) gets Karte, Artikel, Bedeutung (+ Hören of the bare word)', () => {
    const t = types(exercisesFor(rec({ de: 'Fenster', article: 'das', en: 'window' }), deck));
    expect(t).toEqual(['karte', 'artikel', 'bedeutung', 'hoeren']);
  });
  it('missing de or en: nothing at all', () => {
    expect(exercisesFor(rec({ ...full, en: '' }), deck)).toEqual([]);
    expect(exercisesFor(rec({ ...full, de: '' }), deck)).toEqual([]);
  });

  it('Karte: the meaning under the cover, the example with the word highlighted', () => {
    const k = one(rec(full), 'karte')!;
    expect([k.answer, k.sentence, k.sentenceEn, k.target]).toEqual(['flat, apartment', full.example_de, full.example_en, 'Wohnung']);
    expect(one(rec({ de: 'Fenster', article: 'das', en: 'window' }), 'karte')!.sentence).toBe('');
  });
  it('Artikel: nouns with an article only; options always der, die, das', () => {
    expect(one(rec(full), 'artikel')).toMatchObject({ answer: 'die', options: ['der', 'die', 'das'] });
    expect(one(byDe('abholen'), 'artikel')).toBeUndefined();
    expect(one(rec({ ...full, article: '' }), 'artikel')).toBeUndefined(); // hand-written noun without article
  });
  it('Bedeutung: three meanings; skipped without two distractors', () => {
    const b = one(rec(full), 'bedeutung')!;
    expect(b.options).toHaveLength(3);
    expect(b.options).toContain('flat, apartment');
    const lonely = rec({ de: 'schnell', en: 'fast', pos: 'adj' });
    expect(one(lonely, 'bedeutung', [lonely])).toBeUndefined();
  });
  it('Bedeutung: hand-picked wrong_1/wrong_2 come first, even with no other records', () => {
    const w = rec({ de: 'schnell', en: 'fast', pos: 'adj', wrong_1: 'slow', wrong_2: 'loud' });
    expect(new Set(one(w, 'bedeutung', [w])!.options)).toEqual(new Set(['fast', 'slow', 'loud']));
  });
  it('Lücke: the example with an amber gap and three forms; skipped without an example', () => {
    const l = one(rec(full), 'luecke')!;
    expect([l.gapped, l.answer]).toEqual(['Wir suchen eine ___ in der Nähe vom Bahnhof.', 'Wohnung']);
    expect(l.options).toHaveLength(3);
    expect(one(rec({ ...full, example_de: '', example_en: '', example_2_de: '', example_2_en: '' }), 'luecke')).toBeUndefined();
  });
  it('Lücke: uses example_form for inflected words', () => {
    expect(one(byDe('sich kümmern'), 'luecke')!.gapped).toBe('Ich ___ mich morgen um die Wohnung.');
  });
  it('Lücke: skipped when the form is not exactly once in a hand-written example', () => {
    expect(one(rec({ ...full, example_de: 'Wohnung um Wohnung.', example_2_de: '' }), 'luecke')).toBeUndefined();
  });
  it('Präposition: blanks the preposition in the example when it occurs once', () => {
    const p = one(byDe('zuständig'), 'praeposition')!;
    expect([p.gapped, p.answer]).toEqual(['Wer ist hier ___ die Anmeldung zuständig?', 'für']);
    expect(p.options).toHaveLength(3);
    expect(new Set(p.options).size).toBe(3);
  });
  it('Präposition: falls back to "word ___"; absent without prep', () => {
    expect(one(rec({ de: 'Angst', article: 'die', en: 'fear', prep: 'vor' }), 'praeposition')!.gapped).toBe('Angst ___');
    expect(one(byDe('müde'), 'praeposition')).toBeUndefined();
  });
  it('Hören: speaks the example (or the legacy listen sentence, or the bare word) and asks for the meaning', () => {
    expect(one(rec(full), 'hoeren')).toMatchObject({ sentence: full.example_de, answer: 'flat, apartment', target: 'Wohnung' });
    const legacy = { ...rec(full), listen: { de: 'Die Wohnung ist zu teuer.', en: 'The flat is too expensive.' } };
    expect(one(legacy, 'hoeren')!.sentence).toBe('Die Wohnung ist zu teuer.');
    expect(one(rec({ de: 'Fenster', article: 'das', en: 'window' }), 'hoeren')!.sentence).toBe('Fenster');
  });
  it('Tippen: the same gap, no options; absent without an example', () => {
    expect(one(rec(full), 'tippen')).toMatchObject({ gapped: 'Wir suchen eine ___ in der Nähe vom Bahnhof.', answer: 'Wohnung', options: [] });
    expect(one(rec({ de: 'Fenster', article: 'das', en: 'window' }), 'tippen')).toBeUndefined();
  });
  it('Zweiter Kontext: a gap in the second example; absent without it', () => {
    const k = one(byDe('abholen'), 'kontext2')!;
    expect([k.gapped, k.answer]).toEqual(['Ich habe das Paket gestern bei der Post ___.', 'abgeholt']);
    expect(one(rec({ ...full, example_2_de: '', example_2_en: '' }), 'kontext2')).toBeUndefined();
  });
  it('capabilities ignore distractors (used by the ladder)', () => {
    const lonely = rec(full);
    expect([...capabilities(lonely)].sort()).toEqual(['artikel', 'bedeutung', 'hoeren', 'karte', 'kontext2', 'luecke', 'praeposition', 'tippen']);
    expect(types(exercisesFor(lonely, [lonely]))).toEqual(['karte', 'artikel', 'praeposition', 'tippen']);
  });
});

describe('distractor rules', () => {
  const all = [...deck, rec(full)];
  it('options contain the answer exactly once and never repeat', () => {
    for (const w of all) for (const x of exercisesFor(w, all)) {
      if (!x.options.length) continue;
      expect(x.options.filter((o) => o === x.answer)).toHaveLength(1);
      expect(new Set(x.options.map((o) => o.toLowerCase())).size).toBe(x.options.length);
    }
  });
  it('distractors come from the same pos only', () => {
    const nounsEn = new Set(all.filter((w) => w.pos === 'noun').map((w) => w.en));
    const b = one(byDe('Termin'), 'bedeutung', all)!;
    for (const o of b.options) expect(nounsEn.has(o)).toBe(true);
  });
  it('same tier first: a chunk gets chunk meanings when enough exist', () => {
    const chunksEn = new Set(all.filter((w) => w.tier === 'chunk').map((w) => w.en));
    const b = one(byDe('Das klingt gut.'), 'bedeutung', all)!;
    for (const o of b.options) expect(chunksEn.has(o)).toBe(true);
  });
  it('a candidate whose meaning equals the answer is never used; duplicates collapse', () => {
    const twin = rec({ de: 'Appartement', article: 'das', en: 'Flat, apartment', pos: 'noun' });
    const dupA = { ...rec({ de: 'Dach', article: 'das', en: 'roof', pos: 'noun' }), id: 'w_dup00001' };
    const dupB = { ...rec({ de: 'Decke', article: 'die', en: 'roof', pos: 'noun' }), id: 'w_dup00002' };
    const w = { ...rec(full), id: 'w_main0001' };
    const opts = one(w, 'bedeutung', [w, { ...twin, id: 'w_twin0001' }, dupA, dupB, byDe('Ausweis')])!.options;
    expect(opts.map((o) => o.toLowerCase()).filter((o) => o === 'flat, apartment')).toHaveLength(1);
    expect(opts.filter((o) => o === 'roof').length).toBeLessThanOrEqual(1);
  });
  it('Lücke prefers forms with the same ending, so grammar does not give the answer away', () => {
    const l = one(byDe('sich kümmern'), 'luecke')!;
    expect(l.options.filter((o) => o.endsWith('re')).length).toBeGreaterThanOrEqual(1);
  });
  it('deterministic: same records, any input order, same exercises and option order', () => {
    const a = all.map((w) => exercisesFor(w, all));
    const b = all.map((w) => exercisesFor(w, [...all].reverse()));
    expect(b).toEqual(a);
  });
  it('blank() only blanks a whole-word single occurrence', () => {
    expect(blank('Der Termin ist morgen.', 'Termin')).toBe('Der ___ ist morgen.');
    expect(blank('Terminkalender', 'Termin')).toBe('');
  });
});
