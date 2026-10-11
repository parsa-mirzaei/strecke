/**
 * The device's working store (DECISIONS D50): the learning event log, settings and the cached copy of
 * the learner's sheet, in IndexedDB. Versioned schema, one transaction per write, and a damaged record
 * is moved aside (quarantined) instead of taking the rest of the data with it.
 *
 * When IndexedDB cannot be opened at all (some private modes, blocked site data), the same API runs in
 * memory and `durability` says so, so Settings can tell the learner plainly.
 */
import type { LearnEvent } from '../../../core/src/scheduler.ts';
import { isLearnEvent } from './events';
import { openDb, request, transact, type Migration } from './idb';

/** Schema versions, oldest first. Never edit a shipped step; append a new one. */
export const MIGRATIONS: readonly Migration[] = [
  // v1: event log, key-value settings, quarantine for damaged records, archive of pre-IndexedDB data.
  (db) => {
    const events = db.createObjectStore('events', { keyPath: 'id' });
    events.createIndex('ts', 'ts');
    db.createObjectStore('kv', { keyPath: 'k' });
    db.createObjectStore('quarantine', { autoIncrement: true });
    db.createObjectStore('legacy', { keyPath: 'k' });
  },
];
export const DB_VERSION = MIGRATIONS.length;

export interface Quarantined {
  store: string;
  key: unknown;
  value: unknown;
  reason: string;
  at: number;
}

export type Durability = 'indexeddb' | 'memory';

export interface LoadedEvents {
  events: LearnEvent[];
  /** Records found damaged during this load and moved to quarantine. */
  quarantined: number;
}

export interface Store {
  readonly durability: Durability;
  loadEvents(): Promise<LoadedEvents>;
  /** Append events in one transaction; idempotent by event id. Returns how many were new. */
  appendEvents(events: readonly LearnEvent[]): Promise<number>;
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  /** Several key-value writes, all or nothing. */
  setMany(entries: Record<string, unknown>): Promise<void>;
  /** Everything except the quarantine, for a backup. */
  dump(): Promise<{ events: unknown[]; kv: Record<string, unknown>; legacy: Record<string, unknown> }>;
  /** Write a whole restore in one transaction: events merged by id, kv entries replaced, legacy merged. */
  restore(data: { events: readonly LearnEvent[]; kv: Record<string, unknown>; legacy: Record<string, unknown> }): Promise<number>;
  quarantineCount(): Promise<number>;
  putLegacy(key: string, value: unknown): Promise<void>;
  close(): void;
}

// ---------------------------------------------------------------------------------------- IndexedDB

class IdbStore implements Store {
  readonly durability = 'indexeddb' as const;
  private db: IDBDatabase;
  constructor(db: IDBDatabase) {
    this.db = db;
  }

  async loadEvents(): Promise<LoadedEvents> {
    // One read-write pass: read everything, move what fails the shape check aside in the same transaction.
    return transact(this.db, ['events', 'quarantine'], 'readwrite', async (tx) => {
      const store = tx.objectStore('events');
      const keys = await request(store.getAllKeys());
      const values = await request(store.getAll());
      const events: LearnEvent[] = [];
      let bad = 0;
      values.forEach((v, i) => {
        if (isLearnEvent(v)) events.push(v);
        else {
          bad++;
          const q: Quarantined = { store: 'events', key: keys[i], value: v, reason: 'shape', at: Date.now() };
          tx.objectStore('quarantine').add(q);
          store.delete(keys[i]!);
        }
      });
      return { events, quarantined: bad };
    });
  }

  async appendEvents(events: readonly LearnEvent[]): Promise<number> {
    if (!events.length) return 0;
    return transact(this.db, 'events', 'readwrite', async (tx) => {
      const store = tx.objectStore('events');
      let added = 0;
      for (const e of events) {
        if (!isLearnEvent(e)) throw new Error('bad_event');
        const have = await request(store.getKey(e.id));
        if (have === undefined) {
          store.add(e);
          added++;
        }
      }
      return added;
    });
  }

  async get<T>(key: string): Promise<T | undefined> {
    const row = await transact(this.db, 'kv', 'readonly', (tx) => request(tx.objectStore('kv').get(key)));
    return (row as { v: T } | undefined)?.v;
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.setMany({ [key]: value });
  }

  async setMany(entries: Record<string, unknown>): Promise<void> {
    await transact(this.db, 'kv', 'readwrite', (tx) => {
      const kv = tx.objectStore('kv');
      for (const [k, v] of Object.entries(entries)) kv.put({ k, v });
    });
  }

  async dump() {
    return transact(this.db, ['events', 'kv', 'legacy'], 'readonly', async (tx) => {
      const events = await request(tx.objectStore('events').getAll());
      const kvRows = (await request(tx.objectStore('kv').getAll())) as { k: string; v: unknown }[];
      const legacyRows = (await request(tx.objectStore('legacy').getAll())) as { k: string; v: unknown }[];
      return {
        events,
        kv: Object.fromEntries(kvRows.map((r) => [r.k, r.v])),
        legacy: Object.fromEntries(legacyRows.map((r) => [r.k, r.v])),
      };
    });
  }

  async restore(data: { events: readonly LearnEvent[]; kv: Record<string, unknown>; legacy: Record<string, unknown> }): Promise<number> {
    return transact(this.db, ['events', 'kv', 'legacy'], 'readwrite', async (tx) => {
      const store = tx.objectStore('events');
      let added = 0;
      for (const e of data.events) {
        if (!isLearnEvent(e)) throw new Error('bad_event');
        if ((await request(store.getKey(e.id))) === undefined) {
          store.add(e);
          added++;
        }
      }
      for (const [k, v] of Object.entries(data.kv)) tx.objectStore('kv').put({ k, v });
      for (const [k, v] of Object.entries(data.legacy)) tx.objectStore('legacy').put({ k, v });
      return added;
    });
  }

  async quarantineCount(): Promise<number> {
    return transact(this.db, 'quarantine', 'readonly', (tx) => request(tx.objectStore('quarantine').count()));
  }

  async putLegacy(key: string, value: unknown): Promise<void> {
    await transact(this.db, 'legacy', 'readwrite', (tx) => {
      tx.objectStore('legacy').put({ k: key, v: value });
    });
  }

  close(): void {
    this.db.close();
  }
}

// ---------------------------------------------------------------------------------------- memory

/** Same behaviour, nothing survives a reload. Used only when IndexedDB is unavailable. */
export class MemoryStore implements Store {
  readonly durability = 'memory' as const;
  private events = new Map<string, LearnEvent>();
  private kv = new Map<string, unknown>();
  private legacy = new Map<string, unknown>();

  async loadEvents(): Promise<LoadedEvents> {
    return { events: [...this.events.values()].map((e) => structuredClone(e)), quarantined: 0 };
  }
  async appendEvents(events: readonly LearnEvent[]): Promise<number> {
    if (events.some((e) => !isLearnEvent(e))) throw new Error('bad_event');
    let added = 0;
    for (const e of events) if (!this.events.has(e.id)) { this.events.set(e.id, structuredClone(e)); added++; }
    return added;
  }
  async get<T>(key: string): Promise<T | undefined> {
    const v = this.kv.get(key);
    return v === undefined ? undefined : (structuredClone(v) as T);
  }
  async set(key: string, value: unknown): Promise<void> {
    this.kv.set(key, structuredClone(value));
  }
  async setMany(entries: Record<string, unknown>): Promise<void> {
    for (const [k, v] of Object.entries(entries)) this.kv.set(k, structuredClone(v));
  }
  async dump() {
    return {
      events: [...this.events.values()].map((e) => structuredClone(e)),
      kv: Object.fromEntries([...this.kv].map(([k, v]) => [k, structuredClone(v)])),
      legacy: Object.fromEntries([...this.legacy].map(([k, v]) => [k, structuredClone(v)])),
    };
  }
  async restore(data: { events: readonly LearnEvent[]; kv: Record<string, unknown>; legacy: Record<string, unknown> }): Promise<number> {
    if (data.events.some((e) => !isLearnEvent(e))) throw new Error('bad_event');
    const added = await this.appendEvents(data.events);
    await this.setMany(data.kv);
    for (const [k, v] of Object.entries(data.legacy)) this.legacy.set(k, structuredClone(v));
    return added;
  }
  async quarantineCount(): Promise<number> {
    return 0;
  }
  async putLegacy(key: string, value: unknown): Promise<void> {
    this.legacy.set(key, structuredClone(value));
  }
  close(): void {}
}

/** Open the store for this channel (live and preview use different database names, D57). */
export async function openStore(name: string, factory: IDBFactory | undefined = globalThis.indexedDB): Promise<Store> {
  if (!factory) return new MemoryStore();
  try {
    return new IdbStore(await openDb(factory, name, MIGRATIONS));
  } catch {
    return new MemoryStore();
  }
}
