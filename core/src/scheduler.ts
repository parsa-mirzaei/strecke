/**
 * The scheduler (SPEC "Learning engine", DECISIONS D41): the stage ladder picks *which* exercise a
 * word is ready for; the FSRS-5 memory model picks *when* it is due.
 *
 * Everything here is a pure function of the append-only event log, each record's `start_stage` and
 * its columns (which decide the ladder's gate). `replay` folds events in (ts, id) order, so the same
 * log always gives the same state and the scheduler can be re-tuned by replaying it.
 */
import { capabilities, EXERCISE_TYPES, NEEDS_VOICE, STAGE_RANGE, type Exercise, type ExerciseType } from './exercises.ts';
import { initMemory, interval, retrievability, review, type Memory, type Rating } from './fsrs.ts';
import type { WordRecord } from './record.ts';

const DAY = 86_400_000;

export interface LearnEvent {
  id: string;
  /** Epoch milliseconds. */
  ts: number;
  wordId: string;
  /** `seen` = a Karte was revealed (not graded); `review` = a graded exercise. */
  kind: 'seen' | 'review';
  exercise: ExerciseType;
  correct: boolean;
  /** Card shown → answer, in ms. */
  ms: number;
  /** Help was used: "Text zeigen" in Hören, or a Tippen near miss. */
  help: boolean;
  /** "Weiß ich nicht". */
  dontKnow: boolean;
  /** The option the learner chose (logged for re-tuning; not used by the scheduler). */
  chosen?: string;
}

export interface WordState {
  stage: number;
  /** Has the learner met the word (Karte seen, or first review of a word that skips Karte)? */
  introduced: boolean;
  memory: Memory | null;
  lastReview: number | null;
  due: number | null;
  lapses: number;
  streak: number;
  reps: number;
  firstSeen: number | null;
  lastSeen: number | null;
  /** Type and result of the latest graded review. */
  lastType: ExerciseType | null;
}

export interface EngineConfig {
  newPerDay: number;
  backlogPause: number;
  retention: number;
}

export const DEFAULT_CONFIG: EngineConfig = { newPerDay: 5, backlogPause: 40, retention: 0.9 };

/** Above this, a right answer is rated "hard". Tuned later from the logged `ms`. */
export const SLOW_MS: Record<ExerciseType, number> = {
  karte: Infinity, artikel: 6_000, bedeutung: 8_000, luecke: 10_000, praeposition: 8_000, hoeren: 12_000,
  tippen: 20_000, kontext2: 10_000,
};

/** Rating inferred from behaviour; there are no self-grade buttons (D42). */
export function ratingFor(e: LearnEvent): Rating {
  if (!e.correct || e.dontKnow) return 1;
  if (e.help || e.ms > SLOW_MS[e.exercise]) return 2;
  return 3;
}

/**
 * The exercise types that promote a word from `stage` (its gate), from the record's own columns.
 * Hören is never a gate: whether it can be shown depends on the device's voice.
 */
export function gateTypes(stage: number, caps: ReadonlySet<ExerciseType>): ExerciseType[] {
  const firstOf = (...ts: ExerciseType[]) => ts.filter((t) => caps.has(t)).slice(0, 1);
  switch (stage) {
    case 0: return ['karte'];
    case 1: return firstOf('luecke', 'artikel', 'bedeutung');
    case 2: { const g = (['luecke', 'praeposition'] as const).filter((t) => caps.has(t)); return g.length ? [...g] : gateTypes(1, caps); }
    case 3: return caps.has('tippen') ? ['tippen'] : gateTypes(2, caps);
    case 4: return caps.has('kontext2') ? ['kontext2'] : gateTypes(3, caps);
    default: return [];
  }
}

/** Stage after a gate miss (SPEC ladder table). */
const GATE_MISS: Record<number, number> = { 0: 1, 1: 1, 2: 1, 3: 2, 4: 3, 5: 3 };

export function initialState(w: WordRecord): WordState {
  return {
    stage: w.startStage, introduced: false, memory: null, lastReview: null, due: null, lapses: 0, streak: 0, reps: 0,
    firstSeen: null, lastSeen: null, lastType: null,
  };
}

/** One event applied to one word's state. Pure. */
export function step(state: WordState, e: LearnEvent, caps: ReadonlySet<ExerciseType>, retention: number): WordState {
  const s: WordState = { ...state, lastSeen: e.ts, firstSeen: state.firstSeen ?? e.ts, introduced: true };
  if (e.kind === 'seen') {
    if (s.stage === 0) s.stage = 1;
    if (!s.memory) s.due = e.ts; // comes back soon: first in this visit (reinsertion), else next open
    return s;
  }
  const g = ratingFor(e);
  const stage = Math.max(1, s.stage); // a review of an unseen word counts at stage 1
  // At stage 5 every exercise is part of the rotation, so any miss there is a gate miss (→ 3).
  const isGate = stage === 5 || gateTypes(stage, caps).includes(e.exercise);
  if (g > 1) {
    s.stage = isGate && stage < 5 ? stage + 1 : stage;
    s.streak = state.streak + 1;
  } else {
    s.stage = isGate ? GATE_MISS[stage]! : Math.max(1, stage - 1);
    s.streak = 0;
    if (stage >= 2) s.lapses = state.lapses + 1;
  }
  s.memory = state.memory && state.lastReview !== null
    ? review(state.memory, (e.ts - state.lastReview) / DAY, g)
    : initMemory(g);
  s.lastReview = e.ts;
  s.due = e.ts + Math.round(interval(s.memory.stability, retention) * DAY);
  s.reps = state.reps + 1;
  s.lastType = e.exercise;
  return s;
}

export function sortEvents(events: readonly LearnEvent[]): LearnEvent[] {
  return [...events].sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Replay the whole log. Events for unknown words are ignored; duplicate event ids count once. */
export function replay(words: readonly WordRecord[], events: readonly LearnEvent[], retention = DEFAULT_CONFIG.retention): Map<string, WordState> {
  const states = new Map(words.map((w) => [w.id, initialState(w)]));
  const caps = new Map(words.map((w) => [w.id, capabilities(w)]));
  const seen = new Set<string>();
  for (const e of sortEvents(events)) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const st = states.get(e.wordId);
    if (!st) continue;
    states.set(e.wordId, step(st, e, caps.get(e.wordId)!, retention));
  }
  return states;
}

/** Predicted recall now; 0 for a word that was met but never graded. */
export function recallNow(st: WordState, now: number): number {
  if (!st.memory || st.lastReview === null) return 0;
  return retrievability((now - st.lastReview) / DAY, st.memory.stability);
}

// ---------------------------------------------------------------- one visit (session) and picking

export interface Session {
  /** Cards shown so far in this visit. */
  cardIndex: number;
  /** Shown cards, newest last. */
  recent: Array<{ wordId: string; type: ExerciseType }>;
  /** Same-visit reinsertions: a Karte's first recall, or a missed item. */
  reinsert: Array<{ wordId: string; at: number }>;
  /** Misses per word in this visit; two misses rest the word until the next open. */
  misses: Record<string, number>;
  missStreak: number;
  /** Card index of the last suggestion (pending word) shown. */
  lastSuggestionAt: number;
}

export function newSession(): Session {
  return { cardIndex: 0, recent: [], reinsert: [], misses: {}, missStreak: 0, lastSuggestionAt: -Infinity };
}

const offset = (id: string) => 3 + ([...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 3); // 3–5 cards

/** The session after a card was answered (or a Karte seen). Pure. */
export function afterCard(session: Session, e: LearnEvent, wasSuggestion = false): Session {
  const s: Session = {
    ...session,
    cardIndex: session.cardIndex + 1,
    recent: [...session.recent, { wordId: e.wordId, type: e.exercise }].slice(-12),
    reinsert: session.reinsert.filter((r) => r.wordId !== e.wordId),
    misses: { ...session.misses },
    lastSuggestionAt: wasSuggestion ? session.cardIndex : session.lastSuggestionAt,
  };
  const at = s.cardIndex + offset(e.id);
  if (e.kind === 'seen') {
    if (!wasSuggestion) s.reinsert.push({ wordId: e.wordId, at });
    return s;
  }
  if (ratingFor(e) === 1) {
    s.missStreak = session.missStreak + 1;
    s.misses[e.wordId] = (s.misses[e.wordId] ?? 0) + 1;
    if (s.misses[e.wordId]! < 2) s.reinsert.push({ wordId: e.wordId, at });
  } else {
    s.missStreak = 0;
  }
  return s;
}

export interface PickInput {
  now: number;
  /** Start of the learner's local day, for `new_per_day`. */
  dayStart: number;
  /** Playable words: active, plus pending suggestions (shown only as a Karte). */
  words: readonly WordRecord[];
  states: ReadonlyMap<string, WordState>;
  exercises: ReadonlyMap<string, readonly Exercise[]>;
  session: Session;
  config: EngineConfig;
  canListen: boolean;
}

export type PickReason = 'reinsert' | 'easy' | 'due' | 'new' | 'practice';
export interface Pick { word: WordRecord; exercise: Exercise; reason: PickReason }

/** Preference order at stage 5, rotated by the word's review count. */
const STAGE5 = ['tippen', 'hoeren', 'kontext2', 'praeposition', 'bedeutung', 'artikel'] as const;

/**
 * The exercise for a word now: the gate, except every third review a variety exercise; never a type
 * that would appear three times in a row; Hören only with a German voice.
 */
export function chooseExercise(
  w: WordRecord, st: WordState, exs: readonly Exercise[], session: Session, canListen: boolean, ignoreTypeRule = false,
): Exercise | null {
  const lastTwo = session.recent.slice(-2).map((r) => r.type);
  const blockedType = !ignoreTypeRule && lastTwo.length === 2 && lastTwo[0] === lastTwo[1] ? lastTwo[0] : null;
  const eligible = exs.filter((x) => {
    const [lo, hi] = STAGE_RANGE[x.type];
    return st.stage >= lo && st.stage <= hi && (canListen || !NEEDS_VOICE.has(x.type)) && x.type !== blockedType;
  });
  if (!eligible.length) return null;
  const byType = (t: ExerciseType) => eligible.find((x) => x.type === t);
  if (st.stage === 0) return byType('karte') ?? null;
  if (st.stage >= 5) {
    for (let i = 0; i < STAGE5.length; i++) {
      const x = byType(STAGE5[(st.reps + i) % STAGE5.length]!);
      if (x) return x;
    }
    return eligible[0]!;
  }
  const gate = gateTypes(st.stage, capabilities(w));
  const gates = eligible.filter((x) => gate.includes(x.type));
  const others = eligible.filter((x) => !gate.includes(x.type) && x.type !== 'karte');
  if (others.length && st.reps % 3 === 2) return others[st.reps % others.length]!;
  return gates[0] ?? others[0] ?? null;
}

function tierForNew(words: readonly WordRecord[], states: ReadonlyMap<string, WordState>, dayStart: number): 'core' | 'chunk' {
  let total = 0, chunks = 0;
  for (const w of words) {
    const st = states.get(w.id);
    if (st?.firstSeen !== null && st?.firstSeen !== undefined && st.firstSeen >= dayStart) {
      total++;
      if (w.tier === 'chunk') chunks++;
    }
  }
  // Target mix ≈ 2/3 core, 1/3 chunk among today's new words: core, core, chunk, core, core, chunk, …
  return (chunks + 1) * 3 <= total + 1 ? 'chunk' : 'core';
}

/** The next card, or null when nothing at all can be shown. Pure. */
export function pickNext(input: PickInput): Pick | null {
  const { now, words, states, exercises, session, config, canListen, dayStart } = input;
  const recentIds = new Set(session.recent.slice(-3).map((r) => r.wordId));
  const resting = (id: string) => (session.misses[id] ?? 0) >= 2;
  const byId = new Map(words.map((w) => [w.id, w]));
  const st = (w: WordRecord) => states.get(w.id) ?? initialState(w);
  const active = (w: WordRecord) => w.status === 'active';

  const tryWords = (list: readonly WordRecord[], reason: PickReason, blocked: (id: string) => boolean, ignoreTypeRule = false): Pick | null => {
    for (const w of list) {
      if (blocked(w.id)) continue;
      const exercise = chooseExercise(w, st(w), exercises.get(w.id) ?? [], session, canListen, ignoreTypeRule);
      if (exercise) return { word: w, exercise, reason };
    }
    return null;
  };
  const blocked = (id: string) => recentIds.has(id) || resting(id);
  const introduced = words.filter((w) => active(w) && st(w).introduced);
  const byRecall = (list: WordRecord[]) =>
    [...list].sort((a, b) => recallNow(st(a), now) - recallNow(st(b), now) || (st(a).due ?? 0) - (st(b).due ?? 0) || (a.id < b.id ? -1 : 1));

  // 1. An easy win after two misses in a row.
  if (session.missStreak >= 2) {
    const easy = tryWords(byRecall(introduced.filter((w) => st(w).stage >= 4)).reverse(), 'easy', blocked);
    if (easy) return easy;
  }
  // 2. A same-visit reinsertion whose turn has come.
  const turns = session.reinsert.filter((r) => r.at <= session.cardIndex).sort((a, b) => a.at - b.at);
  const re = tryWords(turns.map((r) => byId.get(r.wordId)).filter((w): w is WordRecord => !!w && active(w)), 'reinsert', blocked);
  if (re) return re;
  // 3. Due words, lowest predicted recall first.
  const due = introduced.filter((w) => st(w).due !== null && st(w).due! <= now);
  const d = tryWords(byRecall(due), 'due', blocked);
  if (d) return d;
  // 4. A new word, within today's pacing; a silent pause while the backlog is large.
  const newToday = words.filter((w) => { const f = st(w).firstSeen; return f !== null && f >= dayStart; }).length;
  const fresh = words.filter((w) => !st(w).introduced && (active(w) || session.cardIndex - session.lastSuggestionAt >= 5));
  const tier = tierForNew(words, states, dayStart);
  const freshOrdered = [...fresh.filter((w) => w.tier === tier), ...fresh.filter((w) => w.tier !== tier)];
  if (newToday < config.newPerDay && due.length < config.backlogPause) {
    const n = tryWords(freshOrdered, 'new', blocked);
    if (n) return n;
  }
  // 5. Nothing due: practise the lowest predicted recall.
  const p = tryWords(byRecall(introduced), 'practice', blocked);
  if (p) return p;
  // 6–9. Practice never runs out. When the rules cannot all hold, relax them in this order, least harmful
  //   first: a new word beyond today's pace (never during a backlog pause); a third Karte in a row; a word
  //   from the last three cards (never the very last one); finally a resting word.
  const last = session.recent.at(-1)?.wordId;
  const paused = due.length >= config.backlogPause;
  return (paused ? null : tryWords(freshOrdered, 'new', blocked) ?? tryWords(freshOrdered, 'new', blocked, true))
    ?? tryWords(byRecall(introduced), 'practice', (id) => id === last || resting(id))
    ?? tryWords(byRecall(introduced), 'practice', (id) => id === last)
    ?? (paused ? tryWords(freshOrdered, 'new', (id) => id === last, true) : null);
}

// ---------------------------------------------------------------- Core rows ⇄ events and state

const LEGACY_CARD: Record<string, ExerciseType> = { meet: 'karte', choice: 'bedeutung', listen: 'hoeren', recall: 'luecke' };

/** A Core `events` row → a learning event, or null if it is not a learning event or is malformed. */
export function eventFromRow(r: Readonly<Record<string, string | undefined>>): LearnEvent | null {
  if (r.type !== 'seen' && r.type !== 'review') return null;
  const exercise = (EXERCISE_TYPES as readonly string[]).includes(r.card_type ?? '')
    ? (r.card_type as ExerciseType) : LEGACY_CARD[r.card_type ?? ''];
  const ts = Date.parse(r.ts ?? '');
  if (!exercise || !r.event_id || !r.word_id || Number.isNaN(ts)) return null;
  let payload: Record<string, unknown> = {};
  try { payload = r.payload ? JSON.parse(r.payload) : {}; } catch { /* malformed payload: defaults */ }
  return {
    id: r.event_id, ts, wordId: r.word_id, kind: r.type === 'seen' || exercise === 'karte' ? 'seen' : 'review', exercise,
    correct: r.result === '1', ms: Number(r.ms) || 0,
    help: payload.text_shown === true || payload.near_miss === true, dontKnow: payload.dont_know === true,
    ...(typeof payload.chosen === 'string' ? { chosen: payload.chosen } : {}),
  };
}

/** A learning event → a Core `events` row (append-only, idempotent by event_id). */
export function eventToRow(e: LearnEvent, device = ''): Record<string, string> {
  const payload: Record<string, unknown> = {};
  if (e.chosen !== undefined) payload.chosen = e.chosen;
  if (e.help) payload[e.exercise === 'tippen' ? 'near_miss' : 'text_shown'] = true;
  if (e.dontKnow) payload.dont_know = true;
  return {
    event_id: e.id, ts: new Date(e.ts).toISOString(), type: e.kind, word_id: e.wordId,
    prompt_id: '', card_type: e.exercise, result: e.kind === 'seen' ? '' : e.correct ? '1' : '0', ms: String(Math.round(e.ms)),
    payload: Object.keys(payload).length ? JSON.stringify(payload) : '', device,
  };
}

/** Word state → the derivable `word_state` cache row. */
export function stateToRow(wordId: string, s: WordState): Record<string, string> {
  const iso = (t: number | null) => (t === null ? '' : new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z'));
  return {
    word_id: wordId, stage: String(s.stage), due_at: iso(s.due), lapses: String(s.lapses), streak: String(s.streak),
    last_seen: iso(s.lastSeen), stability: s.memory ? s.memory.stability.toFixed(4) : '',
    difficulty: s.memory ? s.memory.difficulty.toFixed(4) : '', reps: String(s.reps),
  };
}
