import type { CardType, Grade, Item, ItemState } from '../data/types';

/**
 * Prototype scheduler: a small, pure version of the spec's ladder.
 *   0 Meet → 1 Recognise (choice or listen) → 2 Recall with hint → 3 Recall without hint
 *   → 4+ Recall, with every third review a Listen.
 * No FSRS, no statistics. Good enough to make the feed feel alive during a real-life test.
 */

export const NEW_PER_DAY = 6;
export const NEW_EVERY = 4;
export const SAYABLE_STAGE = 3;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const MAX_INTERVAL = 120 * DAY;

export interface Card {
  itemId: string;
  type: CardType;
  /** Recall only: which cloze, and whether the English hint shows. */
  cloze: 1 | 2;
  hint: boolean;
  /** Choice only: pick the English meaning, or the article of a noun. */
  variant?: 'meaning' | 'article';
}

export interface FeedContext {
  now: number;
  /** Cards answered in this visit. */
  cardIndex: number;
  /** Item ids of the last cards, newest last. */
  recent: string[];
  recentTypes: CardType[];
  /** Same-visit reinsertions after a miss or a first meeting. */
  reinsert: { itemId: string; at: number }[];
  newToday: number;
  missStreak: number;
  /** False when the device has no German voice: Listen cards become silent choices. */
  canListen: boolean;
}

export function isPlayable(state: ItemState | undefined): state is ItemState {
  return !!state && (state.status === 'active' || state.status === 'pending');
}

export function cardFor(item: Item, state: ItemState, canListen: boolean): Card {
  const hasSecond = !!item.cloze2;
  const recall = (cloze: 1 | 2, hint: boolean): Card => ({ itemId: item.id, type: 'recall', cloze, hint });
  const listen: Card = { itemId: item.id, type: 'listen', cloze: 1, hint: false };
  const choice: Card = {
    itemId: item.id, type: 'choice', cloze: 1, hint: false,
    variant: item.pos === 'noun' && item.article ? 'article' : 'meaning',
  };
  switch (state.stage) {
    case 0:
      return { itemId: item.id, type: 'meet', cloze: 1, hint: false };
    case 1:
      // Silent first: the first recognition right after meeting is a choice; listening alternates in.
      return canListen && state.reps % 2 === 0 ? listen : choice;
    case 2:
      return recall(1, true);
    case 3:
      return recall(hasSecond ? 2 : 1, false);
    default:
      // Mostly silent: one in three reviews at this level is a listening one.
      return state.reps % 3 === 0 && canListen ? listen : recall(hasSecond ? 2 : 1, false);
  }
}

function intervalFor(stage: number): number {
  if (stage <= 2) return 10 * MIN;
  if (stage === 3) return DAY;
  if (stage === 4) return 3 * DAY;
  if (stage === 5) return 7 * DAY;
  return Math.min(7 * DAY * 2.5 ** (stage - 5), MAX_INTERVAL);
}

export interface GradeResult {
  state: ItemState;
  /** Show this item again in this visit after N more cards. */
  reinsertIn?: number;
  /** True when this answer made the item sayable for the first time. */
  becameSayable: boolean;
}

export function applyGrade(prev: ItemState, card: Card, grade: Grade, now: number): GradeResult {
  const s: ItemState = { ...prev, reps: prev.reps + 1 };
  if (s.status === 'pending') s.status = 'active';

  if (card.type === 'meet') {
    if (grade === 'known') return { state: { ...s, stage: 2, dueAt: now }, reinsertIn: 3, becameSayable: false };
    return { state: { ...s, stage: 1, dueAt: now }, reinsertIn: 2, becameSayable: false };
  }

  if (grade === 'miss') {
    const stage = s.stage <= 2 ? 1 : 2;
    return { state: { ...s, stage, lapses: s.lapses + 1, dueAt: now }, reinsertIn: 4, becameSayable: false };
  }

  // Practising ahead of time: keep the stage, nudge the due date a little.
  if (prev.dueAt > now) {
    const ahead = prev.dueAt - now;
    return { state: { ...s, dueAt: now + Math.max(HOUR, ahead * 1.2) }, becameSayable: false };
  }

  const stage = s.stage + 1;
  return {
    state: { ...s, stage, dueAt: now + intervalFor(stage) },
    becameSayable: prev.stage < SAYABLE_STAGE && stage >= SAYABLE_STAGE,
  };
}

/** The next card. Never returns null while at least one playable item exists. */
export function pickNext(items: Item[], states: Record<string, ItemState>, ctx: FeedContext): Card | null {
  const byId = new Map(items.map((i) => [i.id, i]));
  const playable = items.filter((i) => isPlayable(states[i.id]));
  if (playable.length === 0) return null;

  const recentIds = new Set(ctx.recent.slice(-3));
  const queued = new Set(ctx.reinsert.map((r) => r.itemId));
  const lastTwo = ctx.recentTypes.slice(-2);
  const tooSameType = (t: CardType) => lastTwo.length === 2 && lastTwo.every((x) => x === t);
  const toCard = (item: Item) => cardFor(item, states[item.id]!, ctx.canListen);

  const choose = (pool: Item[]): Card | null => {
    const fresh = pool.filter((i) => !recentIds.has(i.id));
    const varied = fresh.filter((i) => !tooSameType(toCard(i).type));
    const pick = varied[0] ?? fresh[0];
    return pick ? toCard(pick) : null;
  };

  // 1. A same-visit reinsertion whose turn has come.
  //    It yields one turn if it would make three cards of the same type in a row.
  const turn = ctx.reinsert.find((r) => r.at <= ctx.cardIndex && byId.has(r.itemId) && isPlayable(states[r.itemId]));
  if (turn && !ctx.recent.slice(-1).includes(turn.itemId)) {
    const c = toCard(byId.get(turn.itemId)!);
    if (!tooSameType(c.type) || turn.at <= ctx.cardIndex - 2) return c;
  }

  const learned = playable.filter((i) => states[i.id]!.stage > 0 && !queued.has(i.id));
  const fresh = playable.filter((i) => states[i.id]!.stage === 0 && !queued.has(i.id));
  // Suggestions first among new items, so the learner meets them early.
  fresh.sort((a, b) => Number(b.origin === 'suggestion') - Number(a.origin === 'suggestion'));
  const due = learned
    .filter((i) => states[i.id]!.dueAt <= ctx.now)
    .sort((a, b) => states[a.id]!.dueAt - states[b.id]!.dueAt);

  // 2. After two misses in a row: an easy win.
  if (ctx.missStreak >= 2) {
    const easy = choose(learned.filter((i) => states[i.id]!.stage >= SAYABLE_STAGE));
    if (easy) return easy;
  }

  const newAllowed = ctx.newToday < NEW_PER_DAY && fresh.length > 0;
  // 3. Every NEW_EVERY-th card may introduce something new.
  if (newAllowed && ctx.cardIndex % NEW_EVERY === NEW_EVERY - 1) {
    const n = choose(fresh);
    if (n) return n;
  }
  // 4. Due items, most overdue first.
  const d = choose(due);
  if (d) return d;
  // 5. Nothing due: new if allowed, otherwise practise whatever comes next. The feed never runs dry.
  if (newAllowed) {
    const n = choose(fresh);
    if (n) return n;
  }
  const soonest = [...learned].sort((a, b) => states[a.id]!.dueAt - states[b.id]!.dueAt);
  return choose(soonest) ?? choose(playable) ?? toCard(playable[0]!);
}
