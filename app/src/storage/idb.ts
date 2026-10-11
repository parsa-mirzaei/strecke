/**
 * A thin promise wrapper over IndexedDB: open with versioned migrations, run one transaction, await
 * one request. No library (CLAUDE.md asks for a small bundle; `idb` would do the same in 1 KB more).
 */

/** One schema step. `migrations[i]` upgrades a database at version `i` to version `i + 1`. */
export type Migration = (db: IDBDatabase, tx: IDBTransaction) => void;

export function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Open `name` at version `migrations.length`, running every migration above the stored version in
 * order, inside the single upgrade transaction (so an upgrade is all-or-nothing).
 */
export function openDb(factory: IDBFactory, name: string, migrations: readonly Migration[]): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(name, migrations.length);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      const tx = req.transaction!;
      for (let v = e.oldVersion; v < migrations.length; v++) migrations[v]!(db, tx);
    };
    req.onsuccess = () => {
      const db = req.result;
      // Another tab opened a newer version: close, so its upgrade is not blocked; this tab reloads.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('idb_blocked'));
  });
}

/**
 * Run `fn` in one transaction and resolve with its result once the transaction has committed.
 * If anything inside throws or a request fails, the whole transaction is aborted: nothing is written.
 */
export function transact<T>(
  db: IDBDatabase,
  stores: string | string[],
  mode: IDBTransactionMode,
  fn: (tx: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result: T;
    let failed: unknown = null;
    tx.oncomplete = () => (failed ? reject(failed) : resolve(result));
    tx.onerror = () => reject(tx.error ?? failed);
    tx.onabort = () => reject(tx.error ?? failed ?? new Error('idb_aborted'));
    Promise.resolve()
      .then(() => fn(tx))
      .then((r) => {
        result = r;
      })
      .catch((err) => {
        failed = err;
        try {
          tx.abort();
        } catch {
          /* already finished */
        }
      });
  });
}
