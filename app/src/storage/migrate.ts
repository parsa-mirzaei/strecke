/**
 * One-time move of the Heft prototype's data out of localStorage (DECISIONS D50).
 *
 * The prototype kept everything in one localStorage blob (`strecke.proto.v1`): item states, up to 2000
 * review events, captures and the usage log. This runs once per device on the first start of a newer
 * version, inside one IndexedDB transaction:
 *   - the original blob is archived unchanged in the `legacy` store (and in every backup), so nothing is lost;
 *   - review events for words that also exist in the current demo deck (matched by the German word) are
 *     converted into learning events, so that progress carries over;
 *   - the localStorage key is removed only after the transaction has committed.
 */
import type { LearnEvent } from '../../../core/src/scheduler.ts';
import type { ExerciseType } from '../../../core/src/exercises.ts';
import type { Store } from './store';

export const LEGACY_KEY = 'strecke.proto.v1';
export const MIGRATION_FLAG = 'migrated.localStorage';

export interface MigrationResult {
  ran: boolean;
  found: boolean;
  converted: number;
  archivedEvents: number;
  unreadable: boolean;
}

interface OldEvent {
  id?: unknown;
  ts?: unknown;
  itemId?: unknown;
  card?: unknown;
  grade?: unknown;
  ms?: unknown;
}
interface OldItemRef {
  id: string;
  de: string;
}

const CARD: Record<string, ExerciseType> = { meet: 'karte', choice: 'bedeutung', listen: 'hoeren', recall: 'luecke' };

/** One prototype review event → a learning event, or null when it carries no learning signal. */
export function convertOldEvent(o: OldEvent, wordIdFor: (itemId: string) => string | undefined): LearnEvent | null {
  if (typeof o.id !== 'string' || typeof o.ts !== 'number' || typeof o.itemId !== 'string' || typeof o.card !== 'string') return null;
  const exercise = CARD[o.card];
  const wordId = wordIdFor(o.itemId);
  if (!exercise || !wordId) return null;
  const ms = typeof o.ms === 'number' && o.ms >= 0 ? o.ms : 0;
  const base = { id: `h_${o.id}`.slice(0, 64), ts: o.ts, wordId, ms, help: false, dontKnow: false };
  if (exercise === 'karte') {
    if (o.grade === 'new') return { ...base, kind: 'seen', exercise, correct: true };
    if (o.grade === 'known') return { ...base, kind: 'seen', exercise, correct: true, rating: 3 };
    return null;
  }
  if (o.grade === 'good' || o.grade === 'known') return { ...base, kind: 'review', exercise, correct: true };
  if (o.grade === 'miss') return { ...base, kind: 'review', exercise, correct: false };
  return null; // skipped or dismissed: no answer was given
}

export async function migrateLocalStorage(
  store: Store,
  ls: Pick<Storage, 'getItem' | 'removeItem'> | undefined,
  /** The prototype's items (id, German word) and the current deck's words (id, German word). */
  maps: { oldItems: readonly OldItemRef[]; deck: readonly OldItemRef[] },
  now: number,
): Promise<MigrationResult> {
  const result: MigrationResult = { ran: false, found: false, converted: 0, archivedEvents: 0, unreadable: false };
  if (await store.get(MIGRATION_FLAG)) return result;
  result.ran = true;

  let raw: string | null = null;
  try {
    raw = ls?.getItem(LEGACY_KEY) ?? null;
  } catch {
    raw = null; // localStorage blocked: nothing to migrate
  }
  if (raw === null) {
    await store.set(MIGRATION_FLAG, { at: now, found: false });
    return result;
  }
  result.found = true;

  let blob: { events?: unknown } | null = null;
  try {
    const parsed = JSON.parse(raw);
    blob = typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    blob = null;
  }

  const byDe = new Map(maps.deck.map((w) => [w.de.toLowerCase(), w.id]));
  const oldToNew = new Map<string, string>();
  for (const it of maps.oldItems) {
    const id = byDe.get(it.de.toLowerCase());
    if (id) oldToNew.set(it.id, id);
  }

  const events: LearnEvent[] = [];
  if (blob && Array.isArray(blob.events)) {
    result.archivedEvents = blob.events.length;
    for (const o of blob.events) {
      const e = convertOldEvent((o ?? {}) as OldEvent, (id) => oldToNew.get(id));
      if (e) events.push(e);
    }
  } else result.unreadable = true;
  result.converted = events.length;

  await store.restore({
    events,
    kv: { [MIGRATION_FLAG]: { at: now, found: true, converted: result.converted, unreadable: result.unreadable } },
    legacy: { 'heft.v1': blob ?? { unreadable: raw } },
  });
  try {
    ls?.removeItem(LEGACY_KEY);
  } catch {
    /* the archived copy is safe in IndexedDB; the old key stays until it can be removed */
  }
  return result;
}
