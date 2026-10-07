/**
 * The only way the UI and the scheduler read or write learning data (DECISIONS D46).
 * Implementations: `demo` (bundled synthetic deck, no sync), `local` (a full Core kept on the device,
 * for development and tests), `sheet` (the learner's Sheet through the D31 web app, Phase E).
 * Callers never know which one they hold.
 */
import type { Domain, WordRecord } from '../record.ts';
import type { EngineConfig, LearnEvent } from '../scheduler.ts';

export interface Snapshot {
  /** Active and pending (suggested) words; rejected and suspended ones are left out of practice. */
  words: WordRecord[];
  /** Suspended words, for Wörter. */
  suspended: WordRecord[];
  events: LearnEvent[];
  config: EngineConfig;
}

export type WordStatusChange = 'active' | 'rejected' | 'suspended';

export interface DataAdapter {
  readonly kind: 'demo' | 'local' | 'sheet';
  load(): Promise<Snapshot>;
  /** Append learning events; idempotent by event id. */
  appendEvents(events: readonly LearnEvent[]): Promise<void>;
  /** Hinzufügen: a word or phrase the learner captured. Not available in demo mode. */
  addCapture(text: string, domain: Domain | ''): Promise<void>;
  /** Behalten / Nicht für mich / Pausieren / resume. */
  setWordStatus(wordId: string, to: WordStatusChange): Promise<void>;
}

/** Async key-value storage: IndexedDB in the browser, memory in tests. Values must be structured-clonable. */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}

export class MemoryStore implements KeyValueStore {
  private data = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    const v = this.data.get(key);
    return v === undefined ? undefined : (structuredClone(v) as T);
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, structuredClone(value));
  }
}
