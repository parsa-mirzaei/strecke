/**
 * Composing a run (Runde): about six cards from the learner's own words (ENGINE.md "Selection", "Ladder").
 *
 * Pure and seeded: the same words, event log, settings, time and seed always give the same run. The
 * hidden FSRS state decides *which* words appear (due first, lowest predicted recall first, a few new
 * ones); the ladder stage and the word's current recall decide *which exercise* each word gets. The
 * run never starts with, or shows, a count of what is due.
 */
import {
  capabilities, exercisesFor, NEEDS_VOICE, STAGE_RANGE, type Exercise, type ExerciseType,
} from '../exercises.ts';
import type { WordRecord } from '../record.ts';
import {
  DEFAULT_CONFIG, gateTypes, initialState, recallNow, replay, type EngineConfig, type LearnEvent, type WordState,
} from '../scheduler.ts';
import { buildConfusions } from './distractors.ts';
import { hash, rng } from './rng.ts';
import { DEFAULT_SETTINGS, isEnabled, type Settings } from './settings.ts';

export type CardReason = 'new' | 'due' | 'practice' | 'focus';

export interface RunCard {
  word: WordRecord;
  exercise: Exercise;
  reason: CardReason;
}

export interface ComposeInput {
  words: readonly WordRecord[];
  events: readonly LearnEvent[];
  settings?: Pick<Settings, 'runLength' | 'newPerRun' | 'disabled'> & Partial<Pick<Settings, 'newPerDay'>>;
  config?: EngineConfig;
  now: number;
  seed: string;
  /** A German voice exists; without one Hören is left out. */
  canListen: boolean;
  /** Words the learner chose to practise ("Diese üben"): they come first and no new words are added. */
  focus?: readonly string[];
  /** Start of the learner's current day (for the daily cap on new words); default: local midnight before `now`. */
  dayStart?: number;
}

/** Words whose first answer falls on or after `dayStart`: today's new words. */
export function newToday(events: readonly LearnEvent[], dayStart: number): number {
  const first = new Map<string, number>();
  for (const e of events) { const f = first.get(e.wordId); if (f === undefined || e.ts < f) first.set(e.wordId, e.ts); }
  let n = 0;
  for (const ts of first.values()) if (ts >= dayStart) n++;
  return n;
}

/** Rough effort of an exercise, 0 (look) to 3 (produce). Variety picks stay at or below the ceiling set by recall. */
export const EFFORT: Record<ExerciseType, number> = {
  karte: 0, artikel: 1, bedeutung: 1, plural: 1, luecke: 2, praeposition: 2, kollokation: 2, hoeren: 2, kontext2: 3, reihenfolge: 3, tippen: 3,
};

/** Predicted recall below ~0.6 asks for recognition only; 0.6–0.85 for in-context choice; above, anything. */
export function effortCeiling(recall: number): number {
  return recall < 0.6 ? 1 : recall < 0.85 ? 2 : 3;
}

const STAGE5_ORDER: readonly ExerciseType[] = ['tippen', 'hoeren', 'kontext2', 'reihenfolge', 'kollokation', 'praeposition', 'plural', 'bedeutung', 'artikel'];

/**
 * The exercise for one word now. The ladder's gate promotes a word, so it is the default; every third
 * review is variety instead (as in the Phase B scheduler). Whatever is picked avoids the type just shown
 * in the run and the word's own last type, as far as the word's exercises allow.
 */
export function chooseForRun(
  w: WordRecord, st: WordState, exs: readonly Exercise[], prev: ExerciseType | null, recall: number, canListen: boolean,
): Exercise | null {
  const inStage = exs.filter((x) => {
    const [lo, hi] = STAGE_RANGE[x.type];
    return st.stage >= lo && st.stage <= hi && (canListen || !NEEDS_VOICE.has(x.type));
  });
  // Nothing else fits (a thin record in a small sheet): the Karte is always available, so no word is lost.
  if (!inStage.length) return exs.find((x) => x.type === 'karte') ?? null;
  const fresh = (x: Exercise) => x.type !== prev && x.type !== st.lastType;
  const byType = (list: readonly Exercise[], t: ExerciseType) => list.find((x) => x.type === t);

  if (st.stage === 0) return byType(inStage, 'karte') ?? null;

  const gate = gateTypes(st.stage, capabilities(w));
  const ceiling = effortCeiling(recall);
  const variety = inStage.filter((x) => x.type !== 'karte' && !gate.includes(x.type) && EFFORT[x.type] <= ceiling);
  const gates = inStage.filter((x) => gate.includes(x.type));

  if (st.stage >= 5) {
    const rotation = STAGE5_ORDER.map((t, i) => STAGE5_ORDER[(st.reps + i) % STAGE5_ORDER.length]!);
    const pool = inStage.filter((x) => x.type !== 'karte');
    for (const ok of [fresh, (x: Exercise) => x.type !== prev, () => true]) {
      for (const t of rotation) {
        const x = byType(pool, t);
        if (x && ok(x)) return x;
      }
    }
    return pool[0] ?? null;
  }

  const wantVariety = st.reps % 3 === 2 && variety.length > 0;
  const order = wantVariety ? [variety, gates, inStage] : [gates, variety, inStage];
  for (const ok of [fresh, (x: Exercise) => x.type !== prev, () => true]) {
    for (const list of order) {
      const pick = list.find((x) => x.type !== 'karte' && ok(x)) ?? list.find(ok);
      if (pick) return pick;
    }
  }
  return null;
}

// ---------------------------------------------------------------- per word × type evidence (round 3)

/** Recent answers of one word in one exercise type, newest last (1 = right, 0 = wrong). */
export type TypeStats = Map<string, Map<ExerciseType, number[]>>;

const RECENT = 4;

export function typeStats(events: readonly LearnEvent[]): TypeStats {
  const out: TypeStats = new Map();
  for (const e of [...events].sort((a, b) => a.ts - b.ts)) {
    if (e.kind !== 'review') continue;
    const m = out.get(e.wordId) ?? new Map<ExerciseType, number[]>();
    const xs = m.get(e.exercise) ?? [];
    xs.push(e.correct && !e.dontKnow && (e.rating ?? 3) > 1 ? 1 : 0);
    if (xs.length > RECENT) xs.shift();
    m.set(e.exercise, xs);
    out.set(e.wordId, m);
  }
  return out;
}

/** Effort levels for the evidence ladder: 0 look, 1 recognise, 2 use in context, 3 produce. */
export const LEVEL: Record<ExerciseType, number> = {
  karte: 0, bedeutung: 1, artikel: 1, plural: 1, luecke: 2, praeposition: 2, kollokation: 2, hoeren: 2, kontext2: 3, reihenfolge: 3, tippen: 3,
};

/**
 * Which exercise, from evidence: a word climbs to the next level once its recent answers one level down
 * are mostly right (at least 60 %, at least one), falls back below a level it just missed, and is held at
 * recognition while its predicted recall is low. Within a level, the least-practised type comes first, so
 * the word meets every format the row supports. The type just shown in the run and the word's own last
 * type are avoided when another fits.
 */
export function chooseByStats(
  st: WordState, exs: readonly Exercise[], stats: ReadonlyMap<ExerciseType, number[]> | undefined, prev: ExerciseType | null,
  recall: number, canListen: boolean, tie: (t: ExerciseType) => number,
): Exercise | null {
  const pool = exs.filter((x) => canListen || !NEEDS_VOICE.has(x.type));
  if (!pool.length) return null;
  const karte = pool.find((x) => x.type === 'karte') ?? null;
  if (!st.introduced) return karte;
  const answers = (lvl: number) => pool.filter((x) => LEVEL[x.type] === lvl).flatMap((x) => stats?.get(x.type) ?? []);
  const ready = (lvl: number) => { const a = answers(lvl); return a.length > 0 && a.reduce((s, v) => s + v, 0) / a.length >= 0.6; };
  const last = st.lastType;
  const lastMiss = last !== null && (stats?.get(last)?.at(-1) ?? 1) === 0;
  let level = 1;
  while (level < 3 && ready(level) && pool.some((x) => LEVEL[x.type] === level + 1)) level++;
  if (lastMiss && last) level = Math.min(level, Math.max(1, LEVEL[last] - 1));
  if (recall < 0.5) level = Math.min(level, 1);
  if (st.memory === null && st.lastType === 'karte' && (stats?.get('karte')?.at(-1) ?? 1) === 0) return karte; // "Nicht gewusst" on a new word
  for (let l = level; l >= 1; l--) {
    const atL = pool.filter((x) => LEVEL[x.type] === l);
    if (!atL.length) continue;
    const order = [...atL].sort((a, b) => (stats?.get(a.type)?.length ?? 0) - (stats?.get(b.type)?.length ?? 0) || tie(a.type) - tie(b.type));
    return order.find((x) => x.type !== prev && x.type !== last) ?? order.find((x) => x.type !== prev) ?? order[0]!;
  }
  return karte;
}

/** Positions for `k` new cards among `n`, spread evenly and never first when something else can open the run. */
function newSlots(n: number, k: number, canStartWithNew: boolean): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < k; i++) {
    let p = Math.floor(((i + 1) * n) / (k + 1));
    if (!canStartWithNew && p === 0) p = 1;
    while (out.has(p) && p < n - 1) p++;
    out.add(Math.min(p, n - 1));
  }
  return out;
}

const hasTier = (list: readonly WordRecord[], tier: string) => list.filter((w) => w.tier === tier);

/** New words in the 2/3 core, 1/3 chunk mix, in sheet order. */
function pickNew(fresh: readonly WordRecord[], k: number): WordRecord[] {
  const core = hasTier(fresh, 'core').slice(), chunk = hasTier(fresh, 'chunk').slice();
  const out: WordRecord[] = [];
  let c = 0, ch = 0;
  while (out.length < k && (core.length || chunk.length)) {
    const wantChunk = (ch + 1) * 3 <= c + ch + 1;
    const next = (wantChunk ? chunk.shift() ?? core.shift() : core.shift() ?? chunk.shift())!;
    if (next.tier === 'chunk') ch++; else c++;
    out.push(next);
  }
  return out;
}

export function composeRun(input: ComposeInput): RunCard[] {
  const settings = input.settings ?? DEFAULT_SETTINGS;
  const config = input.config ?? DEFAULT_CONFIG;
  const { now, canListen } = input;
  const random = rng(`${input.seed}|run`);
  const active = input.words.filter((w) => w.status === 'active');
  if (!active.length) return [];

  const states = replay(active, input.events, config.retention, config.weights);
  const st = (w: WordRecord) => states.get(w.id) ?? initialState(w);
  const confusions = buildConfusions(input.events);
  const stats = config.selector === 'stats' ? typeStats(input.events) : new Map();
  // Exercises are generated only for words that end up in the run (a 500-row sheet stays fast).
  const exCache = new Map<string, Exercise[]>();
  const exMap = {
    get(id: string): Exercise[] {
      let xs = exCache.get(id);
      if (!xs) {
        const w = active.find((x) => x.id === id)!;
        xs = exercisesFor(w, active, { extended: true, confusions, seed: input.seed, fewerOptions: true }).filter((x) => isEnabled(settings, x.type));
        exCache.set(id, xs);
      }
      return xs;
    },
  };
  // Every record with a German word and a meaning has at least its Karte.
  const playable = (w: WordRecord) => !!w.de && !!w.en;
  const introduced = active.filter((w) => st(w).introduced && playable(w));
  // Jitter only breaks ties between words with the same predicted recall.
  const jitter = new Map(active.map((w) => [w.id, random()]));
  const byRecall = (list: WordRecord[]) =>
    [...list].sort((a, b) => recallNow(st(a), now) - recallNow(st(b), now) || (jitter.get(a.id)! - jitter.get(b.id)!));

  const due = byRecall(introduced.filter((w) => st(w).due !== null && st(w).due! <= now));
  const rest = byRecall(introduced.filter((w) => !(st(w).due !== null && st(w).due! <= now)));
  const focus = (input.focus ?? []).map((id) => active.find((w) => w.id === id)).filter((w): w is WordRecord => !!w && playable(w));
  const focusIds = new Set(focus.map((w) => w.id));

  const total = Math.max(1, settings.runLength);
  const fresh = active.filter((w) => !st(w).introduced && playable(w));
  // New words per day (setting, default 10): introduced up to the daily cap whatever is due, at most
  // `newPerRun` per run; due reviews that do not fit stay due for the next run. Never shown as a count.
  const dayStart = input.dayStart ?? new Date(now).setHours(0, 0, 0, 0);
  const capLeft = Math.max(0, (settings.newPerDay ?? DEFAULT_SETTINGS.newPerDay) - newToday(input.events, dayStart));
  const newQuota = focus.length ? 0 : Math.min(settings.newPerRun, fresh.length, capLeft, total);

  const reviewPool = [
    ...focus.map((w) => ({ w, reason: 'focus' as CardReason })),
    ...due.filter((w) => !focusIds.has(w.id)).map((w) => ({ w, reason: 'due' as CardReason })),
    ...rest.filter((w) => !focusIds.has(w.id)).map((w) => ({ w, reason: 'practice' as CardReason })),
  ];
  const reviews = reviewPool.slice(0, total - newQuota);
  // Only a sheet with nothing to review yet gets one more new card, so a first run is not a single card.
  const extraNew = !focus.length && reviews.length === 0 && fresh.length > newQuota && total > newQuota && capLeft > newQuota ? 1 : 0;
  const news = pickNew(fresh, newQuota + extraNew).map((w) => ({ w, reason: 'new' as CardReason }));

  const n = reviews.length + news.length;
  const slots = newSlots(n, news.length, reviews.length === 0);
  const sequence: Array<{ w: WordRecord; reason: CardReason }> = [];
  let ri = 0, ni = 0;
  for (let i = 0; i < n; i++) sequence.push(slots.has(i) && ni < news.length ? news[ni++]! : reviews[ri++] ?? news[ni++]!);

  const cards: RunCard[] = [];
  let prev: ExerciseType | null = null;
  for (const { w, reason } of sequence) {
    const s = st(w);
    const x: Exercise | null = config.selector === 'stats'
      ? chooseByStats(s, exMap.get(w.id) ?? [], stats.get(w.id), prev, recallNow(s, now), canListen, (t) => hash(`${input.seed}|${w.id}|${t}`))
      : chooseForRun(w, s, exMap.get(w.id) ?? [], prev, recallNow(s, now), canListen);
    if (!x) continue;
    cards.push({ word: w, exercise: x, reason });
    prev = x.type;
  }
  return cards;
}
