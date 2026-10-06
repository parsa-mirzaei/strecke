import { useMemo, useRef, useState } from 'preact/hooks';
import type { DataAdapter, Snapshot } from '../data/adapter';
import type { Capture, Grade, Item, ItemState, Outcome, ReviewEvent } from '../data/types';
import { applyGrade, pickNext, type Card, type FeedContext } from '../engine/scheduler';
import { lastAnswered, newToday } from '../engine/progress';

/** One encounter in the Heft. */
export interface Entry {
  key: number;
  card: Card;
  item: Item;
  /**
   * Grade applied when the learner moves on, unless they change it first:
   * a new word is 'new' (or 'known'), a revealed gap is 'good' (or 'miss' after "nochmal").
   */
  pending?: Grade;
  /** Set once the entry is settled. */
  outcome?: Outcome;
  /** This answer made the item sayable for the first time. */
  sayable?: boolean;
  /** Suggestion dismissed: the state to restore on undo. */
  undo?: ItemState;
}

export interface Notice {
  text: string;
}

let seq = 0;
const eventId = () => `e_${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * Feed state for one visit. `entries` holds every encounter shown in this visit; `active` is the one
 * being answered, and the entry after it (if any) is the peek. Moving on settles the active entry:
 * its pending grade is applied, or, if it was never answered, it counts as skipped (no grade).
 */
export function useFeed(adapter: DataAdapter, snap: Snapshot, canListen: boolean) {
  const items = snap.items;
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const trail = useMemo(() => lastAnswered(snap.events, items, 3), []);

  const [states, setStates] = useState<Record<string, ItemState>>(snap.states);
  const statesRef = useRef(states);
  const [captures, setCaptures] = useState<Capture[]>(snap.captures);
  const [notice, setNotice] = useState<Notice | null>(null);
  const events = useRef<ReviewEvent[]>(snap.events);

  const ctx = useRef<FeedContext>({
    now: Date.now(),
    cardIndex: 0,
    recent: [],
    recentTypes: [],
    reinsert: [],
    newToday: newToday(snap.events, Date.now()),
    missStreak: 0,
    canListen,
  });
  ctx.current.canListen = canListen;

  const keySeq = useRef(0);
  const visitMisses = useRef<Record<string, number>>({});
  const shownAt = useRef(performance.now());

  /** Pick the next card and register it as shown, so it is not picked again right away. */
  const draw = (s: Record<string, ItemState>): Entry | null => {
    const c = ctx.current;
    c.now = Date.now();
    const card = pickNext(items, s, c);
    if (!card) return null;
    c.cardIndex += 1;
    c.recent.push(card.itemId);
    c.recentTypes.push(card.type);
    c.reinsert = c.reinsert.filter((r) => r.itemId !== card.itemId);
    return { key: ++keySeq.current, card, item: byId.get(card.itemId)!, pending: card.type === 'meet' ? 'new' : undefined };
  };

  const [entries, setEntriesState] = useState<Entry[]>(() => {
    const first = draw(snap.states);
    const second = first ? draw(snap.states) : null;
    return [first, second].filter((e): e is Entry => !!e);
  });
  const entriesRef = useRef(entries);
  const setEntries = (next: Entry[]) => {
    entriesRef.current = next;
    setEntriesState(next);
  };
  const [active, setActiveState] = useState(0);
  const activeRef = useRef(0);

  const saveStates = (s: Record<string, ItemState>) => {
    statesRef.current = s;
    setStates(s);
    adapter.saveStates(s);
  };

  const record = (entry: Entry, grade: Outcome) => {
    const ev: ReviewEvent = {
      id: eventId(), ts: Date.now(), itemId: entry.item.id, card: entry.card.type, grade,
      ms: Math.round(performance.now() - shownAt.current),
    };
    adapter.appendEvent(ev);
    events.current = [...events.current, ev];
  };

  const patch = (key: number, change: Partial<Entry>) => {
    setEntries(entriesRef.current.map((e) => (e.key === key ? { ...e, ...change } : e)));
  };

  /** Apply a grade to the item now. Returns the settled entry. */
  const grade = (entry: Entry, g: Grade): Entry => {
    const c = ctx.current;
    const prev = statesRef.current[entry.item.id]!;
    const res = applyGrade(prev, entry.card, g, Date.now());
    saveStates({ ...statesRef.current, [entry.item.id]: res.state });
    record(entry, g);
    const id = entry.item.id;
    if (g === 'miss') visitMisses.current[id] = (visitMisses.current[id] ?? 0) + 1;
    // Two misses in one visit: let it rest until next time instead of drilling it.
    if (res.reinsertIn && (visitMisses.current[id] ?? 0) < 2) c.reinsert.push({ itemId: id, at: c.cardIndex + res.reinsertIn - 1 });
    if (entry.card.type === 'meet') c.newToday += 1;
    c.missStreak = g === 'miss' ? c.missStreak + 1 : 0;
    if (res.becameSayable && 'vibrate' in navigator) navigator.vibrate?.(12);
    return { ...entry, pending: undefined, outcome: g, sayable: res.becameSayable };
  };

  /** Settle an entry: apply its pending grade, or log it as skipped. Idempotent. */
  const settle = (entry: Entry): Entry => {
    if (entry.outcome) return entry;
    if (entry.pending) return grade(entry, entry.pending);
    record(entry, 'skip');
    return { ...entry, outcome: 'skip' };
  };

  /** Choice and listen: the pick is the answer, graded at once. */
  const answer = (key: number, g: Grade) => {
    const entry = entriesRef.current.find((e) => e.key === key);
    if (!entry || entry.outcome) return;
    const settled = grade(entry, g);
    setEntries(entriesRef.current.map((e) => (e.key === key ? settled : e)));
  };

  /** Meet ("Kenne ich schon") and recall (reveal → 'good', "nochmal" → 'miss'): applied on moving on. */
  const setPending = (key: number, g: Grade) => {
    const entry = entriesRef.current.find((e) => e.key === key);
    if (!entry || entry.outcome) return;
    // Show "sayable" the moment it is earned, not only after moving on.
    const preview = applyGrade(statesRef.current[entry.item.id]!, entry.card, g, Date.now());
    patch(key, { pending: g, sayable: preview.becameSayable });
  };

  /** The peek becomes the active entry; the old one settles and a new peek is drawn. */
  const advance = () => {
    const list = entriesRef.current;
    const i = activeRef.current;
    if (i + 1 >= list.length) return;
    const settled = settle(list[i]!);
    const next = draw(statesRef.current);
    const updated = list.map((e, k) => (k === i ? settled : e));
    setEntries(next ? [...updated, next] : updated);
    activeRef.current = i + 1;
    setActiveState(i + 1);
    shownAt.current = performance.now();
  };

  /** Leaving the app settles what is pending, so nothing is lost if the tab is discarded. */
  const settleActive = () => {
    const list = entriesRef.current;
    const entry = list[activeRef.current];
    if (!entry || entry.outcome || !entry.pending) return;
    const settled = settle(entry);
    setEntries(list.map((e) => (e.key === entry.key ? settled : e)));
  };

  /** "Nicht für mich" on a suggestion. */
  const dismiss = (key: number) => {
    const entry = entriesRef.current.find((e) => e.key === key);
    if (!entry || entry.outcome) return;
    const prev = statesRef.current[entry.item.id]!;
    saveStates({ ...statesRef.current, [entry.item.id]: { ...prev, status: 'dismissed' } });
    record(entry, 'dismiss');
    patch(key, { outcome: 'dismiss', pending: undefined, undo: prev });
  };

  const undoDismiss = (key: number) => {
    const entry = entriesRef.current.find((e) => e.key === key);
    if (!entry?.undo) return;
    saveStates({ ...statesRef.current, [entry.item.id]: entry.undo });
    patch(key, { outcome: undefined, pending: 'new', undo: undefined });
  };

  const addCapture = (text: string, domain: Capture['domain']) => {
    const cap: Capture = { id: `c_${Date.now().toString(36)}`, ts: Date.now(), text, domain };
    adapter.addCapture(cap);
    setCaptures((cs) => [cap, ...cs]);
    setNotice({ text: `Festgehalten: ${text}` });
  };

  return {
    items, states, captures, trail, entries, active, notice,
    answer, setPending, advance, settleActive, dismiss, undoDismiss, addCapture,
    clearNotice: () => setNotice(null),
    cardsThisVisit: () => activeRef.current,
  };
}

export type Feed = ReturnType<typeof useFeed>;
