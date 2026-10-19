/**
 * Update safety (RELEASES.md, docs/design/DECISIONS.md R5-1, R5-2).
 *
 *  - Version guard: the stored schema version is read *before* opening. A database written by a newer
 *    build is never opened for writing by this one (`NewerDataError`); the app shows a screen with Export.
 *  - Snapshot before every migration: the whole database, as it was, is copied into a separate database
 *    `<name>-snapshots` (one store, the last `SNAPSHOT_KEEP` kept). A separate database needs no schema step
 *    in the main one, so adding snapshots did not itself raise the schema version.
 *
 * A snapshot is restored like a backup file: it is turned into this line's backup envelope and goes through
 * the same dry run and merge-only restore (storage/backup.ts).
 */
import { makeExport, parseSettings } from '@core/engine/settings.ts';
import { eventToRow, type LearnEvent } from '@core/scheduler.ts';
import { isLearnEvent } from './events';
import { request, transact } from './idb';

export const SNAPSHOT_KEEP = 2;
const SETTINGS_KEY = 'strecke.settings.v1';

export const snapshotDbName = (name: string) => `${name}-snapshots`;

/** The database at version `stored` was written by a build that knows more schema steps than this one. */
export class NewerDataError extends Error {
  constructor(readonly stored: number, readonly known: number) {
    super('newer_data');
    this.name = 'NewerDataError';
  }
}

/** Every store of one database, as `{ key, value }` rows. */
export type Dump = Record<string, Array<{ key: IDBValidKey; value: unknown }>>;

export interface StoredSnapshot { id?: number; at: number; from: number; to: number; dump: Dump }
export interface SnapshotInfo { id: number; at: number; from: number; to: number; answers: number }

/** The schema version stored for `name`, 0 when there is no database. Never creates or upgrades one. */
export async function peekVersion(factory: IDBFactory, name: string): Promise<number> {
  if (typeof factory.databases === 'function') {
    const list = await factory.databases();
    return list.find((d) => d.name === name)?.version ?? 0;
  }
  // No databases(): open without a version. If that would create the database, abort the creation.
  return new Promise((resolve, reject) => {
    const req = factory.open(name);
    let created = false;
    req.onupgradeneeded = () => { created = true; req.transaction!.abort(); };
    req.onsuccess = () => { const v = req.result.version; req.result.close(); resolve(v); };
    req.onerror = (e) => { if (created) { e.preventDefault(); resolve(0); } else reject(req.error); };
  });
}

/** Open an existing database at whatever version it has, without running any upgrade. */
function openExisting(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(name);
    req.onupgradeneeded = () => req.transaction!.abort(); // it did not exist: create nothing
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Read every store of a database as it is (read-only). */
export async function dumpDatabase(factory: IDBFactory, name: string): Promise<{ version: number; dump: Dump }> {
  const db = await openExisting(factory, name);
  try {
    const names = [...db.objectStoreNames];
    const dump: Dump = {};
    if (names.length) {
      await transact(db, names, 'readonly', async (tx) => {
        for (const s of names) {
          const store = tx.objectStore(s);
          const [keys, values] = await Promise.all([request(store.getAllKeys()), request(store.getAll())]);
          dump[s] = keys.map((key, i) => ({ key, value: values[i] }));
        }
      });
    }
    return { version: db.version, dump };
  } finally {
    db.close();
  }
}

function openSnapshots(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(snapshotDbName(name), 1);
    req.onupgradeneeded = () => req.result.createObjectStore('snapshots', { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Copy the whole database `name` (at version `from`) into its snapshot database; keep the newest `SNAPSHOT_KEEP`. */
export async function takeSnapshot(factory: IDBFactory, name: string, from: number, to: number, at: number): Promise<void> {
  const { dump } = await dumpDatabase(factory, name);
  const db = await openSnapshots(factory, name);
  try {
    await transact(db, 'snapshots', 'readwrite', async (tx) => {
      const store = tx.objectStore('snapshots');
      await request(store.add({ at, from, to, dump } satisfies StoredSnapshot));
      const ids = (await request(store.getAllKeys())) as number[];
      for (const id of ids.sort((a, b) => a - b).slice(0, Math.max(0, ids.length - SNAPSHOT_KEEP))) store.delete(id);
    });
  } finally {
    db.close();
  }
}

export async function readSnapshots(factory: IDBFactory | undefined, name: string): Promise<StoredSnapshot[]> {
  if (!factory || (await peekVersion(factory, snapshotDbName(name))) === 0) return [];
  const db = await openSnapshots(factory, name);
  try {
    const all = (await transact(db, 'snapshots', 'readonly', (tx) => request(tx.objectStore('snapshots').getAll()))) as StoredSnapshot[];
    return all.sort((a, b) => b.at - a.at);
  } finally {
    db.close();
  }
}

export function deleteSnapshots(factory: IDBFactory, name: string): Promise<void> {
  return new Promise((resolve) => {
    const req = factory.deleteDatabase(snapshotDbName(name));
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

/** Which event log a device runs on, from its settings: the sheet's when a sheet is connected, else the demo's. */
export const logFor = (settings: unknown) => {
  const s = parseSettings(settings);
  return s.sheet.csvUrl || s.sheet.fileName ? 'sheet' : 'demo';
};

/**
 * Settings and the events of one log, from a dump of any known layout: v1 (`kv` blobs) or v2 (`meta`,
 * `events`). Unknown stores are ignored; what is not a readable event is left out.
 */
export function readDump(dump: Dump, log?: string): { settings: unknown; log: string; events: LearnEvent[] } {
  const meta = new Map<string, unknown>();
  for (const r of dump.kv ?? []) meta.set(String(r.key), r.value);
  for (const r of dump.meta ?? []) { const v = r.value as { k?: unknown; v?: unknown }; if (typeof v?.k === 'string') meta.set(v.k, v.v); }
  const settings = meta.get(SETTINGS_KEY);
  const which = log ?? logFor(settings);
  const byId = new Map<string, LearnEvent>();
  // v1 blobs first, so a v2 record of the same event wins.
  const blob = meta.get(which === 'demo' ? 'strecke.demo.v1' : which === 'sheet' ? 'strecke.sheet.log.v1' : `strecke.sheet.log.v1.${which.slice(6)}`) as { events?: unknown[] } | undefined;
  for (const e of blob?.events ?? []) if (isLearnEvent(e)) byId.set(e.id, e);
  for (const r of dump.events ?? []) {
    const rec = r.value as { log?: unknown; e?: unknown };
    if (rec?.log === which && isLearnEvent(rec.e)) byId.set(rec.e.id, rec.e);
  }
  return { settings, log: which, events: [...byId.values()].sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1)) };
}

/** A dump as this line's backup file text, so it can go through the normal dry run and restore. */
export function dumpToBackupText(dump: Dump, now: number, channel: string, log?: string): { text: string; answers: number } {
  const r = readDump(dump, log);
  const env = { ...makeExport(parseSettings(r.settings), r.events.map((e) => eventToRow(e)), now), channel };
  return { text: JSON.stringify(env, null, 1), answers: r.events.length };
}

export function snapshotInfo(s: StoredSnapshot, log?: string): SnapshotInfo {
  return { id: s.id ?? 0, at: s.at, from: s.from, to: s.to, answers: readDump(s.dump, log).events.length };
}
