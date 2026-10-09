import type { KeyValueStore } from '@core/data/adapter.ts';
import { MemoryStore } from '@core/data/adapter.ts';
import { NS } from '../ns';

/**
 * KeyValueStore on IndexedDB: one database, one object store, structured-clone values. About forty
 * lines, so no wrapper library is needed. Falls back to memory when IndexedDB is unavailable (some
 * private modes); the app keeps working, it just forgets on reload.
 */
const DB = NS;
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('indexeddb_blocked'));
  });
}

class IdbStore implements KeyValueStore {
  constructor(private db: IDBDatabase) {}

  get<T>(key: string): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  }

  set<T>(key: string, value: T): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
}

export async function openStore(): Promise<KeyValueStore> {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('no_indexeddb');
    return new IdbStore(await open());
  } catch {
    return new MemoryStore();
  }
}

/** Development reset: drop the whole local database. */
export function clearStore(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}
