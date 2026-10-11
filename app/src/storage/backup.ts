/**
 * Backup and restore of everything this device knows (DECISIONS D51).
 *
 * A backup is one JSON text file: the event log, settings, the cached copy of the sheet and the
 * archived prototype data. Restore is a merge: it adds events this device does not have and settings
 * it lacks; it never deletes or replaces anything that is already here. Before restoring, `dryRun`
 * says exactly what would change.
 *
 * The file is named `.txt` with type text/plain because Chrome's Web Share only accepts a fixed list
 * of file types, and JSON is not on it (source in docs/STORAGE.md). The content is still JSON.
 */
import type { LearnEvent } from '../../../core/src/scheduler.ts';
import { isLearnEvent } from './events';
import { DB_VERSION, type Store } from './store';

export const BACKUP_FORMAT = 'strecke-backup';
export const BACKUP_VERSION = 1;
/** Bookkeeping that belongs to this device, not to the learner's data. */
const DEVICE_KEYS = new Set(['backup', 'runs', 'persist', 'migrated.localStorage']);

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  channel: string;
  dbVersion: number;
  events: unknown[];
  kv: Record<string, unknown>;
  legacy: Record<string, unknown>;
}

export async function createBackup(store: Store, channel: string, now: number): Promise<BackupFile> {
  const d = await store.dump();
  const kv = Object.fromEntries(Object.entries(d.kv).filter(([k]) => !DEVICE_KEYS.has(k)));
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date(now).toISOString(),
    channel,
    dbVersion: DB_VERSION,
    events: d.events,
    kv,
    legacy: d.legacy,
  };
}

export function backupFileName(now: number): string {
  return `strecke-backup-${new Date(now).toISOString().slice(0, 10)}.txt`;
}

export type BackupProblem = 'not_json' | 'not_a_backup' | 'newer_version' | 'malformed';

export type ParsedBackup =
  | { ok: true; backup: BackupFile; events: LearnEvent[]; damaged: number }
  | { ok: false; problem: BackupProblem };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Check a file's text. Damaged event records are counted and left out; the rest stays usable. */
export function parseBackup(text: string): ParsedBackup {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, problem: 'not_json' };
  }
  if (!isObj(json) || json.format !== BACKUP_FORMAT) return { ok: false, problem: 'not_a_backup' };
  if (typeof json.version !== 'number' || json.version > BACKUP_VERSION) return { ok: false, problem: 'newer_version' };
  if (!Array.isArray(json.events) || !isObj(json.kv ?? {}) || !isObj(json.legacy ?? {})) return { ok: false, problem: 'malformed' };
  const events = json.events.filter(isLearnEvent);
  const backup: BackupFile = {
    format: BACKUP_FORMAT,
    version: json.version,
    createdAt: typeof json.createdAt === 'string' ? json.createdAt : '',
    channel: typeof json.channel === 'string' ? json.channel : '',
    dbVersion: typeof json.dbVersion === 'number' ? json.dbVersion : 0,
    events: json.events,
    kv: (json.kv ?? {}) as Record<string, unknown>,
    legacy: (json.legacy ?? {}) as Record<string, unknown>,
  };
  return { ok: true, backup, events, damaged: json.events.length - events.length };
}

export interface RestorePlan {
  createdAt: string;
  eventsInFile: number;
  /** Events this device does not have yet; these are added. */
  newEvents: number;
  alreadyHere: number;
  damaged: number;
  /** Settings or sheet details in the file that this device lacks; these are added. */
  newSettings: string[];
  firstEvent: number | null;
  lastEvent: number | null;
}

/** What a restore would do, without doing it. */
export async function dryRun(store: Store, parsed: Extract<ParsedBackup, { ok: true }>): Promise<RestorePlan> {
  const here = await store.dump();
  const have = new Set(here.events.map((e) => (e as { id?: string }).id));
  const fresh = parsed.events.filter((e) => !have.has(e.id));
  const ts = parsed.events.map((e) => e.ts);
  return {
    createdAt: parsed.backup.createdAt,
    eventsInFile: parsed.events.length + parsed.damaged,
    newEvents: new Set(fresh.map((e) => e.id)).size,
    alreadyHere: parsed.events.length - fresh.length,
    damaged: parsed.damaged,
    newSettings: Object.keys(parsed.backup.kv).filter((k) => !DEVICE_KEYS.has(k) && !(k in here.kv)),
    firstEvent: ts.length ? Math.min(...ts) : null,
    lastEvent: ts.length ? Math.max(...ts) : null,
  };
}

/** Merge the backup into this device in one transaction. Returns the number of events added. */
export async function restoreBackup(store: Store, parsed: Extract<ParsedBackup, { ok: true }>): Promise<number> {
  const here = await store.dump();
  const kv = Object.fromEntries(
    Object.entries(parsed.backup.kv).filter(([k]) => !DEVICE_KEYS.has(k) && !(k in here.kv)),
  );
  const legacy = Object.fromEntries(Object.entries(parsed.backup.legacy).filter(([k]) => !(k in here.legacy)));
  return store.restore({ events: parsed.events, kv, legacy });
}

export interface ShareTarget {
  canShare?: (data: { files: File[] }) => boolean;
  share?: (data: { files: File[]; title?: string }) => Promise<void>;
}

/**
 * Hand the file to the system share sheet where files can be shared (Chrome on Android), else download it.
 * Returns how it went; a cancelled share sheet is not an error and saves nothing.
 */
export async function shareOrDownload(
  text: string,
  name: string,
  nav: ShareTarget | undefined = typeof navigator !== 'undefined' ? (navigator as ShareTarget) : undefined,
  download: (blob: Blob, name: string) => void = downloadBlob,
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = typeof File !== 'undefined' ? new File([text], name, { type: 'text/plain' }) : null;
  if (file && nav?.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: name });
      return 'shared';
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return 'cancelled';
      // Share failed for another reason: fall through to a download.
    }
  }
  download(new Blob([text], { type: 'text/plain' }), name);
  return 'downloaded';
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** One gentle hint after this many completed runs without a backup. Shown once, ever. */
export const BACKUP_HINT_AFTER_RUNS = 10;

export interface BackupMeta {
  lastAt: number | null;
  hintShown: boolean;
}
export interface RunsMeta {
  completed: number;
  sinceBackup: number;
}

export function shouldShowBackupHint(runs: RunsMeta, meta: BackupMeta, eventCount: number): boolean {
  return !meta.hintShown && runs.sinceBackup >= BACKUP_HINT_AFTER_RUNS && eventCount > 0;
}
