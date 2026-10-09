/**
 * The numbers behind Verlauf (ENGINE.md "Dashboard"). Everything is computed from the event log and
 * the FSRS state replayed from it: nothing is stored, nothing is estimated about the world outside
 * the app. No streaks, no due or overdue counts, no forecast, no comparison.
 */
import { capabilities, type ExerciseType } from '../exercises.ts';
import type { WordRecord } from '../record.ts';
import { initialState, ratingFor, replay, sortEvents, step, DEFAULT_CONFIG, type LearnEvent, type WordState } from '../scheduler.ts';
import { splitRuns } from './runs.ts';
import { DEFAULT_SETTINGS, type Settings } from './settings.ts';

/** A word is "secure" once its memory lasts at least this long (FSRS stability, days). Anki's "mature" line. */
export const SECURE_STABILITY_DAYS = 21;

export type Level = 'new' | 'learning' | 'secure';

export function levelOf(st: WordState | undefined): Level {
  if (!st || !st.introduced) return 'new';
  return st.memory && st.memory.stability >= SECURE_STABILITY_DAYS ? 'secure' : 'learning';
}

export type HardKind = 'article' | 'plural' | 'preposition' | 'collocation' | 'meaning' | 'sentence' | 'recall' | 'topic';

const KIND_OF: Record<ExerciseType, HardKind> = {
  karte: 'recall', artikel: 'article', plural: 'plural', praeposition: 'preposition', kollokation: 'collocation',
  bedeutung: 'meaning', hoeren: 'meaning', luecke: 'sentence', kontext2: 'sentence', tippen: 'sentence', reihenfolge: 'sentence',
};

export interface HardItem {
  /** `word:<id>`, `kind:<kind>` or `topic:<domain>`; stable, used as a list key. */
  key: string;
  kind: 'word' | HardKind;
  /** German label for words (the word) and topics (domain id; the UI translates). */
  label: string;
  attempts: number;
  misses: number;
  /** Words to practise for this item ("Diese üben"), most missed first. */
  wordIds: string[];
}

export interface DayStat { date: string; runs: number; cards: number; secured: number }

export interface Dashboard {
  /** No events at all: the screen explains itself instead of showing zeros. */
  empty: boolean;
  today: DayStat;
  /** Monday to Sunday of the current week. */
  week: { days: DayStat[]; todayIndex: number; runs: number; cards: number; secured: number };
  words: { new: number; learning: number; secure: number; total: number };
  hard: { words: HardItem[]; kinds: HardItem[]; topics: HardItem[] };
  goal: { target: number; done: number } | null;
}

export interface DashboardInput {
  words: readonly WordRecord[];
  events: readonly LearnEvent[];
  settings?: Pick<Settings, 'runGapMin' | 'goal'>;
  now: number;
  retention?: number;
  /** Minutes east of UTC; defaults to the device's. Tests pass 0 for determinism. */
  tzOffsetMin?: number;
}

const DAY = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (ts: number, off: number) => {
  const d = new Date(ts + off * 60_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
/** 0 = Monday … 6 = Sunday, in the learner's time zone. */
const weekday = (ts: number, off: number) => (new Date(ts + off * 60_000).getUTCDay() + 6) % 7;

/** When each word first reached the secure line, by replaying the log one event at a time. */
export function secureTimes(words: readonly WordRecord[], events: readonly LearnEvent[], retention: number): Map<string, number> {
  const byId = new Map(words.map((w) => [w.id, w]));
  const caps = new Map(words.map((w) => [w.id, capabilities(w)]));
  const states = new Map(words.map((w) => [w.id, initialState(w)]));
  const out = new Map<string, number>();
  const seen = new Set<string>();
  for (const e of sortEvents(events)) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const st = states.get(e.wordId);
    if (!st || !byId.has(e.wordId)) continue;
    const next = step(st, e, caps.get(e.wordId)!, retention);
    states.set(e.wordId, next);
    if (!out.has(e.wordId) && levelOf(next) === 'secure') out.set(e.wordId, e.ts);
  }
  return out;
}

const isMiss = (e: LearnEvent) => ratingFor(e) === 1;
const isGraded = (e: LearnEvent) => e.kind === 'review';

const MIN_WORD_ATTEMPTS = 3;
const MIN_GROUP_ATTEMPTS = 8;
const MIN_MISS_SHARE = 0.25;

export function dashboard(input: DashboardInput): Dashboard {
  const { now } = input;
  const settings = input.settings ?? DEFAULT_SETTINGS;
  const retention = input.retention ?? DEFAULT_CONFIG.retention;
  const off = input.tzOffsetMin ?? -new Date(now).getTimezoneOffset();
  const words = input.words.filter((w) => w.status === 'active' || w.status === 'pending');
  const active = words.filter((w) => w.status === 'active');
  const byId = new Map(words.map((w) => [w.id, w]));
  const events = input.events.filter((e) => byId.has(e.wordId));

  // Days of this week.
  const todayIdx = weekday(now, off);
  const days: DayStat[] = Array.from({ length: 7 }, (_, i) => ({ date: dateKey(now - (todayIdx - i) * DAY, off), runs: 0, cards: 0, secured: 0 }));
  const dayOf = new Map(days.map((d) => [d.date, d]));
  for (const run of splitRuns(events, settings.runGapMin)) {
    const d = dayOf.get(dateKey(run.start, off));
    if (d) { d.runs++; d.cards += run.cards; }
  }
  for (const ts of secureTimes(active, events, retention).values()) {
    const d = dayOf.get(dateKey(ts, off));
    if (d) d.secured++;
  }
  const today = days[todayIdx]!;
  const sum = (f: (d: DayStat) => number) => days.reduce((n, d) => n + f(d), 0);

  // Where each word stands now.
  const states = replay(active, events, retention);
  const levels = { new: 0, learning: 0, secure: 0 };
  for (const w of active) levels[levelOf(states.get(w.id))]++;

  // Where it is hard.
  const perWord = new Map<string, { a: number; m: number }>();
  const perKind = new Map<string, { a: number; m: number; words: Map<string, number> }>();
  for (const e of events) {
    if (!isGraded(e)) continue;
    const w = byId.get(e.wordId)!;
    const miss = isMiss(e);
    const pw = perWord.get(w.id) ?? { a: 0, m: 0 };
    pw.a++; if (miss) pw.m++;
    perWord.set(w.id, pw);
    const keys = [`kind:${KIND_OF[e.exercise]}`, ...(w.domain ? [`topic:${w.domain}`] : [])];
    for (const k of keys) {
      const g = perKind.get(k) ?? { a: 0, m: 0, words: new Map<string, number>() };
      g.a++;
      if (miss) { g.m++; g.words.set(w.id, (g.words.get(w.id) ?? 0) + 1); }
      perKind.set(k, g);
    }
  }
  const order = (x: HardItem, y: HardItem) => y.misses / y.attempts - x.misses / x.attempts || y.misses - x.misses || (x.label < y.label ? -1 : 1);
  const hardWords: HardItem[] = [...perWord]
    .filter(([, v]) => v.a >= MIN_WORD_ATTEMPTS && v.m / v.a >= MIN_MISS_SHARE && v.m >= 2)
    .map(([id, v]) => ({ key: `word:${id}`, kind: 'word' as const, label: byId.get(id)!.de, attempts: v.a, misses: v.m, wordIds: [id] }))
    .sort(order).slice(0, 5);
  const groups = [...perKind]
    .filter(([, v]) => v.a >= MIN_GROUP_ATTEMPTS && v.m / v.a >= MIN_MISS_SHARE)
    .map(([key, v]) => {
      const [kind, label] = key.split(':') as ['kind' | 'topic', string];
      return {
        key, kind: kind === 'topic' ? ('topic' as const) : (label as HardKind), label, attempts: v.a, misses: v.m,
        wordIds: [...v.words].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 6).map(([id]) => id),
      } satisfies HardItem;
    })
    .sort(order);

  return {
    empty: events.length === 0,
    today,
    week: { days, todayIndex: todayIdx, runs: sum((d) => d.runs), cards: sum((d) => d.cards), secured: sum((d) => d.secured) },
    words: { ...levels, total: active.length },
    hard: { words: hardWords, kinds: groups.filter((g) => g.kind !== 'topic').slice(0, 4), topics: groups.filter((g) => g.kind === 'topic').slice(0, 3) },
    goal: settings.goal.enabled ? { target: settings.goal.runsPerWeek, done: sum((d) => d.runs) } : null,
  };
}
