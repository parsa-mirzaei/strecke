import { NS } from '../ns';

/** Delete this channel's database (Settings › Data › Reset). Other channels' databases are never touched. */
export function clearStore(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(NS);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}
