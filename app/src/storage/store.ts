/**
 * The device's working store (docs/design/PORT_MAP.md, feature A; design ported from Round 4).
 *
 * IndexedDB, one database per channel (src/ns.ts), versioned schema:
 *   v1  `kv`          the original layout: one key-value store holding whole blobs (settings, the
 *                     demo deck's events, the sheet library and the sheet's event log).
 *   v2  `events`      one record per learning event, partitioned by `log` (demo, sheet, …); written in
 *                     one transaction per call, idempotent by event id.
 *       `meta`        settings, the sheet library and bookkeeping, as `{ k, v }`.
 *       `quarantine`  records that fail the shape check, set aside (never deleted).
 * The v1→v2 step copies every event out of the old blobs and every other entry into `meta`, inside the
 * single upgrade transaction (all or nothing). The v1 `kv` store is left exactly as it was: it is the
 * snapshot taken before migrating, and a rollback can read it.
 *
 * Without IndexedDB (some private modes), the same API runs in memory and `durability` says so.
 */
import { MemoryEventLog, MemoryStore, type EventLog, type KeyValueStore } from '@core/data/adapter.ts';
import type { LearnEvent } from '@core/scheduler.ts';
import { isLearnEvent } from './events';
import { openDb, request, transact, type Migration } from './idb';
import { NewerDataError, peekVersion, takeSnapshot } from './snapshot';

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Which event log an old blob key belongs to; null for blobs without events. */
export function logForKey(key: string): string | null {
  if (key === 'strecke.demo.v1') return 'demo';
  const m = /^strecke\.sheet\.log\.v1(?:\.(.+))?$/.exec(key);
  return m ? (m[1] ? `sheet.${m[1]}` : 'sheet') : null;
}

export interface MigrationInfo { from: number; to: number; at: number; events: number; entries: number; quarantined: number }
export const MIGRATION_KEY = 'storage.migration.v2';

interface EventRecord { key: string; log: string; e: LearnEvent }

/** Schema versions, oldest first. Never edit a shipped step; append a new one. */
export const MIGRATIONS: readonly Migration[] = [
  // v1: the layout every earlier build created.
  (db) => {
    if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
  },
  // v2: per-record events, meta, quarantine. Moves the old blobs' contents; keeps `kv` as the snapshot.
  (db, tx) => {
    db.createObjectStore('events', { keyPath: 'key' }).createIndex('log', 'log');
    db.createObjectStore('meta', { keyPath: 'k' });
    db.createObjectStore('quarantine', { autoIncrement: true });
    const meta = tx.objectStore('meta'), events = tx.objectStore('events'), quarantine = tx.objectStore('quarantine');
    const info: MigrationInfo = { from: 1, to: 2, at: Date.now(), events: 0, entries: 0, quarantined: 0 };
    const cursor = tx.objectStore('kv').openCursor();
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (!c) {
        meta.put({ k: MIGRATION_KEY, v: info });
        return;
      }
      const key = String(c.key);
      const value = c.value as unknown;
      const log = logForKey(key);
      if (log && isObj(value) && Array.isArray(value.events)) {
        for (const e of value.events as unknown[]) {
          if (isLearnEvent(e)) {
            events.put({ key: `${log}|${e.id}`, log, e } satisfies EventRecord);
            info.events++;
          } else {
            quarantine.add({ store: 'kv', key, value: e, reason: 'shape', at: info.at });
            info.quarantined++;
          }
        }
        meta.put({ k: key, v: { ...value, events: [] } });
      } else {
        meta.put({ k: key, v: value });
      }
      info.entries++;
      c.continue();
    };
  },
];
export const DB_VERSION = MIGRATIONS.length;

export type Durability = 'indexeddb' | 'memory';

export interface AppStore {
  readonly durability: Durability;
  readonly kv: KeyValueStore;
  readonly events: EventLog;
  quarantineCount(): Promise<number>;
  /** What the v1→v2 migration did on this device, if it ran. */
  migration(): Promise<MigrationInfo | null>;
  close(): void;
}

class IdbAppStore implements AppStore {
  readonly durability = 'indexeddb' as const;
  readonly kv: KeyValueStore;
  readonly events: EventLog;
  private db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.db = db;
    this.kv = {
      get: async <T>(key: string) => {
        const row = await transact(db, 'meta', 'readonly', (tx) => request(tx.objectStore('meta').get(key)));
        return (row as { v: T } | undefined)?.v;
      },
      set: async <T>(key: string, value: T) => {
        await transact(db, 'meta', 'readwrite', (tx) => { tx.objectStore('meta').put({ k: key, v: value }); });
      },
    };
    this.events = {
      load: (log) =>
        // One read-write pass: what fails the shape check is moved to quarantine in the same transaction.
        transact(db, ['events', 'quarantine'], 'readwrite', async (tx) => {
          const store = tx.objectStore('events');
          const rows = (await request(store.index('log').getAll(log))) as EventRecord[];
          const out: LearnEvent[] = [];
          for (const r of rows) {
            if (isLearnEvent(r?.e)) out.push(r.e);
            else {
              tx.objectStore('quarantine').add({ store: 'events', key: r?.key, value: r, reason: 'shape', at: Date.now() });
              store.delete(r.key);
            }
          }
          return out.sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1));
        }),
      append: (log, evs) =>
        transact(db, 'events', 'readwrite', async (tx) => {
          const store = tx.objectStore('events');
          let added = 0;
          for (const e of evs) {
            if (!isLearnEvent(e)) throw new Error('bad_event'); // nothing of the batch is written
            const key = `${log}|${e.id}`;
            if ((await request(store.getKey(key))) === undefined) { store.add({ key, log, e } satisfies EventRecord); added++; }
          }
          return added;
        }),
      remove: (log, ids) =>
        transact(db, 'events', 'readwrite', async (tx) => {
          const store = tx.objectStore('events');
          let n = 0;
          for (const id of ids) {
            const key = `${log}|${id}`;
            if ((await request(store.getKey(key))) !== undefined) { store.delete(key); n++; }
          }
          return n;
        }),
    };
  }

  quarantineCount(): Promise<number> {
    return transact(this.db, 'quarantine', 'readonly', (tx) => request(tx.objectStore('quarantine').count()));
  }
  async migration(): Promise<MigrationInfo | null> {
    return (await this.kv.get<MigrationInfo>(MIGRATION_KEY)) ?? null;
  }
  close(): void {
    this.db.close();
  }
}

class MemoryAppStore implements AppStore {
  readonly durability = 'memory' as const;
  readonly kv = new MemoryStore();
  readonly events = new MemoryEventLog();
  async quarantineCount() { return 0; }
  async migration() { return null; }
  close() {}
}

/**
 * Open this channel's store; falls back to memory when IndexedDB cannot be opened.
 *
 * Update safety (RELEASES.md): a database written by a newer build throws `NewerDataError` and is not
 * opened; before any migration the whole database is copied into its snapshot database. `migrations` is
 * a parameter for tests (a fixture schema step); the app always uses `MIGRATIONS`.
 */
export async function openAppStore(
  name: string, factory: IDBFactory | undefined = globalThis.indexedDB, migrations: readonly Migration[] = MIGRATIONS, now: () => number = Date.now,
): Promise<AppStore> {
  if (!factory) return new MemoryAppStore();
  let stored = 0;
  try { stored = await peekVersion(factory, name); } catch { /* unreadable: the open below decides */ }
  if (stored > migrations.length) throw new NewerDataError(stored, migrations.length);
  if (stored > 0 && stored < migrations.length) {
    // The migration itself is all-or-nothing and keeps the old stores; the snapshot is the extra copy.
    try { await takeSnapshot(factory, name, stored, migrations.length, now()); } catch (e) { console.warn('snapshot before migration failed', e); }
  }
  try {
    return new IdbAppStore(await openDb(factory, name, migrations));
  } catch (e) {
    // Another tab of a newer build upgraded in between: same answer as above, never the memory fallback.
    if ((e as { name?: string })?.name === 'VersionError') throw new NewerDataError(await peekVersion(factory, name).catch(() => stored), migrations.length);
    return new MemoryAppStore();
  }
}
