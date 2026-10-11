/**
 * Start-up: open the device store, run the one-time migration, read settings and the event log.
 * Everything here is local; the network is never awaited before the first card (SPEC "Offline first").
 */
import { toWordRecord, type WordRecord } from '../../../core/src/record.ts';
import { DEMO_WORDS } from '../../../core/src/data/demo-deck.ts';
import type { LearnEvent } from '../../../core/src/scheduler.ts';
import { NS } from '../channel';
import { HEFT_ITEMS } from '../storage/heft-items';
import { migrateLocalStorage, type MigrationResult } from '../storage/migrate';
import { openStore, type Store } from '../storage/store';
import { normalizeSettings, type Settings } from './settings';

export interface Boot {
  store: Store;
  settings: Settings;
  events: LearnEvent[];
  /** Damaged records set aside, ever (shown neutrally in Settings › Data). */
  quarantined: number;
  migration: MigrationResult | null;
}

export const DEMO_RECORDS: WordRecord[] = DEMO_WORDS.map((w) => toWordRecord(w));

export async function boot(now = Date.now()): Promise<Boot> {
  const store = await openStore(`${NS}`);
  let migration: MigrationResult | null = null;
  try {
    let ls: Storage | undefined;
    try {
      ls = localStorage;
    } catch {
      ls = undefined;
    }
    // Only the live channel ever had the prototype's data; the preview starts clean.
    if (NS === 'strecke') migration = await migrateLocalStorage(store, ls, { oldItems: HEFT_ITEMS, deck: DEMO_RECORDS }, now);
  } catch {
    migration = null; // the old data stays where it was; the next start tries again
  }
  const settings = normalizeSettings(await store.get('settings'));
  const loaded = await store.loadEvents();
  return { store, settings, events: loaded.events, quarantined: await store.quarantineCount(), migration };
}
