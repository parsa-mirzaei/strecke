import { describe, expect, it } from 'vitest';
import { editDistance, isCorrect, matchTyped } from '../src/typing.ts';
import { initMemory, interval, MAX_INTERVAL_DAYS, retrievability, review, W } from '../src/fsrs.ts';

describe('typed answers: forgiving matching (D40)', () => {
  const cases: Array<[string, string, string, string]> = [
    ['Haltestelle', 'Haltestelle', '', 'exact'],
    ['  Haltestelle. ', 'Haltestelle', '', 'exact'],
    ['haltestelle', 'Haltestelle', '', 'loose'],
    ['Strasse', 'Straße', '', 'loose'],
    ['Pruefung', 'Prüfung', '', 'loose'],
    ['die Haltestelle', 'Haltestelle', 'die', 'exact'],
    ['der Haltestelle', 'Haltestelle', 'die', 'wrong'],
    ['Haltestele', 'Haltestelle', '', 'near'],
    ['Verspatung', 'Verspätung', '', 'near'],
    ['Halltestele', 'Haltestelle', '', 'near'], // two edits allowed at 10+ characters
    ['Termn', 'Termin', '', 'near'],
    ['Trmn', 'Termin', '', 'wrong'],
    ['Rechnung', 'Termin', '', 'wrong'],
    ['', 'Termin', '', 'wrong'],
    ['kannst du das bitte wiederholen', 'kannst du das bitte wiederholen?', '', 'exact'],
  ];
  for (const [input, answer, article, verdict] of cases) {
    it(`${JSON.stringify(input)} vs ${answer} → ${verdict}`, () => expect(matchTyped(input, answer, article)).toBe(verdict));
  }
  it('near misses count as correct; wrong does not', () => {
    expect([isCorrect('near'), isCorrect('loose'), isCorrect('wrong')]).toEqual([true, true, false]);
  });
  it('edit distance with early exit', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('kitten', 'sitting', 1)).toBe(2);
  });
});

describe('FSRS-5 memory model', () => {
  it('retrievability is 0.9 after exactly S days and falls over time', () => {
    expect(retrievability(10, 10)).toBeCloseTo(0.9, 10);
    expect(retrievability(0, 10)).toBe(1);
    expect(retrievability(20, 10)).toBeLessThan(0.9);
  });
  it('at 90 % retention the interval equals the stability; higher retention means shorter; capped at 120 days', () => {
    expect(interval(10, 0.9)).toBeCloseTo(10, 10);
    expect(interval(10, 0.95)).toBeLessThan(10);
    expect(interval(10_000, 0.9)).toBe(MAX_INTERVAL_DAYS);
  });
  it('first review: stability w0..w3 by rating; difficulty highest after Again', () => {
    expect([1, 2, 3, 4].map((g) => initMemory(g as 1).stability)).toEqual([W[0], W[1], W[2], W[3]]);
    expect(initMemory(1).difficulty).toBeGreaterThan(initMemory(3).difficulty);
    for (const g of [1, 2, 3, 4] as const) expect(initMemory(g).difficulty).toBeGreaterThanOrEqual(1);
  });
  it('a later Good grows stability; Again shrinks it; Hard grows less than Good', () => {
    const m = initMemory(3);
    const good = review(m, 3, 3), hard = review(m, 3, 2), again = review(m, 3, 1);
    expect(good.stability).toBeGreaterThan(m.stability);
    expect(hard.stability).toBeLessThan(good.stability);
    expect(again.stability).toBeLessThan(m.stability);
    expect(again.difficulty).toBeGreaterThan(good.difficulty);
  });
  it('same-day reviews use the short-term formula (Good up, Again down)', () => {
    const m = initMemory(3);
    expect(review(m, 0.01, 3).stability).toBeGreaterThan(m.stability);
    expect(review(m, 0.01, 1).stability).toBeLessThan(m.stability);
  });
  it('difficulty stays within 1–10 under long runs', () => {
    let m = initMemory(1);
    for (let i = 0; i < 50; i++) m = review(m, 2, 1);
    expect(m.difficulty).toBeLessThanOrEqual(10);
    let n = initMemory(4);
    for (let i = 0; i < 50; i++) n = review(n, 30, 4);
    expect(n.difficulty).toBeGreaterThanOrEqual(1);
  });
});
