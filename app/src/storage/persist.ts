/**
 * Persistent storage (StorageManager.persist, DECISIONS D50).
 *
 * Browser behaviour (sources in docs/STORAGE.md): by default an origin's storage is "best-effort" and
 * may be evicted under storage pressure without asking. `persist()` asks for "persistent": then only
 * the user can clear it. Chrome never shows a prompt; it grants or silently denies based on how much
 * the site is used, whether it is installed or bookmarked, and notification permission, and a denied
 * request may be asked again later. Firefox shows a prompt. So we ask once, after the first completed
 * run (never on first load), again after later runs while still denied, and show the result plainly.
 */

export type PersistState = 'protected' | 'not-protected' | 'unsupported';

export interface StorageManagerLike {
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
}

export function storageManager(): StorageManagerLike | undefined {
  return typeof navigator !== 'undefined' ? (navigator.storage as StorageManagerLike | undefined) : undefined;
}

export async function persistState(sm: StorageManagerLike | undefined = storageManager()): Promise<PersistState> {
  if (!sm?.persisted) return 'unsupported';
  try {
    return (await sm.persisted()) ? 'protected' : 'not-protected';
  } catch {
    return 'unsupported';
  }
}

/** Ask for persistent storage. Resolves with the resulting state; never throws, never prompts in Chrome. */
export async function requestPersist(sm: StorageManagerLike | undefined = storageManager()): Promise<PersistState> {
  if (!sm?.persist) return 'unsupported';
  try {
    if (sm.persisted && (await sm.persisted())) return 'protected';
    return (await sm.persist()) ? 'protected' : 'not-protected';
  } catch {
    return 'unsupported';
  }
}

/** Ask after the first completed run, then at most once per further run while still not protected. */
export function shouldAskPersist(completedRuns: number, state: PersistState, alreadyAskedThisVisit: boolean): boolean {
  return completedRuns >= 1 && state === 'not-protected' && !alreadyAskedThisVisit;
}

export async function usageEstimate(sm: StorageManagerLike | undefined = storageManager()): Promise<{ usage: number; quota: number } | null> {
  if (!sm?.estimate) return null;
  try {
    const e = await sm.estimate();
    return typeof e.usage === 'number' && typeof e.quota === 'number' ? { usage: e.usage, quota: e.quota } : null;
  } catch {
    return null;
  }
}
