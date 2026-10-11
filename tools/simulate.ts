/**
 * Engine simulator (Round 4, slice 5): runs the real scheduler (core/src/scheduler.ts) and exercise
 * generator against a SYNTHETIC learner for N days, and reports the share of cards per exercise type
 * and how many words reach "secure" (stage 5) by day 30 and day 60.
 *
 *   node --experimental-strip-types tools/simulate.ts [--words 60,300] [--days 60] [--cards 30] [--seed 7]
 *
 * The synthetic learner is an ASSUMPTION, not data:
 *   - each word has a hidden "true" memory that follows the same FSRS-5 model with a per-word
 *     difficulty drawn from 3–8, so the scheduler's estimate is close but not equal to it;
 *   - recall chance = retrievability now × an exercise factor (recognition easier, typing harder);
 *   - the Karte self-report is drawn from the same chance; response times are drawn below the "slow"
 *     thresholds 85 % of the time;
 *   - the learner practises every day: two visits, morning and evening, of cards/2 cards each.
 * Real learners skip days, binge, guess and get tired. Treat the numbers as a check of the engine's
 * mechanics (which exercise types appear, does the ladder move), not as a forecast.
 */
import { exercisesFor, type Exercise, type ExerciseType, EXERCISE_TYPES, capabilities } from '../core/src/exercises.ts';
import { interval, retrievability, review, initMemory, type Memory, type Rating } from '../core/src/fsrs.ts';
import { toWordRecord, type WordRecord } from '../core/src/record.ts';
import {
  afterCard, DEFAULT_CONFIG, newSession, pickNext, replay, SLOW_MS, step, type LearnEvent, type Session, type WordState,
} from '../core/src/scheduler.ts';

const DAY = 86_400_000;
const arg = (name: string, d: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : d;
};
const SIZES = arg('words', '60,300').split(',').map(Number);
const DAYS = Number(arg('days', '60'));
const CARDS = Number(arg('cards', '30'));
const SEED = Number(arg('seed', '7'));

function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    return x / 0x100000000;
  };
}

// ------------------------------------------------------------------ synthetic deck (synthetic words)

const NOUN_SENT: Array<[string, string]> = [
  ['Ich suche {a} {w}.', 'acc'], ['{A} {w} ist neu.', 'nom'], ['Wir sprechen über {a} {w}.', 'acc'], ['Hast du {a} {w} gesehen?', 'acc'],
];
const ACC: Record<string, string> = { der: 'den', die: 'die', das: 'das' };

/** A deck of synthetic records with the same column richness as a good agent-filled sheet. */
function deck(n: number, r: () => number): WordRecord[] {
  const out: WordRecord[] = [];
  for (let i = 0; i < n; i++) {
    const id = `w_sim${String(i).padStart(5, '0')}`;
    const kind = r();
    if (kind < 0.5) {
      const article = (['der', 'die', 'das'] as const)[i % 3]!;
      const w = `Nomen${i}`;
      const s = (k: number) => {
        const [t, c] = NOUN_SENT[(i + k) % NOUN_SENT.length]!;
        const a = c === 'acc' ? ACC[article]! : article;
        return t.replace('{a}', a).replace('{A}', a[0]!.toUpperCase() + a.slice(1)).replace('{w}', w);
      };
      out.push(toWordRecord({ word_id: id, de: w, article, plural: `${w}en`, en: `noun ${i}`, pos: 'noun', status: 'active',
        example_de: s(0), example_en: 'x', example_2_de: s(1), example_2_en: 'y', prep: i % 4 === 0 ? 'für' : '' }));
    } else if (kind < 0.75) {
      const w = `verbiren${i}`.replace(/\d+$/, '') + 'x'.repeat(i % 5) + 'en';
      const stem = w.slice(0, -2);
      out.push(toWordRecord({ word_id: id, de: w, en: `verb ${i}`, pos: 'verb', status: 'active',
        example_de: `Ich ${stem}e das morgen.`, example_en: 'x', example_form: `${stem}e`,
        example_2_de: `Wir haben das gestern ge${stem}t.`, example_2_en: 'y', example_2_form: `ge${stem}t` }));
    } else if (kind < 0.9) {
      const w = `adjig${'y'.repeat(i % 7)}${i % 2 ? 'o' : 'u'}`;
      out.push(toWordRecord({ word_id: id, de: w, en: `adj ${i}`, pos: 'adj', status: 'active',
        example_de: `Das ist ${w}.`, example_en: 'x', example_2_de: `Wirklich ${w}, oder?`, example_2_en: 'y' }));
    } else {
      const w = `Satz ${i} bitte.`;
      out.push(toWordRecord({ word_id: id, de: w, en: `phrase ${i}`, pos: 'phrase', status: 'active',
        example_de: `Ja. ${w}`, example_en: 'x', example_2_de: `Gut. ${w}`, example_2_en: 'y' }));
    }
  }
  return out;
}

// ------------------------------------------------------------------ synthetic learner

const EASE: Record<ExerciseType, number> = {
  karte: 1, artikel: 1.25, bedeutung: 1.3, hoeren: 1.15, luecke: 1, praeposition: 1, kontext2: 0.95, tippen: 0.8,
};

interface Truth { memory: Memory | null; last: number | null; difficulty: number }

function chance(t: Truth, now: number, type: ExerciseType): number {
  const r = t.memory && t.last !== null ? retrievability((now - t.last) / DAY, t.memory.stability) : 0.25;
  const p = type === 'artikel' || type === 'bedeutung' || type === 'hoeren' ? 1 - (1 - r) / EASE[type] : r * EASE[type];
  return Math.min(0.98, Math.max(0.02, p));
}

function learn(t: Truth, now: number, g: Rating): Truth {
  const m = t.memory && t.last !== null ? review(t.memory, (now - t.last) / DAY, g) : initMemory(g);
  return { ...t, memory: { stability: m.stability * (5.5 / t.difficulty), difficulty: m.difficulty }, last: now };
}

interface Report {
  words: number;
  cards: number;
  byType: Record<ExerciseType, number>;
  /** Cards for words at stage ≥ 3 (past the building stage), by type. */
  pastBuilding: Record<ExerciseType, number>;
  secureAt30: number;
  secureAt60: number;
  introducedAt60: number;
  standIns: number;
}

function simulate(size: number): Report {
  const r = rng(SEED * 1000 + size);
  const words = deck(size, r);
  const exs = new Map<string, Exercise[]>(words.map((w) => [w.id, exercisesFor(w, words)]));
  const truth = new Map<string, Truth>(words.map((w) => [w.id, { memory: null, last: null, difficulty: 3 + r() * 5 }]));
  const events: LearnEvent[] = [];
  let states = replay(words, []);
  const zero = () => Object.fromEntries(EXERCISE_TYPES.map((t) => [t, 0])) as Record<ExerciseType, number>;
  const rep: Report = { words: size, cards: 0, byType: zero(), pastBuilding: zero(), secureAt30: 0, secureAt60: 0, introducedAt60: 0, standIns: 0 };
  const start = Date.parse('2026-01-05T00:00:00Z');
  let n = 0;

  for (let day = 0; day < DAYS; day++) {
    for (const hour of [8, 19]) {
      let session: Session = newSession();
      let now = start + day * DAY + hour * 3_600_000;
      for (let c = 0; c < CARDS / 2; c++) {
        const pick = pickNext({ now, dayStart: start + day * DAY, words, states, exercises: exs, session, config: DEFAULT_CONFIG, canListen: true });
        if (!pick) break;
        const type = pick.exercise.type;
        const st = states.get(pick.word.id)!;
        rep.cards++;
        rep.byType[type]++;
        if (st.stage >= 3) rep.pastBuilding[type]++;
        if (pick.asGate) rep.standIns++;
        const t = truth.get(pick.word.id)!;
        const p = chance(t, now, type);
        const correct = r() < p;
        const ms = r() < 0.85 ? 1500 + r() * (Math.min(SLOW_MS[type], 20_000) - 1500) : SLOW_MS[type] + 2000;
        let e: LearnEvent;
        if (type === 'karte') {
          const rating = (p > 0.8 ? 3 : p > 0.5 ? 2 : 1) as Rating;
          e = { id: `e_${(++n).toString(36).padStart(8, '0')}`, ts: now, wordId: pick.word.id, kind: 'seen', exercise: type, correct: true, ms, help: false, dontKnow: false, rating };
          truth.set(pick.word.id, learn(t, now, rating));
        } else {
          e = { id: `e_${(++n).toString(36).padStart(8, '0')}`, ts: now, wordId: pick.word.id, kind: 'review', exercise: type, correct, ms, help: false, dontKnow: false, ...(pick.asGate ? { gate: true } : {}) };
          truth.set(pick.word.id, learn(t, now, correct ? (ms > SLOW_MS[type] ? 2 : 3) : 1));
        }
        events.push(e);
        states.set(pick.word.id, step(st, e, capabilities(pick.word), DEFAULT_CONFIG.retention));
        session = afterCard(session, e);
        now += 20_000;
      }
    }
    const secure = [...states.values()].filter((s: WordState) => s.stage >= 5).length;
    if (day === 29) rep.secureAt30 = secure;
    if (day === DAYS - 1) {
      rep.secureAt60 = secure;
      rep.introducedAt60 = [...states.values()].filter((s) => s.introduced).length;
    }
  }
  // Replay determinism check: the log alone gives the same states.
  const again = replay(words, events);
  for (const [id, s] of states) if (JSON.stringify(again.get(id)) !== JSON.stringify(s)) throw new Error(`replay mismatch for ${id}`);
  void interval;
  return rep;
}

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)} %` : '–');
for (const size of SIZES) {
  const rep = simulate(size);
  const past = Object.values(rep.pastBuilding).reduce((x, y) => x + y, 0);
  console.log(`\n## ${size} words, ${DAYS} days, ${CARDS} cards/day (seed ${SEED})`);
  console.log(`cards: ${rep.cards}; stand-in gates: ${rep.standIns}`);
  console.log('| type | all cards | cards for words at stage ≥ 3 |');
  console.log('| --- | --- | --- |');
  for (const t of EXERCISE_TYPES) console.log(`| ${t} | ${pct(rep.byType[t], rep.cards)} | ${pct(rep.pastBuilding[t], past)} |`);
  console.log(`| reorder | not in this engine | not in this engine |`);
  console.log(`production (Tippen) share past the building stage: ${pct(rep.pastBuilding.tippen, past)}`);
  console.log(`secure (stage 5) by day 30: ${rep.secureAt30}; by day ${DAYS}: ${rep.secureAt60}; introduced by day ${DAYS}: ${rep.introducedAt60}`);
}
