import type { DataAdapter, SourceInfo } from '@core/data/adapter.ts';
import type { TableSource } from '@core/data/sheet.ts';
import type { IngestReport } from '@core/sheet/ingest.ts';
import type { WordRecord } from '@core/record.ts';
import type { EngineConfig, LearnEvent } from '@core/scheduler.ts';
import type { Settings } from '@core/engine/settings.ts';
import type { AudioService } from './audio/service';
import type { AppStore } from './storage/store';
import type { DeviceInfo } from './state/device';
import type { Delivery, DryRun } from './storage/backup';

/** What every screen can reach. Mutated in place by App, which re-renders after a change. */
export interface Ctx {
  adapter: DataAdapter;
  /** This channel's IndexedDB (or memory) store. */
  app: AppStore;
  words: WordRecord[];
  suspended: WordRecord[];
  config: EngineConfig;
  events: LearnEvent[];
  eventIds: Set<string>;
  settings: Settings;
  setSettings(next: Settings): void;
  audio: AudioService;
  /** Add an answered card to the visit; it is saved with the rest of its run (`flush`). */
  record(e: LearnEvent): void;
  /** Save every answered card not saved yet, in one transaction. Called at the end of a run and when the app is hidden. */
  flush(): Promise<void>;
  /** "Don't count this run": remove its answers from the device. */
  discardRun(runId: string): Promise<void>;
  /** A run ended with at least one answer: bookkeeping, and the persistent-storage request. */
  runCompleted(): Promise<void>;
  device: DeviceInfo;
  setDevice(patch: Partial<DeviceInfo>): void;
  backupNow(): Promise<Delivery>;
  restore(d: Extract<DryRun, { ok: true }>, withSettings: boolean): Promise<void>;
  /** A calm line for the next screen ("3 new words from your sheet"), or ''. */
  notice: string;
  setNotice(text: string): void;
  /** Re-read words and events from the adapter (after import or a status change). */
  reload(): Promise<void>;
  /** What the last sheet sync found (sheet adapter only). */
  sourceInfo: SourceInfo | undefined;
  /** The configured sheet, if any. */
  source: TableSource | null;
  /** Read the sheet now (or the given source, e.g. a picked file) and reload; never throws. */
  sync(from?: TableSource): Promise<{ ok: boolean; report?: IngestReport; error?: string }>;
}

export type Screen = 'run' | 'summary' | 'end' | 'verlauf' | 'settings';
