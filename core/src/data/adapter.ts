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
  /** Only for the `sheet` adapter: what the last sync found. */
  source?: SourceInfo;
}

export interface SourceInfo {
  lastSync: number | null;
  lastAttempt: number | null;
  lastError: string | null;
  issues: Array<{ line: number; de: string; notes: string[]; skipped: boolean }>;
  duplicates: Array<{ line: number; de: string; firstLine: number }>;
  unknownColumns: string[];
  archived: number;
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
  /** "Don't count this run": remove events just written (only events of the current visit). */
  removeEvents?(ids: readonly string[]): Promise<void>;
}

/**
 * Where an adapter keeps its learning events when the device has a per-record event store
 * (app/src/storage/store.ts). One transaction per call. Without it, adapters keep events in their own
 * key-value blob as before (tests, older builds). `log` partitions the store per data source.
 */
export interface EventLog {
  load(log: string): Promise<LearnEvent[]>;
  /** Idempotent by event id; all or nothing. Returns how many were new. */
  append(log: string, events: readonly LearnEvent[]): Promise<number>;
  remove(log: string, ids: readonly string[]): Promise<number>;
}

/** In-memory EventLog for tests and for devices without IndexedDB. */
export class MemoryEventLog implements EventLog {
  private logs = new Map<string, Map<string, LearnEvent>>();
  private of(log: string) {
    let m = this.logs.get(log);
    if (!m) { m = new Map(); this.logs.set(log, m); }
    return m;
  }
  async load(log: string): Promise<LearnEvent[]> {
    return [...this.of(log).values()].map((e) => structuredClone(e));
  }
  async append(log: string, events: readonly LearnEvent[]): Promise<number> {
    const m = this.of(log);
    let n = 0;
    for (const e of events) if (!m.has(e.id)) { m.set(e.id, structuredClone(e)); n++; }
    return n;
  }
  async remove(log: string, ids: readonly string[]): Promise<number> {
    const m = this.of(log);
    let n = 0;
    for (const id of ids) if (m.delete(id)) n++;
    return n;
  }
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
