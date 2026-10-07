/**
 * `demo` adapter: the bundled synthetic deck, learning state on this device only. No token, no sync,
 * no captures (DECISIONS D13).
 */
import { toWordRecord } from '../record.ts';
import type { Row } from '../schema.ts';
import { DEFAULT_CONFIG, type LearnEvent } from '../scheduler.ts';
import type { DataAdapter, KeyValueStore, Snapshot, WordStatusChange } from './adapter.ts';
import { DEMO_WORDS } from './demo-deck.ts';

const KEY = 'strecke.demo.v1';
/** Keeps device storage bounded; the scheduler only needs recent history for a demo. */
const MAX_EVENTS = 5000;

interface Stored {
  events: LearnEvent[];
  status: Record<string, WordStatusChange>;
}

export class DemoAdapter implements DataAdapter {
  readonly kind = 'demo' as const;
  private store: KeyValueStore;
  private deck: readonly Row[];
  constructor(store: KeyValueStore, deck: readonly Row[] = DEMO_WORDS) {
    this.store = store;
    this.deck = deck;
  }

  private async read(): Promise<Stored> {
    return (await this.store.get<Stored>(KEY)) ?? { events: [], status: {} };
  }

  async load(): Promise<Snapshot> {
    const { events, status } = await this.read();
    const records = this.deck.map((w) => toWordRecord({ ...w, status: status[w.word_id!] ?? w.status ?? 'active' }));
    return {
      words: records.filter((w) => w.status === 'active' || w.status === 'pending'),
      suspended: records.filter((w) => w.status === 'suspended'),
      events,
      config: DEFAULT_CONFIG,
    };
  }

  async appendEvents(events: readonly LearnEvent[]): Promise<void> {
    const data = await this.read();
    const have = new Set(data.events.map((e) => e.id));
    for (const e of events) if (!have.has(e.id)) { have.add(e.id); data.events.push(e); }
    if (data.events.length > MAX_EVENTS) data.events.splice(0, data.events.length - MAX_EVENTS);
    await this.store.set(KEY, data);
  }

  async addCapture(): Promise<void> {
    throw new Error('not_in_demo');
  }

  async setWordStatus(wordId: string, to: WordStatusChange): Promise<void> {
    const data = await this.read();
    data.status[wordId] = to;
    await this.store.set(KEY, data);
  }
}
