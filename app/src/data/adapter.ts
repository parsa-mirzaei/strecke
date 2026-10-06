import type { Capture, Item, ItemState, ReviewEvent, UsageEntry } from './types';
import { MOCK_ITEMS } from './mock-items';

/** Everything the feed needs at startup. */
export interface Snapshot {
  items: Item[];
  states: Record<string, ItemState>;
  events: ReviewEvent[];
  captures: Capture[];
  usage: UsageEntry[];
}

/**
 * The only way the UI reads or writes learning data. The prototype uses MockAdapter (bundled deck +
 * localStorage). A Core adapter (learner's OAuth session, IndexedDB cache, event queue) replaces it
 * later without touching components.
 */
export interface DataAdapter {
  readonly kind: 'mock' | 'core';
  load(): Promise<Snapshot>;
  saveStates(states: Record<string, ItemState>): void;
  appendEvent(event: ReviewEvent): void;
  addCapture(capture: Capture): void;
  saveUsage(usage: UsageEntry[]): void;
  reset(): void;
}

const KEY = 'strecke.proto.v1';
const DAY = 86_400_000;
const MIN = 60_000;

/** Starting stages for the synthetic deck, so Listen and Recall appear from the first open. */
const SEED_STAGE: Record<string, number> = {
  m07: 2, m02: 2, m10: 2, m16: 2, m24: 2, m30: 2,
  m01: 1, m09: 1, m12: 1, m20: 1, m25: 1, m28: 1,
  m03: 3, m08: 3, m19: 3, m26: 3, m22: 3,
  m04: 4, m13: 4, m17: 4, m21: 4, m29: 4,
};

export function seedStates(items: Item[], now: number): Record<string, ItemState> {
  const states: Record<string, ItemState> = {};
  items.forEach((item, i) => {
    const stage = SEED_STAGE[item.id] ?? 0;
    // Learned items: some due now (most overdue first), the rest spread over the coming days.
    const dueAt =
      stage === 0 ? 0
      : stage <= 2 ? now - (40 - i) * MIN
      : i % 2 === 0 ? now - (20 - i) * MIN
      : now + (1 + (i % 4)) * DAY;
    states[item.id] = {
      stage,
      dueAt,
      lapses: 0,
      reps: stage === 0 ? 0 : stage + 1,
      status: item.origin === 'suggestion' ? 'pending' : 'active',
    };
  });
  // The first card of a fresh install is a quick, satisfying recall.
  if (states.m07) states.m07.dueAt = now - 2 * DAY;
  return states;
}

interface Stored {
  states: Record<string, ItemState>;
  events: ReviewEvent[];
  captures: Capture[];
  usage: UsageEntry[];
}

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

/** Bundled synthetic deck; state in localStorage, or in memory if storage is unavailable. */
export class MockAdapter implements DataAdapter {
  readonly kind = 'mock' as const;
  private data: Stored = { states: {}, events: [], captures: [], usage: [] };

  async load(): Promise<Snapshot> {
    const stored = read();
    const fresh = seedStates(MOCK_ITEMS, Date.now());
    this.data = stored ?? { states: fresh, events: [], captures: [], usage: [] };
    // Items added to the bundle after a first install get a seed state too.
    for (const id of Object.keys(fresh)) this.data.states[id] ??= fresh[id]!;
    this.flush();
    return { items: MOCK_ITEMS, ...this.data };
  }

  saveStates(states: Record<string, ItemState>): void {
    this.data.states = states;
    this.flush();
  }

  appendEvent(event: ReviewEvent): void {
    this.data.events.push(event);
    if (this.data.events.length > 2000) this.data.events.splice(0, this.data.events.length - 2000);
    this.flush();
  }

  addCapture(capture: Capture): void {
    this.data.captures.unshift(capture);
    this.flush();
  }

  saveUsage(usage: UsageEntry[]): void {
    this.data.usage = usage.slice(-300);
    this.flush();
  }

  reset(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* storage unavailable: nothing to clear */
    }
  }

  private flush(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* private mode or quota: keep working in memory */
    }
  }
}
