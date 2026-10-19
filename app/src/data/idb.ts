import { NS } from '../ns';
import { deleteSnapshots } from '../storage/snapshot';

/** Delete this channel's database and its snapshots (Settings › Data › Reset). Other channels' databases are never touched. */
export async function clearStore(): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(NS);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
  await deleteSnapshots(indexedDB, NS);
}
