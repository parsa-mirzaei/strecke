import { useCallback, useMemo, useRef, useState } from 'preact/hooks';
import type { DataAdapter, Snapshot } from '../data/adapter';
import type { Capture, Grade, Item, ItemState, ReviewEvent } from '../data/types';
import { applyGrade, CHECKPOINT_EVERY, pickNext, type Card, type FeedContext } from '../engine/scheduler';
import { newToday } from '../engine/progress';

export type FeedCard = Card | { type: 'checkpoint'; itemId: '' };

export interface Notice {
  kind: 'sayable' | 'dismissed' | 'saved';
  text: string;
  undo?: () => void;
}

let seq = 0;
const eventId = () => `e_${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * Feed state for one visit: current card, answers, same-visit reinsertions, checkpoint, notices.
 * `answer()` returns the next card synchronously so the caller can start audio inside the same tap.
 */
export function useFeed(adapter: DataAdapter, snap: Snapshot, canListen: boolean) {
  const items = snap.items;
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const [states, setStates] = useState<Record<string, ItemState>>(snap.states);
  const [events, setEvents] = useState<ReviewEvent[]>(snap.events);
  const [captures, setCaptures] = useState<Capture[]>(snap.captures);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [resting, setResting] = useState(false);

  const statesRef = useRef(states);
  statesRef.current = states;
  const eventsRef = useRef(events);
  eventsRef.current = events;

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

  const nextCard = useCallback(
    (s: Record<string, ItemState>): FeedCard | null => {
      const c = ctx.current;
      // A checkpoint after every CHECKPOINT_EVERY answers; '' in `recent` marks one already shown.
      if (c.cardIndex > 0 && c.cardIndex % CHECKPOINT_EVERY === 0 && c.recent.at(-1) !== '') {
        return { type: 'checkpoint', itemId: '' };
      }
      c.now = Date.now();
      return pickNext(items, s, c);
    },
    [items],
  );

  const [card, setCard] = useState<FeedCard | null>(() => nextCard(snap.states));
  const shownAt = useRef(performance.now());
  const visitMisses = useRef<Record<string, number>>({});

  const record = (e: Omit<ReviewEvent, 'id' | 'ts' | 'ms'>) => {
    const ev: ReviewEvent = { ...e, id: eventId(), ts: Date.now(), ms: Math.round(performance.now() - shownAt.current) };
    adapter.appendEvent(ev);
    const next = [...eventsRef.current, ev];
    eventsRef.current = next;
    setEvents(next);
  };

  const advance = (s: Record<string, ItemState>): FeedCard | null => {
    const next = nextCard(s);
    shownAt.current = performance.now();
    setCard(next);
    return next;
  };

  /** Grade the current item card and move on. Returns the next card. */
  const answer = (grade: Grade): FeedCard | null => {
    if (!card || card.type === 'checkpoint') return card;
    const c = ctx.current;
    const prev = statesRef.current[card.itemId]!;
    const res = applyGrade(prev, card, grade, Date.now());
    const s = { ...statesRef.current, [card.itemId]: res.state };
    statesRef.current = s;
    setStates(s);
    adapter.saveStates(s);
    record({ itemId: card.itemId, card: card.type, grade });

    c.cardIndex += 1;
    c.recent.push(card.itemId);
    c.recentTypes.push(card.type);
    c.reinsert = c.reinsert.filter((r) => r.itemId !== card.itemId);
    if (grade === 'miss') visitMisses.current[card.itemId] = (visitMisses.current[card.itemId] ?? 0) + 1;
    // Two misses in one visit: let it rest until next time instead of drilling it.
    if (res.reinsertIn && (visitMisses.current[card.itemId] ?? 0) < 2) {
      c.reinsert.push({ itemId: card.itemId, at: c.cardIndex + res.reinsertIn });
    }
    if (card.type === 'meet') c.newToday += 1;
    c.missStreak = grade === 'miss' ? c.missStreak + 1 : 0;

    const item = byId.get(card.itemId)!;
    setNotice(res.becameSayable ? { kind: 'sayable', text: item.de } : null);
    if (res.becameSayable && 'vibrate' in navigator) navigator.vibrate?.(12);
    return advance(s);
  };

  /** "Nicht für mich" on a suggestion: hide it, offer undo. */
  const dismiss = (): FeedCard | null => {
    if (!card || card.type === 'checkpoint') return card;
    const id = card.itemId;
    const prev = statesRef.current[id]!;
    const s = { ...statesRef.current, [id]: { ...prev, status: 'dismissed' as const } };
    statesRef.current = s;
    setStates(s);
    adapter.saveStates(s);
    record({ itemId: id, card: card.type, grade: 'dismiss' });
    ctx.current.recent.push(id);
    const restoreCard = card;
    setNotice({
      kind: 'dismissed',
      text: 'Vorschlag entfernt',
      undo: () => {
        const back = { ...statesRef.current, [id]: prev };
        statesRef.current = back;
        setStates(back);
        adapter.saveStates(back);
        setNotice(null);
        shownAt.current = performance.now();
        setCard(restoreCard);
      },
    });
    return advance(s);
  };

  /** Checkpoint: "Weiter" continues, "Fertig" shows the calm resting state. */
  const leaveCheckpoint = (rest: boolean): FeedCard | null => {
    ctx.current.recent.push('');
    record({ itemId: '', card: 'checkpoint', grade: rest ? 'known' : 'good' });
    if (rest) {
      setResting(true);
      return card;
    }
    return advance(statesRef.current);
  };

  const resume = (): FeedCard | null => {
    setResting(false);
    return advance(statesRef.current);
  };

  const addCapture = (text: string, domain: Capture['domain']) => {
    const cap: Capture = { id: `c_${Date.now().toString(36)}`, ts: Date.now(), text, domain };
    adapter.addCapture(cap);
    setCaptures((cs) => [cap, ...cs]);
    setNotice({ kind: 'saved', text });
  };

  const item: Item | null = card && card.type !== 'checkpoint' ? byId.get(card.itemId) ?? null : null;
  const cardsThisVisit = () => ctx.current.cardIndex;

  return {
    items, states, events, captures, card, item, notice, resting,
    answer, dismiss, leaveCheckpoint, resume, addCapture,
    clearNotice: () => setNotice(null),
    cardsThisVisit,
  };
}

export type Feed = ReturnType<typeof useFeed>;
