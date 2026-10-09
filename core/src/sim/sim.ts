/**
 * A deterministic simulator for comparing schedulers (ENGINE.md "Choosing the scheduler").
 *
 * THE LEARNER IS SYNTHETIC. Its forgetting curve, per-type difficulty and learning gains are assumptions
 * chosen to be plausible (FSRS-shaped forgetting, harder formats give more learning, unfamiliar formats
 * are harder at first), not measurements of a person. Results are indicative of how the designs behave
 * under these assumptions, not proof of what is best for a real learner.
 *
 * Designs:
 *   a   one FSRS state per word; the exercise type is a presentation choice (uniform over what the row allows)
 *   b   one FSRS state per word × exercise type ("facets"), each scheduled independently
 *   ladder  one FSRS state per word; the stage ladder picks the type (round 2 engine), plain grades
 *   c0  one FSRS state per word decides WHEN; per word × type evidence decides WHICH (hybrid), plain grades
 *   c   as c0, plus weighted grades: harder types move the state more, easier ones less (the full hypothesis)
 *   crt as c, plus Hard/Easy inferred from (simulated) response time
 */
import { EXERCISE_TYPES, exercisesFor, type ExerciseType } from '../exercises.ts';
import { initMemory, interval, retrievability, review, type Memory, type Rating } from '../fsrs.ts';
import { toWordRecord, type WordRecord } from '../record.ts';
import { composeRun } from '../engine/run.ts';
import { rng } from '../engine/rng.ts';
import { DEFAULT_SETTINGS } from '../engine/settings.ts';
import { DEFAULT_CONFIG, replay, type GradeWeights, type LearnEvent } from '../scheduler.ts';

export type Design = 'a' | 'b' | 'ladder' | 'c0' | 'c' | 'crt';
const DAY = 86_400_000;
const T0 = Date.parse('2026-01-05T00:00:00Z'); // a Monday

// ---------------------------------------------------------------- the synthetic learner

/** Exponent on recall probability: >1 harder than plain recall, <1 easier. */
export const DIFFICULTY: Record<ExerciseType, number> = {
  karte: 1.0, bedeutung: 0.45, artikel: 0.6, plural: 0.8, luecke: 0.75, praeposition: 1.0, kollokation: 0.9,
  hoeren: 1.1, kontext2: 1.0, reihenfolge: 1.2, tippen: 1.6,
};
/** How much a successful retrieval in this format strengthens memory (testing effect: production > recognition). */
export const GAIN: Record<ExerciseType, number> = {
  karte: 0.9, bedeutung: 0.55, artikel: 0.5, plural: 0.6, luecke: 1.0, praeposition: 0.9, kollokation: 1.0,
  hoeren: 0.9, kontext2: 1.1, reihenfolge: 1.25, tippen: 1.4,
};

interface Truth { s: number; last: number; d: number; practice: Record<string, number> }

/** Probability that the learner answers a `type` exercise on this word right, now. */
export function pCorrect(t: Truth, type: ExerciseType, now: number): number {
  const r = Math.pow(1 + ((19 / 81) * Math.max(0, now - t.last)) / DAY / t.s, -0.5);
  const familiarity = 1 + 0.5 / (1 + (t.practice[type] ?? 0));
  return Math.pow(r, DIFFICULTY[type] * t.d * familiarity);
}

function learn(t: Truth, type: ExerciseType, ok: boolean, now: number): void {
  const r = Math.pow(1 + ((19 / 81) * Math.max(0, now - t.last)) / DAY / t.s, -0.5);
  if (ok) t.s = t.s * (1 + GAIN[type] * (0.5 + 4 * (1 - r)) * Math.pow(t.s, -0.2));
  else t.s = Math.max(0.3, t.s * 0.35);
  t.s = Math.min(t.s, 3650);
  t.last = now;
  t.practice[type] = (t.practice[type] ?? 0) + 1;
}

/** Simulated response time: fast when recall is easy, slow when it is shaky (for the crt variant only). */
const responseMs = (p: number) => 1500 + 9000 * (1 - p);

// ---------------------------------------------------------------- synthetic sheet

const SYL = ['ka', 'lo', 'mi', 'ter', 'bun', 'sa', 'ri', 'fel', 'do', 'nar', 'pe', 'gu', 'tos', 'wen', 'li', 'mar', 'zo', 'bi', 'ken', 'ru'];
const ART = ['der', 'die', 'das'] as const;
/** A meaning made of letters only and unique per word, so no two glosses share a word (the ambiguity guard would drop them). */
const letters = (k: number) => { let x = k + 1, out = ''; while (x > 0) { out = String.fromCharCode(97 + (x % 26)) + out; x = Math.floor(x / 26); } return `${out}${out}${out}`; };

/** `n` synthetic words with a column coverage like a real learner sheet (about 3/4 with examples, some plurals). */
export function syntheticSheet(n: number, seed: string, offset = 0): WordRecord[] {
  const r = rng(`sheet|${seed}|${offset}`);
  const out: WordRecord[] = [];
  for (let i = 0; i < n; i++) {
    const k = i + offset;
    const stem = SYL[k % 20]! + SYL[Math.floor(k / 20) % 20]! + SYL[(k * 7 + 3) % 20]!;
    const kind = r();
    const noun = kind < 0.45, verb = !noun && kind < 0.7, phrase = kind >= 0.9;
    const de = noun ? stem[0]!.toUpperCase() + stem.slice(1) : verb ? `${stem}en` : phrase ? `Na ${stem}, gut.` : `${stem}ig`;
    const ex = r() < 0.8;
    const ex2 = ex && r() < 0.7;
    const article = noun ? ART[Math.floor(r() * 3)]! : '';
    out.push(toWordRecord({
      word_id: `w_s${String(k).padStart(7, '0')}`, status: 'active', de, en: letters(k), pos: noun ? 'noun' : verb ? 'verb' : phrase ? 'phrase' : 'adj',
      article, plural: noun && r() < 0.5 ? `${de}en` : '',
      example_de: ex ? (phrase ? `Kommst du? ${de}` : `Heute sehe ich ${de} am Ort ${k}.`) : '', example_en: ex ? `Today I see it ${k}.` : '',
      example_2_de: ex2 ? (phrase ? `Und dann? ${de}` : `Morgen bringt ${de} viel Ruhe ${k}.`) : '', example_2_en: ex2 ? `Tomorrow ${k}.` : '',
      collocation: noun && r() < 0.25 ? `${article === 'der' ? 'den' : article} ${de} holen` : '',
    }));
  }
  return out;
}

// ---------------------------------------------------------------- facet scheduler for design b

interface Facet { memory: Memory | null; last: number | null; due: number | null; introduced: boolean }

// ---------------------------------------------------------------- the run loop

export interface SimOptions {
  design: Design;
  seed: string;
  words?: number;
  days?: number;
  runsPerDay?: number;
  /** Words added to the sheet half-way (a sheet edit). */
  addAtHalf?: number;
  runLength?: number;
  newPerRun?: number;
}

export interface SimResult {
  design: Design;
  /** Mean probability of a right answer at the end, over introduced words: recognition, cloze, production averaged. */
  retention: number;
  /** Same, only for production (typing). */
  production: number;
  cardsPerDay: number;
  /** Mean number of items the scheduler held due per day, a measure of pressure (never shown to the learner). */
  duePerDay: number;
  introduced: number;
  /** Expected number of words answerable at the end: sum over met words of the mean probability of a right answer. */
  known: number;
  /** Median days from introduction until the learner's true memory first lasts 21 days. */
  daysToSecure: number | null;
  secureAtEnd: number;
  /** Share of cards per exercise family. */
  spread: { karte: number; recognition: number; context: number; production: number };
  /** Retention at the end for the words added half-way. */
  lateRetention: number | null;
  events: LearnEvent[];
}

const FAMILY: Record<ExerciseType, keyof SimResult['spread']> = {
  karte: 'karte', bedeutung: 'recognition', artikel: 'recognition', plural: 'recognition',
  luecke: 'context', praeposition: 'context', kollokation: 'context', kontext2: 'context', hoeren: 'context',
  tippen: 'production', reihenfolge: 'production',
};

export const WEIGHTED: GradeWeights = {
  karte: 1, bedeutung: 0.6, artikel: 0.6, plural: 0.6, luecke: 1, praeposition: 1, kollokation: 1, hoeren: 1, kontext2: 1.1, reihenfolge: 1.25, tippen: 1.25,
};

export function simulate(o: SimOptions): SimResult {
  const days = o.days ?? 60, perDay = o.runsPerDay ?? 2, n = o.words ?? 120;
  const settings = { ...DEFAULT_SETTINGS, runLength: o.runLength ?? 6, newPerRun: o.newPerRun ?? 2 };
  let words = syntheticSheet(n, o.seed);
  const late = o.addAtHalf ? syntheticSheet(o.addAtHalf, o.seed, 1000) : [];
  const r = rng(`learner|${o.seed}|${o.design}`);
  const truth = new Map<string, Truth>();
  const introducedAt = new Map<string, number>();
  const securedAt = new Map<string, number>();
  const events: LearnEvent[] = [];
  const facets = new Map<string, Facet>();
  const exCache = new Map<string, ExerciseType[]>();
  let cards = 0, dueSum = 0, evN = 0;
  const shown: Record<string, number> = { karte: 0, recognition: 0, context: 0, production: 0 };
  const config = {
    ...DEFAULT_CONFIG,
    weights: o.design === 'c' || o.design === 'crt' ? WEIGHTED : undefined,
    selector: (o.design === 'ladder' || o.design === 'a' ? 'ladder' : 'stats') as 'ladder' | 'stats',
  };

  const typesOf = (w: WordRecord): ExerciseType[] => {
    if (!exCache.has(w.id)) exCache.set(w.id, exercisesFor(w, words, { extended: true, fewerOptions: true }).map((x) => x.type));
    return exCache.get(w.id)!;
  };

  const answer = (w: WordRecord, type: ExerciseType, now: number, run: string): LearnEvent => {
    let t = truth.get(w.id);
    if (!t) { t = { s: 0.4, last: now, d: 0.8 + 0.4 * r(), practice: {} }; truth.set(w.id, t); introducedAt.set(w.id, now); }
    const p = pCorrect(t, type, now);
    const ok = type === 'karte' && !t.practice.karte ? r() < 0.3 : r() < p;
    learn(t, type, ok, now);
    if (!securedAt.has(w.id) && t.s >= 21) securedAt.set(w.id, now);
    shown[FAMILY[type]]!++;
    cards++;
    const ms = o.design === 'crt' ? responseMs(p) : 2000;
    const rating: Rating | undefined = type === 'karte' ? (ok ? (p > 0.95 ? 4 : 3) : 1)
      : o.design === 'crt' && ok ? (ms < 2500 ? 4 : ms > 7000 ? 2 : 3) : undefined;
    return {
      id: `e_${String(++evN).padStart(8, '0')}`, ts: now, wordId: w.id, kind: 'review', exercise: type, correct: ok,
      ms, help: false, dontKnow: false, run, ...(rating ? { rating } : {}),
    };
  };

  for (let day = 0; day < days; day++) {
    if (o.addAtHalf && day === Math.floor(days / 2)) { words = [...words, ...late]; exCache.clear(); }
    for (let k = 0; k < perDay; k++) {
      const now = T0 + day * DAY + (8 + k * 5) * 3_600_000;
      const run = `r_${day}_${k}`;
      if (o.design === 'b') {
        // Facets: every (word, type) pair is its own item. Due facets first (lowest recall), then new facets.
        const all: Array<{ w: WordRecord; t: ExerciseType; f: Facet }> = [];
        for (const w of words) for (const t of typesOf(w)) {
          const key = `${w.id}|${t}`;
          if (!facets.has(key)) facets.set(key, { memory: null, last: null, due: null, introduced: false });
          all.push({ w, t, f: facets.get(key)! });
        }
        const due = all.filter((x) => x.f.introduced && x.f.due! <= now)
          .sort((a, b) => retrievability((now - a.f.last!) / DAY, a.f.memory!.stability) - retrievability((now - b.f.last!) / DAY, b.f.memory!.stability));
        if (k === 0) dueSum += due.length;
        const seenWords = new Set([...truth.keys()]);
        // New facets: the Karte of a new word first; other facets of met words open up as they become due.
        const fresh = all.filter((x) => !x.f.introduced && (x.t === 'karte' ? !seenWords.has(x.w.id) : seenWords.has(x.w.id)));
        const newKarte = fresh.filter((x) => x.t === 'karte').slice(0, Math.min(settings.newPerRun, Math.max(0, settings.runLength - due.length)));
        const openFacets = fresh.filter((x) => x.t !== 'karte');
        const pick: typeof all = [];
        const usedWords = new Set<string>();
        for (const x of [...due, ...newKarte, ...openFacets, ...all.filter((y) => y.f.introduced)]) {
          if (pick.length >= settings.runLength) break;
          if (usedWords.has(x.w.id) || pick.includes(x)) continue;
          pick.push(x); usedWords.add(x.w.id);
        }
        for (const x of pick) {
          const e = answer(x.w, x.t, now, run);
          const g: Rating = e.rating ?? (e.correct ? 3 : 1);
          x.f.memory = x.f.memory && x.f.last !== null ? review(x.f.memory, (now - x.f.last) / DAY, g) : initMemory(g);
          x.f.last = now; x.f.introduced = true;
          x.f.due = now + interval(x.f.memory.stability, 0.9) * DAY;
          events.push(e);
        }
        continue;
      }
      // a, c0, c, crt: one state per word, composed by the engine.
      const runCards = composeRun({ words, events, settings, config, now, seed: `${o.seed}|${day}|${k}`, canListen: true });
      if (k === 0) {
        const st = composeRunDueCount(words, events, config, now);
        dueSum += st;
      }
      for (const c of runCards) {
        let type = c.exercise.type;
        if (o.design === 'a') {
          const opts = typesOf(c.word).filter((t) => t !== 'karte');
          type = c.exercise.type === 'karte' || !opts.length ? 'karte' : opts[Math.floor(r() * opts.length)]!;
        }
        events.push(answer(c.word, type, now, run));
      }
    }
  }

  // End-of-test measurement: one probe per family, no learning.
  const end = T0 + days * DAY;
  const probe = (ids: string[], types: ExerciseType[]) => {
    if (!ids.length) return null;
    let s = 0;
    for (const id of ids) for (const t of types) s += pCorrect({ ...truth.get(id)!, practice: { [t]: 5 } }, t, end);
    return s / (ids.length * types.length);
  };
  const ids = [...truth.keys()];
  const lateIds = ids.filter((id) => late.some((w) => w.id === id));
  const gaps = [...securedAt].map(([id, ts]) => (ts - introducedAt.get(id)!) / DAY).sort((a, b) => a - b);
  const total = Object.values(shown).reduce((a, b) => a + b, 0) || 1;
  return {
    design: o.design,
    retention: probe(ids, ['bedeutung', 'luecke', 'tippen']) ?? 0,
    production: probe(ids, ['tippen']) ?? 0,
    cardsPerDay: cards / days,
    duePerDay: dueSum / days,
    introduced: ids.length,
    known: (probe(ids, ['bedeutung', 'luecke', 'tippen']) ?? 0) * ids.length,
    daysToSecure: gaps.length ? gaps[Math.floor(gaps.length / 2)]! : null,
    secureAtEnd: ids.filter((id) => truth.get(id)!.s >= 21).length,
    spread: { karte: shown.karte! / total, recognition: shown.recognition! / total, context: shown.context! / total, production: shown.production! / total },
    lateRetention: probe(lateIds, ['bedeutung', 'luecke', 'tippen']),
    events,
  };
}

/** Words the one-state scheduler holds due at `now` (a pressure measure for the comparison only). */
function composeRunDueCount(words: readonly WordRecord[], events: readonly LearnEvent[], config: typeof DEFAULT_CONFIG, now: number): number {
  let n = 0;
  for (const st of replay(words, events, config.retention, config.weights).values()) if (st.introduced && st.due !== null && st.due <= now) n++;
  return n;
}

export const ALL_DESIGNS: Design[] = ['a', 'b', 'ladder', 'c0', 'c', 'crt'];
export { EXERCISE_TYPES };
