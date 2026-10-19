/**
 * Backup and restore (PORT_MAP feature A). One file format for every channel: this line's envelope
 * `{ app: 'strecke', kind: 'backup', version: 1, settings, events }` (events as sheet rows), so a file
 * exported by the Stable build reads in Next and the other way round. Optional extra fields: `channel`.
 *
 * Sharing: Chrome shares only a fixed list of file types and JSON is not on it, while `.txt` is
 * (Chromium share_service_impl.cc `kPermitted`, see DECISIONS R4-3). So the file is
 * `strecke-backup-<date>.txt` containing JSON. Where files cannot be shared, it is downloaded.
 * The audio key is never part of it.
 */
import { makeExport, readExport, type Settings } from '@core/engine/settings.ts';
import { eventFromRow, eventToRow, type LearnEvent } from '@core/scheduler.ts';

export interface BackupFile { name: string; text: string; answers: number }

export const backupName = (now: number) => `strecke-backup-${new Date(now).toISOString().slice(0, 10)}.txt`;

export function buildBackup(settings: Settings, events: readonly LearnEvent[], now: number, channel: string): BackupFile {
  const env = { ...makeExport(settings, events.map((e) => eventToRow(e)), now), channel };
  return { name: backupName(now), text: JSON.stringify(env, null, 1), answers: events.length };
}

export type Delivery = 'shared' | 'downloaded' | 'cancelled';

/** Share sheet where files can be shared; a download otherwise. */
export async function deliver(file: BackupFile, nav: Navigator | undefined = typeof navigator === 'undefined' ? undefined : navigator): Promise<Delivery> {
  const f = typeof File === 'undefined' ? null : new File([file.text], file.name, { type: 'text/plain' });
  if (f && nav?.canShare?.({ files: [f] }) && nav.share) {
    try {
      await nav.share({ files: [f], title: file.name });
      return 'shared';
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return 'cancelled';
      // Fall through to a download (some share targets refuse files).
    }
  }
  const url = URL.createObjectURL(new Blob([file.text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}

export type DryRun =
  | {
      ok: true;
      exportedAt: string;
      channel: string;
      answers: number;
      /** Answers this device does not have yet. */
      fresh: LearnEvent[];
      already: number;
      /** Rows that are not readable answers; they are left out. */
      skipped: number;
      settings: Settings;
      settingsChanged: string[];
    }
  | { ok: false; error: 'not_json' | 'not_a_strecke_backup' | 'unknown_version' };

const isEvent = (x: unknown) => eventFromRow(x as Record<string, string>) !== null;

/** What a restore would change, before anything is changed. */
export function dryRun(text: string, haveIds: ReadonlySet<string>, current: Settings): DryRun {
  const r = readExport(text, isEvent);
  if (!r.ok) return { ok: false, error: r.error as 'not_json' | 'not_a_strecke_backup' | 'unknown_version' };
  const raw = JSON.parse(text) as { events?: unknown[]; exportedAt?: unknown; channel?: unknown };
  const events = r.events.map((x) => eventFromRow(x as Record<string, string>)!);
  const fresh = events.filter((e) => !haveIds.has(e.id));
  const changed = (Object.keys(r.settings) as (keyof Settings)[]).filter((k) => JSON.stringify(r.settings[k]) !== JSON.stringify(current[k]));
  return {
    ok: true,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    channel: typeof raw.channel === 'string' ? raw.channel : 'stable',
    answers: events.length,
    fresh,
    already: events.length - fresh.length,
    skipped: (Array.isArray(raw.events) ? raw.events.length : 0) - events.length,
    settings: r.settings,
    settingsChanged: changed,
  };
}

/** One quiet hint after this many completed runs without a backup, once per device. */
export const BACKUP_HINT_AFTER_RUNS = 10;
export function shouldHintBackup(runsSinceBackup: number, hintShown: boolean): boolean {
  return !hintShown && runsSinceBackup >= BACKUP_HINT_AFTER_RUNS;
}
