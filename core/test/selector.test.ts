import { describe, expect, it } from 'vitest';
import { exercisesFor, type ExerciseType } from '../src/exercises.ts';
import { chooseByStats, LEVEL, typeStats } from '../src/engine/run.ts';
import { initialState, type LearnEvent, type WordState } from '../src/scheduler.ts';
import { ALL_DESIGNS, simulate } from '../src/sim/sim.ts';
import { by, sheet } from './fixtures/engine-sheet.ts';

const all = sheet();
const w = by(all, 'Termin');
const exs = exercisesFor(w, all, { extended: true });
const st = (over: Partial<WordState> = {}): WordState => ({ ...initialState(w), introduced: true, stage: 1, memory: { stability: 5, difficulty: 5 }, lastReview: 0, ...over });
const stats = (m: Partial<Record<ExerciseType, number[]>>) => new Map(Object.entries(m) as [ExerciseType, number[]][]);
const pick = (s: WordState, m: Partial<Record<ExerciseType, number[]>> = {}, recall = 0.9, prev: ExerciseType | null = null) =>
  chooseByStats(s, exs, stats(m), prev, recall, true, (t) => t.length)!.type;

describe('exercise choice from per word × type evidence (round 3 default)', () => {
  it('a word not yet met gets its Karte', () => expect(pick({ ...st(), introduced: false })).toBe('karte'));
  it('a new word rated Nicht gewusst gets its Karte again', () => expect(pick(st({ memory: null, lastType: 'karte' }), { karte: [0] })).toBe('karte'));
  it('no evidence yet: recognition', () => expect(LEVEL[pick(st())]).toBe(1));
  it('recognition mostly right: in context', () => expect(LEVEL[pick(st(), { bedeutung: [1, 1] })]).toBe(2));
  it('context mostly right too: production', () => expect(LEVEL[pick(st(), { bedeutung: [1], luecke: [1, 1, 0, 1] })]).toBe(3));
  it('below 60 % one level down: stays there', () => expect(LEVEL[pick(st(), { bedeutung: [1], luecke: [0, 1, 0] })]).toBe(2));
  it('a miss steps one level below the missed exercise', () => {
    expect(LEVEL[pick(st({ lastType: 'tippen' }), { bedeutung: [1], luecke: [1, 1], tippen: [0] })]).toBe(2);
  });
  it('low predicted recall holds the word at recognition', () => expect(LEVEL[pick(st(), { bedeutung: [1], luecke: [1, 1] }, 0.3)]).toBe(1));
  it('within a level, the least-practised type first, so every format the row supports is met', () => {
    expect(pick(st(), { bedeutung: [1, 0, 0], artikel: [0] })).toBe('plural');
  });
  it('never the type just shown when another fits', () => {
    const first = pick(st());
    expect(pick(st(), {}, 0.9, first)).not.toBe(first);
  });
  it('a row without production data never gets production', () => {
    const bare = by(all, 'gemütlich');
    const bx = exercisesFor(bare, all, { extended: true, fewerOptions: true });
    const t = chooseByStats({ ...initialState(bare), introduced: true, memory: { stability: 9, difficulty: 5 } }, bx, stats({ bedeutung: [1, 1, 1] }), null, 0.95, true, () => 0)!.type;
    expect(bx.map((x) => x.type)).toContain(t);
    expect(LEVEL[t]).toBeLessThan(3);
  });
  it('typeStats keeps the last four answers per word and type; Weiß ich nicht counts as wrong', () => {
    const ev = (n: number, ok: boolean, dk = false): LearnEvent => ({ id: `e_${n}`, ts: n, wordId: w.id, kind: 'review', exercise: 'luecke', correct: ok, ms: 1, help: false, dontKnow: dk });
    const s = typeStats([1, 2, 3, 4, 5].map((n) => ev(n, true)).concat([ev(6, true, true)]));
    expect(s.get(w.id)!.get('luecke')).toEqual([1, 1, 1, 0]);
  });
});

describe('simulator', () => {
  it('is deterministic and runs every design', () => {
    for (const design of ALL_DESIGNS) {
      const a = simulate({ design, seed: 's', words: 12, days: 4 });
      const b = simulate({ design, seed: 's', words: 12, days: 4 });
      expect(a.retention).toBe(b.retention);
      expect(a.events.length).toBeGreaterThan(0);
      expect(a.events.length).toBe(b.events.length);
    }
  });
});
