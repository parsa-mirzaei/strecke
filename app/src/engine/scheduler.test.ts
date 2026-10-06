import { describe, expect, it } from 'vitest';
import { MOCK_ITEMS } from '../data/mock-items';
import { seedStates } from '../data/adapter';
import type { ItemState } from '../data/types';
import { applyGrade, cardFor, pickNext, SAYABLE_STAGE, type Card, type FeedContext } from './scheduler';

const NOW = Date.UTC(2026, 9, 5, 8, 0, 0);
const item = MOCK_ITEMS.find((i) => i.id === 'm07')!;
const st = (stage: number, extra: Partial<ItemState> = {}): ItemState => ({ stage, dueAt: NOW - 1, lapses: 0, reps: 0, status: 'active', ...extra });
const ctx = (over: Partial<FeedContext> = {}): FeedContext => ({
  now: NOW, cardIndex: 1, recent: [], recentTypes: [], reinsert: [], newToday: 0, missStreak: 0, canListen: true, ...over,
});

describe('card type per ladder stage', () => {
  it('0 meet, 1 listen, 2 recall with hint, 3 recall without hint on the second cloze', () => {
    expect(cardFor(item, st(0), true).type).toBe('meet');
    expect(cardFor(item, st(1), true).type).toBe('listen');
    expect(cardFor(item, st(2), true)).toMatchObject({ type: 'recall', cloze: 1, hint: true });
    expect(cardFor(item, st(3), true)).toMatchObject({ type: 'recall', cloze: 2, hint: false });
  });
  it('4+ rotates listen and recall', () => {
    expect(cardFor(item, st(4, { reps: 2 }), true).type).toBe('listen');
    expect(cardFor(item, st(4, { reps: 3 }), true).type).toBe('recall');
  });
  it('without a German voice, listen becomes recall', () => {
    expect(cardFor(item, st(1), false)).toMatchObject({ type: 'recall', hint: true });
  });
});

describe('grading', () => {
  const card = (type: Card['type']): Card => ({ itemId: item.id, type, cloze: 1, hint: true });
  it('meet: new → stage 1 back in 2 cards; known → stage 2 back in 3', () => {
    expect(applyGrade(st(0), card('meet'), 'new', NOW)).toMatchObject({ state: { stage: 1 }, reinsertIn: 2 });
    expect(applyGrade(st(0), card('meet'), 'known', NOW)).toMatchObject({ state: { stage: 2 }, reinsertIn: 3 });
  });
  it('success climbs one stage; reaching stage 3 makes the item sayable', () => {
    const r = applyGrade(st(2), card('recall'), 'good', NOW);
    expect(r.state.stage).toBe(SAYABLE_STAGE);
    expect(r.becameSayable).toBe(true);
    expect(r.state.dueAt).toBeGreaterThan(NOW);
  });
  it('miss drops to 1 (from ≤2) or 2 (from ≥3), counts a lapse, comes back this visit', () => {
    expect(applyGrade(st(2), card('recall'), 'miss', NOW)).toMatchObject({ state: { stage: 1, lapses: 1 }, reinsertIn: 4 });
    expect(applyGrade(st(5), card('recall'), 'miss', NOW)).toMatchObject({ state: { stage: 2, lapses: 1 } });
  });
  it('practising ahead keeps the stage', () => {
    const r = applyGrade(st(3, { dueAt: NOW + 86_400_000 }), card('recall'), 'good', NOW);
    expect(r.state.stage).toBe(3);
    expect(r.becameSayable).toBe(false);
  });
  it('accepting a suggestion activates it', () => {
    expect(applyGrade(st(0, { status: 'pending' }), card('meet'), 'new', NOW).state.status).toBe('active');
  });
});

describe('picking the next card', () => {
  const states = seedStates(MOCK_ITEMS, NOW);

  it('a fresh install opens on a recall card, not a dashboard or a meet', () => {
    const c = pickNext(MOCK_ITEMS, states, ctx({ cardIndex: 0 }))!;
    expect(c.itemId).toBe('m07');
    expect(c.type).toBe('recall');
  });
  it('never repeats an item from the last three cards', () => {
    const c = pickNext(MOCK_ITEMS, states, ctx({ recent: ['m07', 'm02', 'm10'] }))!;
    expect(['m07', 'm02', 'm10']).not.toContain(c.itemId);
  });
  it('a reinsertion whose turn has come goes first', () => {
    const c = pickNext(MOCK_ITEMS, states, ctx({ cardIndex: 5, reinsert: [{ itemId: 'm31', at: 5 }], recent: ['m02'] }))!;
    expect(c.itemId).toBe('m31');
  });
  it('every fourth card can be new, and suggestions come first among new items', () => {
    const c = pickNext(MOCK_ITEMS, states, ctx({ cardIndex: 3 }))!;
    expect(c.type).toBe('meet');
    expect(MOCK_ITEMS.find((i) => i.id === c.itemId)!.origin).toBe('suggestion');
  });
  it('after two misses in a row, an easy win (a sayable item)', () => {
    const c = pickNext(MOCK_ITEMS, states, ctx({ missStreak: 2 }))!;
    expect(states[c.itemId]!.stage).toBeGreaterThanOrEqual(SAYABLE_STAGE);
  });
  it('no three cards of the same type in a row when there is an alternative', () => {
    const c = pickNext(MOCK_ITEMS, states, ctx({ recentTypes: ['recall', 'recall'] }))!;
    expect(c.type).not.toBe('recall');
  });
  it('the feed never runs dry: nothing due and no new allowed still yields a card', () => {
    const later = Object.fromEntries(
      Object.entries(states).map(([id, s]) => [id, { ...s, stage: Math.max(1, s.stage), dueAt: NOW + 86_400_000 }]),
    );
    expect(pickNext(MOCK_ITEMS, later, ctx({ newToday: 99 }))).not.toBeNull();
  });
  it('dismissed suggestions never come back', () => {
    const s = { ...states, s01: { ...states.s01!, status: 'dismissed' as const } };
    for (let i = 0; i < 40; i++) expect(pickNext(MOCK_ITEMS, s, ctx({ cardIndex: i }))!.itemId).not.toBe('s01');
  });
});

describe('synthetic deck', () => {
  it('has 20–40 items, every cloze has exactly one gap and at most 14 words', () => {
    expect(MOCK_ITEMS.length).toBeGreaterThanOrEqual(20);
    expect(MOCK_ITEMS.length).toBeLessThanOrEqual(40);
    for (const i of MOCK_ITEMS) {
      for (const cz of [i.cloze1, i.cloze2].filter(Boolean)) {
        expect(cz!.text.split('___').length - 1, `${i.id} ${cz!.text}`).toBe(1);
        expect(cz!.text.replace('___', cz!.answer).split(/\s+/).length, i.id).toBeLessThanOrEqual(14);
      }
      expect(i.sentence.split(/\s+/).length, i.id).toBeLessThanOrEqual(14);
      expect(i.article === '' || i.pos === 'noun', i.id).toBe(true);
    }
  });
  it('ids are unique and both suggestion items exist', () => {
    expect(new Set(MOCK_ITEMS.map((i) => i.id)).size).toBe(MOCK_ITEMS.length);
    expect(MOCK_ITEMS.filter((i) => i.origin === 'suggestion').length).toBe(2);
  });
});

describe('reinsertion and variety', () => {
  const states = seedStates(MOCK_ITEMS, NOW);
  it('a reinsertion yields one turn rather than make three cards of one type in a row', () => {
    // m01 is at stage 1 → a listen card.
    const c = pickNext(MOCK_ITEMS, states, ctx({ cardIndex: 6, reinsert: [{ itemId: 'm01', at: 6 }], recentTypes: ['listen', 'listen'] }))!;
    expect(c.itemId).not.toBe('m01');
  });
  it('but not forever: two cards late, it goes first', () => {
    const c = pickNext(MOCK_ITEMS, states, ctx({ cardIndex: 8, reinsert: [{ itemId: 'm01', at: 6 }], recentTypes: ['listen', 'listen'] }))!;
    expect(c.itemId).toBe('m01');
  });
});
