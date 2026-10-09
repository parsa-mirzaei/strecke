import type { DataAdapter, KeyValueStore } from '@core/data/adapter.ts';
import type { WordRecord } from '@core/record.ts';
import type { EngineConfig, LearnEvent } from '@core/scheduler.ts';
import type { Settings } from '@core/engine/settings.ts';
import type { AudioService } from './audio/service';

/** What every screen can reach. Mutated in place by App, which re-renders after a change. */
export interface Ctx {
  adapter: DataAdapter;
  store: KeyValueStore;
  words: WordRecord[];
  suspended: WordRecord[];
  config: EngineConfig;
  events: LearnEvent[];
  eventIds: Set<string>;
  settings: Settings;
  setSettings(next: Settings): void;
  audio: AudioService;
  /** Add an answered card to the log and save it. */
  record(e: LearnEvent): void;
  /** Re-read words and events from the adapter (after import or a status change). */
  reload(): Promise<void>;
}

export type Screen = 'run' | 'summary' | 'end' | 'verlauf' | 'settings';
