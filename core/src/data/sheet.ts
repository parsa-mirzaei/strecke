/**
 * `sheet` adapter (D46): the learner's Google Sheet is the content; this device keeps the last good copy
 * (the library), the event log and local word status. A sync reads the sheet table through a
 * `TableSource`, ingests it incrementally (sheet/ingest.ts) and never blocks practice: on any failure
 * the last good library stays in use.
 */
import { toWordRecord } from '../record.ts';
import { DEFAULT_CONFIG, type LearnEvent } from '../scheduler.ts';
import { emptyLibrary, ingest, introductionOrder, type IngestReport, type Library } from '../sheet/ingest.ts';
import type { DataAdapter, KeyValueStore, Snapshot, SourceInfo, WordStatusChange } from './adapter.ts';

/** Where the table comes from: a published CSV link, an uploaded file, the dev seed, a test fake. */
export interface TableSource {
  readonly label: string;
  read(): Promise<string[][]>;
}

const LIB = 'strecke.sheet.library.v1';
const LOG = 'strecke.sheet.log.v1';
/** Keys for one sheet; development fixtures use their own namespace so they never mix with real data. */
const keysFor = (ns: string) => (ns ? { lib: `${LIB}.${ns}`, log: `${LOG}.${ns}` } : { lib: LIB, log: LOG });
const MAX_EVENTS = 50_000;

interface Log {
  events: LearnEvent[];
  status: Record<string, WordStatusChange>;
  lastReport: IngestReport | null;
  lastError: string | null;
  lastAttempt: number | null;
}
const emptyLog = (): Log => ({ events: [], status: {}, lastReport: null, lastError: null, lastAttempt: null });

export class SheetAdapter implements DataAdapter {
  readonly kind = 'sheet' as const;
  private store: KeyValueStore;
  private now: () => number;
  private keys: { lib: string; log: string };
  constructor(store: KeyValueStore, now: () => number = Date.now, namespace = '') {
    this.store = store;
    this.now = now;
    this.keys = keysFor(namespace);
  }

  async library(): Promise<Library> {
    return (await this.store.get<Library>(this.keys.lib)) ?? emptyLibrary();
  }
  private async log(): Promise<Log> {
    return { ...emptyLog(), ...((await this.store.get<Log>(this.keys.log)) ?? {}) };
  }

  async load(): Promise<Snapshot> {
    const [lib, log] = [await this.library(), await this.log()];
    const records = introductionOrder(lib).map((it) => toWordRecord({ ...it.row, status: log.status[it.id] ?? 'active' }));
    const archived = Object.values(lib.items).filter((x) => x.status === 'archived').length;
    const source: SourceInfo = {
      lastSync: lib.lastSync, lastAttempt: log.lastAttempt, lastError: log.lastError,
      issues: log.lastReport?.issues ?? [], duplicates: log.lastReport?.duplicates ?? [], unknownColumns: log.lastReport?.unknownColumns ?? [], archived,
    };
    return {
      words: records.filter((w) => w.status === 'active' || w.status === 'pending'),
      suspended: records.filter((w) => w.status === 'suspended'),
      events: log.events,
      config: DEFAULT_CONFIG,
      source,
    };
  }

  /** Read the sheet and ingest it. Never throws: a failure is recorded and the last good library stays. */
  async sync(source: TableSource): Promise<{ ok: boolean; report?: IngestReport; error?: string }> {
    const log = await this.log();
    log.lastAttempt = this.now();
    let table: string[][];
    try {
      table = await source.read();
    } catch (e) {
      log.lastError = e instanceof Error ? e.message : 'read_failed';
      await this.store.set(this.keys.log, log);
      return { ok: false, error: log.lastError };
    }
    const { library, report } = ingest(await this.library(), table, this.now());
    if (!report.ok) {
      log.lastError = report.error ?? 'unreadable';
      await this.store.set(this.keys.log, log);
      return { ok: false, error: log.lastError, report };
    }
    await this.store.set(this.keys.lib, library);
    log.lastReport = report;
    log.lastError = null;
    await this.store.set(this.keys.log, log);
    return { ok: true, report };
  }

  async appendEvents(events: readonly LearnEvent[]): Promise<void> {
    const log = await this.log();
    const have = new Set(log.events.map((e) => e.id));
    for (const e of events) if (!have.has(e.id)) { have.add(e.id); log.events.push(e); }
    if (log.events.length > MAX_EVENTS) log.events.splice(0, log.events.length - MAX_EVENTS);
    await this.store.set(this.keys.log, log);
  }

  async addCapture(): Promise<void> {
    throw new Error('not_available_yet');
  }

  async setWordStatus(wordId: string, to: WordStatusChange): Promise<void> {
    const log = await this.log();
    log.status[wordId] = to;
    await this.store.set(this.keys.log, log);
  }
}
