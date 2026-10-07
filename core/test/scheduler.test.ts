import { describe, expect, it } from 'vitest';
import { capabilities, exercisesFor, type ExerciseType } from '../src/exercises.ts';
import { toWordRecord, type WordRecord } from '../src/record.ts';
import { DEMO_WORDS } from '../src/data/demo-deck.ts';
import { seededBytes } from '../src/ids.ts';
import {
  DEFAULT_CONFIG, afterCard, chooseExercise, eventFromRow, eventToRow, gateTypes, initialState, newSession, pickNext,
  ratingFor, replay, stateToRow, step, type LearnEvent, type PickInput, type Session, type WordState,
} from '../src/scheduler.ts';
import type { Row } from '../src/schema.ts';

const T0 = Date.parse('2026-10-07T08:00:00Z');
const MIN = 60_000, DAY = 86_400_000;

const fullRow: Row = {
  word_id: 'w_full0001', de: 'Wohnung', article: 'die', en: 'flat', pos: 'noun', domain: 'alltag', status: 'active',
  example_de: 'Wir suchen eine Wohnung in der Nähe.', example_en: "We're looking for a flat nearby.",
  example_2_de: 'Die Wohnung hat zwei Zimmer.', example_2_en: 'The flat has two rooms.', prep: 'in',
};
const full = toWordRecord(fullRow);
const thin = toWordRecord({ word_id: 'w_thin0001', de: 'Fenster', article: 'das', en: 'window', status: 'active' });
const CAPS = capabilities(full);

let n = 0;
const ev = (over: Partial<LearnEvent> = {}): LearnEvent => ({
  id: `e_${String(++n).padStart(8, '0')}`, ts: T0 + n * MIN, wordId: full.id, kind: 'review', exercise: 'luecke',
  correct: true, ms: 2000, help: false, dontKnow: false, ...over,
});
const at = (stage: number, over: Partial<WordState> = {}): WordState => ({ ...initialState(full), stage, introduced: true, ...over });
const after = (stage: number, e: Partial<LearnEvent>, caps = CAPS) => step(at(stage), ev(e), caps, 0.9);

describe('rating from behaviour (no self-grading)', () => {
  it('wrong or "Weiß ich nicht" → Again; help or slow → Hard; else Good', () => {
    expect(ratingFor(ev({ correct: false }))).toBe(1);
    expect(ratingFor(ev({ correct: true, dontKnow: true }))).toBe(1);
    expect(ratingFor(ev({ help: true }))).toBe(2);
    expect(ratingFor(ev({ ms: 60_000 }))).toBe(2);
    expect(ratingFor(ev({ exercise: 'tippen', ms: 15_000 }))).toBe(3);
    expect(ratingFor(ev())).toBe(3);
  });
});

describe('ladder: every transition (SPEC "Learning engine")', () => {
  const rows: Array<[string, number, Partial<LearnEvent>, number, number]> = [
    // name, from stage, event, expected stage, expected lapses
    ['0 Karte seen → 1', 0, { kind: 'seen', exercise: 'karte' }, 1, 0],
    ['1 gate (Lücke) right → 2', 1, { exercise: 'luecke' }, 2, 0],
    ['1 gate wrong → stays 1, no lapse', 1, { exercise: 'luecke', correct: false }, 1, 0],
    ['1 non-gate (Artikel) right → stays 1', 1, { exercise: 'artikel' }, 1, 0],
    ['1 non-gate wrong → stays 1', 1, { exercise: 'bedeutung', correct: false }, 1, 0],
    ['2 gate (Lücke) right → 3', 2, { exercise: 'luecke' }, 3, 0],
    ['2 gate (Präposition) right → 3', 2, { exercise: 'praeposition' }, 3, 0],
    ['2 gate wrong → 1, lapse', 2, { exercise: 'luecke', correct: false }, 1, 1],
    ['2 non-gate (Hören) right → stays 2', 2, { exercise: 'hoeren' }, 2, 0],
    ['2 non-gate wrong → 1, lapse', 2, { exercise: 'hoeren', correct: false }, 1, 1],
    ['3 gate (Tippen) right → 4', 3, { exercise: 'tippen' }, 4, 0],
    ['3 gate wrong → 2, lapse', 3, { exercise: 'tippen', correct: false }, 2, 1],
    ['3 non-gate (Lücke) right → stays 3', 3, { exercise: 'luecke' }, 3, 0],
    ['3 non-gate wrong → 2, lapse', 3, { exercise: 'hoeren', correct: false }, 2, 1],
    ['4 gate (Zweiter Kontext) right → 5', 4, { exercise: 'kontext2' }, 5, 0],
    ['4 gate wrong → 3, lapse', 4, { exercise: 'kontext2', correct: false }, 3, 1],
    ['4 non-gate wrong → 3, lapse', 4, { exercise: 'artikel', correct: false }, 3, 1],
    ['5 right → stays 5', 5, { exercise: 'tippen' }, 5, 0],
    ['5 any miss → 3, lapse', 5, { exercise: 'bedeutung', correct: false }, 3, 1],
    ['"Weiß ich nicht" is a miss', 3, { exercise: 'tippen', dontKnow: true }, 2, 1],
    ['right but slow (Hard) still promotes', 1, { exercise: 'luecke', ms: 60_000 }, 2, 0],
    ['Tippen near miss (help) still promotes', 3, { exercise: 'tippen', help: true }, 4, 0],
  ];
  for (const [name, from, e, stage, lapses] of rows) {
    it(name, () => {
      const s = after(from, e);
      expect([s.stage, s.lapses]).toEqual([stage, lapses]);
    });
  }
  it('a review of a never-seen word counts at stage 1', () => {
    expect(step(initialState(full), ev({ exercise: 'luecke' }), CAPS, 0.9).stage).toBe(2);
  });
  it('Karte seen at a later stage changes nothing but marks the word introduced', () => {
    const s = after(3, { kind: 'seen', exercise: 'karte' });
    expect([s.stage, s.introduced]).toEqual([3, true]);
  });
  it('gates fall back to what the record supports; Hören is never a gate', () => {
    const thinCaps = capabilities(thin);
    expect(gateTypes(1, thinCaps)).toEqual(['artikel']);
    expect(gateTypes(2, thinCaps)).toEqual(['artikel']);
    expect(gateTypes(3, thinCaps)).toEqual(['artikel']);
    expect(gateTypes(4, CAPS)).toEqual(['kontext2']);
    expect(gateTypes(2, CAPS)).toEqual(['luecke', 'praeposition']);
    for (let s = 0; s <= 5; s++) expect(gateTypes(s, CAPS)).not.toContain('hoeren');
  });
  it('start_stage sets where a word enters; it is not yet introduced', () => {
    const w = toWordRecord({ ...fullRow, start_stage: '2' });
    expect([initialState(w).stage, initialState(w).introduced]).toEqual([2, false]);
  });
});

describe('memory model timing', () => {
  it('first Good is due after S0(Good) ≈ 3.2 days; first Again after ≈ 0.4 days', () => {
    const good = after(1, { exercise: 'luecke' });
    expect((good.due! - good.lastReview!) / DAY).toBeCloseTo(3.173, 2);
    const again = after(1, { exercise: 'luecke', correct: false });
    expect((again.due! - again.lastReview!) / DAY).toBeCloseTo(0.40255, 2);
  });
  it('Karte sets the word due immediately (it returns in this visit, else next open) without a memory', () => {
    const s = after(0, { kind: 'seen', exercise: 'karte' });
    expect([s.memory, s.due]).toEqual([null, s.lastSeen]);
  });
  it('higher retention gives shorter intervals', () => {
    const a = step(at(1), ev({ id: 'e_fixed001', ts: T0 }), CAPS, 0.9);
    const b = step(at(1), ev({ id: 'e_fixed001', ts: T0 }), CAPS, 0.95);
    expect(b.due!).toBeLessThan(a.due!);
  });
});

describe('replay determinism', () => {
  const words = DEMO_WORDS.map((w) => toWordRecord(w));
  const log: LearnEvent[] = [];
  const rand = seededBytes(42);
  for (let i = 0; i < 400; i++) {
    const w = words[rand(1)[0]! % words.length]!;
    const types: ExerciseType[] = ['karte', 'artikel', 'bedeutung', 'luecke', 'tippen', 'hoeren', 'kontext2', 'praeposition'];
    const t = types[rand(1)[0]! % types.length]!;
    log.push({
      id: `e_r${String(i).padStart(7, '0')}`, ts: T0 + Math.floor(i / 3) * 37 * MIN, wordId: w.id, kind: t === 'karte' ? 'seen' : 'review',
      exercise: t, correct: rand(1)[0]! % 4 !== 0, ms: 500 + (rand(1)[0]! * 40), help: rand(1)[0]! % 9 === 0, dontKnow: false,
    });
  }
  const base = replay(words, log);
  it('the same log gives the same state', () => expect(replay(words, log)).toEqual(base));
  it('any input order gives the same state (events sorted by ts, then id; ties included)', () => {
    const shuffled = [...log].sort((a, b) => (a.id.charCodeAt(5) * 7919 + a.ts) % 101 - (b.id.charCodeAt(5) * 7919 + b.ts) % 101);
    expect(replay(words, shuffled)).toEqual(base);
    expect(replay(words, [...log].reverse())).toEqual(base);
  });
  it('a duplicated event (sync retry) counts once', () => {
    expect(replay(words, [...log, ...log.slice(0, 50)])).toEqual(base);
  });
  it('round trip through Core event rows replays identically', () => {
    const rows = log.map((e) => eventToRow(e, 'phone'));
    const back = rows.map(eventFromRow).filter((e): e is LearnEvent => !!e);
    expect(replay(words, back)).toEqual(base);
  });
  it('events for unknown words are ignored', () => {
    expect(replay(words, [...log, ev({ wordId: 'w_gone0001' })])).toEqual(base);
  });
  it('legacy card types map onto exercises; non-learning events are skipped', () => {
    expect(eventFromRow({ event_id: 'e_1', ts: '2026-10-05T10:00:00Z', type: 'review', word_id: 'w_a', card_type: 'recall', result: '1', ms: '900' })!.exercise).toBe('luecke');
    expect(eventFromRow({ event_id: 'e_2', ts: '2026-10-05T10:00:00Z', type: 'open', word_id: '', card_type: '' })).toBeNull();
    expect(eventFromRow({ event_id: 'e_3', ts: 'not a date', type: 'review', word_id: 'w_a', card_type: 'tippen' })).toBeNull();
  });
  it('word_state cache rows are well-formed', () => {
    const r = stateToRow(words[0]!.id, base.get(words[0]!.id)!);
    expect(Object.keys(r)).toEqual(['word_id', 'stage', 'due_at', 'lapses', 'streak', 'last_seen', 'stability', 'difficulty', 'reps']);
  });
});

// ------------------------------------------------------------------------------------------- picking

function mkWords(spec: Array<[string, 'core' | 'chunk', Row?]>): WordRecord[] {
  return spec.map(([id, tier, over]) => toWordRecord({
    ...fullRow, word_id: id, de: `Wort${id.slice(-3)}`, en: `meaning ${id}`, tier,
    pos: tier === 'chunk' ? 'phrase' : 'noun', article: tier === 'chunk' ? '' : 'die',
    example_de: `Hier steht Wort${id.slice(-3)} im Satz.`, example_en: 'x', example_2_de: `Dort steht Wort${id.slice(-3)} auch.`, example_2_en: 'y',
    prep: '', ...over,
  }));
}

function input(words: WordRecord[], over: Partial<PickInput> = {}, states?: Map<string, WordState>): PickInput {
  return {
    now: T0, dayStart: T0 - 8 * 60 * MIN, words, states: states ?? new Map(), session: newSession(), config: DEFAULT_CONFIG, canListen: true,
    exercises: new Map(words.map((w) => [w.id, exercisesFor(w, words)])), ...over,
  };
}

const introduced = (stage: number, due: number | null, over: Partial<WordState> = {}): WordState =>
  ({ ...initialState(full), stage, introduced: true, due, firstSeen: T0 - 3 * DAY, lastSeen: T0 - DAY, ...over });

describe('picking the next card', () => {
  const words = mkWords([['w_c0000001', 'core'], ['w_c0000002', 'core'], ['w_c0000003', 'core'], ['w_k0000001', 'chunk'], ['w_c0000004', 'core'], ['w_k0000002', 'chunk']]);

  it('a fresh deck starts with a new word as a Karte', () => {
    const p = pickNext(input(words))!;
    expect([p.reason, p.exercise.type]).toEqual(['new', 'karte']);
  });

  it('new words follow the 2/3 core, 1/3 chunk mix: core, core, chunk', () => {
    const states = new Map<string, WordState>();
    let session = newSession();
    const tiers: string[] = [];
    for (let i = 0; i < 3; i++) {
      const p = pickNext(input(words, { session }, states))!;
      tiers.push(p.word.tier);
      const e: LearnEvent = { ...ev({ wordId: p.word.id, kind: 'seen', exercise: 'karte' }), ts: T0 };
      states.set(p.word.id, step(states.get(p.word.id) ?? initialState(p.word), e, capabilities(p.word), 0.9));
      session = { ...afterCard(session, e), reinsert: [] };
    }
    expect(tiers).toEqual(['core', 'core', 'chunk']);
  });

  it('due words come first, lowest predicted recall first', () => {
    const m = { stability: 2, difficulty: 5 };
    const states = new Map<string, WordState>([
      ['w_c0000001', introduced(2, T0 - MIN, { memory: m, lastReview: T0 - 1 * DAY })],
      ['w_c0000002', introduced(2, T0 - MIN, { memory: m, lastReview: T0 - 9 * DAY })],
    ]);
    const p = pickNext(input(words, {}, states))!;
    expect([p.reason, p.word.id]).toEqual(['due', 'w_c0000002']);
  });

  it('new_per_day: no new word once the day is full', () => {
    const states = new Map(words.slice(0, 2).map((w) => [w.id, introduced(1, T0 + DAY, { firstSeen: T0 - MIN })]));
    const p = pickNext(input(words, { config: { ...DEFAULT_CONFIG, newPerDay: 2 } }, states))!;
    expect(p.reason).toBe('practice');
  });

  it('backlog_pause: no new words while many are due (silently)', () => {
    const states = new Map(words.slice(0, 2).map((w) => [w.id, introduced(1, T0 - MIN)]));
    const session: Session = { ...newSession(), recent: [{ wordId: 'w_c0000001', type: 'luecke' }, { wordId: 'w_c0000002', type: 'bedeutung' }] };
    const p = pickNext(input(words, { session, config: { ...DEFAULT_CONFIG, backlogPause: 2 } }, states))!;
    expect(p.reason).not.toBe('new');
  });

  it('a reinsertion whose turn has come wins over due words', () => {
    const states = new Map<string, WordState>([
      ['w_c0000001', introduced(1, T0 - MIN)],
      ['w_c0000003', introduced(1, T0 + DAY)],
    ]);
    const session: Session = { ...newSession(), cardIndex: 6, reinsert: [{ wordId: 'w_c0000003', at: 5 }] };
    expect(pickNext(input(words, { session }, states))!.word.id).toBe('w_c0000003');
  });

  it('never the same word within 3 cards', () => {
    const states = new Map(words.map((w) => [w.id, introduced(1, T0 - MIN)]));
    const session: Session = { ...newSession(), recent: ['w_c0000001', 'w_c0000002', 'w_c0000003'].map((id) => ({ wordId: id, type: 'bedeutung' as const })) };
    const p = pickNext(input(words, { session }, states))!;
    expect(['w_c0000001', 'w_c0000002', 'w_c0000003']).not.toContain(p.word.id);
  });

  it('never the same exercise type three times in a row', () => {
    const st = introduced(1, T0 - MIN);
    const session: Session = { ...newSession(), recent: [{ wordId: 'w_x', type: 'luecke' }, { wordId: 'w_y', type: 'luecke' }] };
    const x = chooseExercise(words[0]!, st, exercisesFor(words[0]!, words), session, true)!;
    expect(x.type).not.toBe('luecke');
  });

  it('a word missed twice in this visit rests until the next open', () => {
    const states = new Map<string, WordState>([['w_c0000001', introduced(1, T0 - 10 * DAY)], ['w_c0000002', introduced(1, T0 + DAY)]]);
    let session = newSession();
    for (let i = 0; i < 2; i++) session = afterCard(session, ev({ wordId: 'w_c0000001', correct: false }));
    expect(session.reinsert.find((r) => r.wordId === 'w_c0000001')).toBeUndefined();
    session = { ...session, recent: [], missStreak: 0 };
    expect(pickNext(input(words, { session }, states))!.word.id).not.toBe('w_c0000001');
  });

  it('a miss is reinserted 3–5 cards later; a Karte gets its first recall 3–5 cards later', () => {
    const s1 = afterCard(newSession(), ev({ wordId: 'w_c0000001', correct: false }));
    const s2 = afterCard(newSession(), ev({ wordId: 'w_c0000002', kind: 'seen', exercise: 'karte' }));
    for (const [s, id] of [[s1, 'w_c0000001'], [s2, 'w_c0000002']] as const) {
      const r = s.reinsert.find((x) => x.wordId === id)!;
      expect(r.at - s.cardIndex).toBeGreaterThanOrEqual(3);
      expect(r.at - s.cardIndex).toBeLessThanOrEqual(5);
    }
  });

  it('practice never runs out: when every word rests, a new word comes, even past the daily pace', () => {
    const states = new Map(words.slice(0, 3).map((w) => [w.id, introduced(1, T0 - MIN, { firstSeen: T0 - MIN })]));
    const misses = Object.fromEntries(words.slice(0, 3).map((w) => [w.id, 2]));
    const session: Session = { ...newSession(), misses };
    const p = pickNext(input(words, { session, config: { ...DEFAULT_CONFIG, newPerDay: 3 } }, states))!;
    expect([p.reason, words.slice(0, 3).map((w) => w.id).includes(p.word.id)]).toEqual(['new', false]);
  });

  it('with nothing new left, a resting word comes back rather than no card at all', () => {
    const small = words.slice(0, 2);
    const states = new Map(small.map((w) => [w.id, introduced(1, T0 - MIN)]));
    const session: Session = { ...newSession(), misses: { w_c0000001: 2, w_c0000002: 2 }, recent: [{ wordId: 'w_c0000002', type: 'luecke' }] };
    expect(pickNext(input(small, { session }, states))!.word.id).toBe('w_c0000001');
  });

  it('after two misses in a row, an easy win (stage 4–5) comes next', () => {
    const states = new Map<string, WordState>([
      ['w_c0000001', introduced(1, T0 - DAY)],
      ['w_c0000004', introduced(5, T0 + 30 * DAY, { memory: { stability: 40, difficulty: 3 }, lastReview: T0 - DAY })],
    ]);
    const session: Session = { ...newSession(), missStreak: 2 };
    const p = pickNext(input(words, { session }, states))!;
    expect([p.reason, p.word.id]).toEqual(['easy', 'w_c0000004']);
  });

  it('no German voice: Hören never appears', () => {
    const st = introduced(2, T0 - MIN, { reps: 2 }); // a variety turn, where Hören would be a candidate
    for (let reps = 0; reps < 9; reps++) {
      const x = chooseExercise(words[0]!, { ...st, reps }, exercisesFor(words[0]!, words), newSession(), false);
      expect(x?.type).not.toBe('hoeren');
    }
  });

  it('every third review is a variety exercise; the rest are the gate', () => {
    const exs = exercisesFor(words[0]!, words);
    const gate = chooseExercise(words[0]!, introduced(1, null, { reps: 0 }), exs, newSession(), true)!;
    const variety = chooseExercise(words[0]!, introduced(1, null, { reps: 2 }), exs, newSession(), true)!;
    expect(gate.type).toBe('luecke');
    expect(variety.type).not.toBe('luecke');
  });

  it('pending suggestions appear only as a Karte, at most once every five cards, and are not reinserted', () => {
    const pending = mkWords([['w_p0000001', 'core']]).map((w) => ({ ...w, status: 'pending' }));
    const p = pickNext(input(pending))!;
    expect(p.exercise.type).toBe('karte');
    const s = afterCard(newSession(), ev({ wordId: 'w_p0000001', kind: 'seen', exercise: 'karte' }), true);
    expect(s.reinsert).toEqual([]);
    expect(pickNext(input(pending, { session: s }))).toBeNull();
  });
});

describe('simulation: 300 cards on the demo deck', () => {
  it('always finds a card; no word twice in a row; no type three times in a row; stages stay 0–5', () => {
    const words = DEMO_WORDS.map((w) => toWordRecord(w));
    const exercises = new Map(words.map((w) => [w.id, exercisesFor(w, words)]));
    const events: LearnEvent[] = [];
    let session = newSession();
    const shown: Array<{ wordId: string; type: ExerciseType }> = [];
    const rand = seededBytes(7);
    for (let i = 0; i < 300; i++) {
      const now = T0 + i * 20_000 + Math.floor(i / 60) * DAY; // a new visit (and day) every 60 cards
      if (i % 60 === 0) session = newSession();
      const states = replay(words, events);
      const p = pickNext({ now, dayStart: now - (now - T0) % DAY, words, states, exercises, session, config: DEFAULT_CONFIG, canListen: true });
      expect(p).not.toBeNull();
      const e: LearnEvent = {
        id: `e_s${String(i).padStart(7, '0')}`, ts: now, wordId: p!.word.id, kind: p!.exercise.type === 'karte' ? 'seen' : 'review',
        exercise: p!.exercise.type, correct: rand(1)[0]! % 5 !== 0, ms: 3000, help: false, dontKnow: false,
      };
      events.push(e);
      session = afterCard(session, e);
      shown.push({ wordId: e.wordId, type: e.exercise });
    }
    for (let i = 1; i < shown.length; i++) {
      if (i % 60 === 0) continue; // a new visit may start with any word
      expect(shown[i]!.wordId).not.toBe(shown[i - 1]!.wordId);
    }
    for (let i = 2; i < shown.length; i++) {
      if (i % 60 < 2) continue;
      expect(shown[i]!.type === shown[i - 1]!.type && shown[i]!.type === shown[i - 2]!.type).toBe(false);
    }
    const final = replay(words, events);
    for (const s of final.values()) expect(s.stage).toBeGreaterThanOrEqual(0), expect(s.stage).toBeLessThanOrEqual(5);
    expect(new Set(shown.map((s) => s.type)).size).toBeGreaterThanOrEqual(6);
  });
});
