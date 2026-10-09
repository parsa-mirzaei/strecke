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
import { rng } from './rng.ts';
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
  settings?: Pick<Settings, 'runLength' | 'newPerRun' | 'disabled'>;
  config?: EngineConfig;
  now: number;
  seed: string;
  /** A German voice exists; without one Hören is left out. */
  canListen: boolean;
  /** Words the learner chose to practise ("Diese üben"): they come first and no new words are added. */
  focus?: readonly string[];
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

  const states = replay(active, input.events, config.retention);
  const st = (w: WordRecord) => states.get(w.id) ?? initialState(w);
  const confusions = buildConfusions(input.events);
  const exMap = new Map(active.map((w) => [
    w.id,
    exercisesFor(w, active, { extended: true, confusions, seed: input.seed, fewerOptions: true }).filter((x) => isEnabled(settings, x.type)),
  ]));

  const playable = (w: WordRecord) => (exMap.get(w.id) ?? []).length > 0;
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
  const backlog = due.length >= config.backlogPause; // silent: slows new words, never shown
  const fresh = active.filter((w) => !st(w).introduced && playable(w));
  const newQuota = focus.length || backlog ? 0 : Math.min(settings.newPerRun, fresh.length, total);

  const reviewPool = [
    ...focus.map((w) => ({ w, reason: 'focus' as CardReason })),
    ...due.filter((w) => !focusIds.has(w.id)).map((w) => ({ w, reason: 'due' as CardReason })),
    ...rest.filter((w) => !focusIds.has(w.id)).map((w) => ({ w, reason: 'practice' as CardReason })),
  ];
  const reviews = reviewPool.slice(0, total - newQuota);
  // Too few words to review: more new ones, up to the run length, so a young sheet still fills a run.
  const extraNew = focus.length || backlog ? 0 : Math.max(0, Math.min(fresh.length - newQuota, total - newQuota - reviews.length, settings.newPerRun + 1 - newQuota));
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
    const x = chooseForRun(w, s, exMap.get(w.id) ?? [], prev, recallNow(s, now), canListen);
    if (!x) continue;
    cards.push({ word: w, exercise: x, reason });
    prev = x.type;
  }
  return cards;
}
