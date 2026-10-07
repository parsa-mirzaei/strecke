/**
 * `local` adapter: a complete Core kept in a KeyValueStore (IndexedDB on the device, memory in tests).
 * Every write goes through the same Core writer as production, and seed files go through the same
 * seed path (actor `seed`), so development data obeys production rules. A record added to the local
 * Core shows up with its exercises on the next `load()`, with no code change.
 */
import { mintId, type RandomBytes } from '../ids.ts';
import { toWordRecord } from '../record.ts';
import { emptyCore, type Core } from '../schema.ts';
import { DEFAULT_CONFIG, eventFromRow, eventToRow, type EngineConfig, type LearnEvent } from '../scheduler.ts';
import { importSeed, type ParsedSeed } from '../seed.ts';
import { applyOps, type Op } from '../writer.ts';
import type { DataAdapter, KeyValueStore, Snapshot, WordStatusChange } from './adapter.ts';
import type { Domain } from '../record.ts';

const KEY = 'strecke.local.core.v1';

export interface LocalOptions {
  store: KeyValueStore;
  now: () => number;
  randomBytes: RandomBytes;
  device?: string;
}

const iso = (t: number) => new Date(t).toISOString();

export function configFrom(core: Core): EngineConfig {
  const get = (k: string) => core.config.find((r) => r.key === k)?.value;
  const num = (v: string | undefined, d: number) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    newPerDay: num(get('new_per_day'), DEFAULT_CONFIG.newPerDay),
    backlogPause: num(get('backlog_pause'), DEFAULT_CONFIG.backlogPause),
    retention: num(get('retention'), DEFAULT_CONFIG.retention),
  };
}

/** A Core → what the app needs. Rows the record rules reject are still shown (they were written by the learner). */
export function snapshotFrom(core: Core): Snapshot {
  const records = core.words.map((w) => toWordRecord(w, core.prompts));
  return {
    words: records.filter((w) => w.status === 'active' || w.status === 'pending'),
    suspended: records.filter((w) => w.status === 'suspended'),
    events: core.events.map(eventFromRow).filter((e): e is LearnEvent => !!e),
    config: configFrom(core),
  };
}

export class LocalAdapter implements DataAdapter {
  readonly kind = 'local' as const;
  private opts: LocalOptions;
  constructor(opts: LocalOptions) {
    this.opts = opts;
  }

  async core(): Promise<Core> {
    return (await this.opts.store.get<Core>(KEY)) ?? emptyCore();
  }

  private async write(ops: Op[]): Promise<void> {
    if (!ops.length) return;
    const core = await this.core();
    const next = applyOps(core, ops, { actor: 'app', ts: iso(this.opts.now()) }).core;
    await this.opts.store.set(KEY, next);
  }

  async load(): Promise<Snapshot> {
    return snapshotFrom(await this.core());
  }

  async appendEvents(events: readonly LearnEvent[]): Promise<void> {
    const core = await this.core();
    const have = new Set(core.events.map((e) => e.event_id));
    const known = new Set(core.words.map((w) => w.word_id));
    const fresh: LearnEvent[] = [];
    for (const e of events) if (known.has(e.wordId) && !have.has(e.id)) { have.add(e.id); fresh.push(e); }
    await this.write(fresh.map((e) => ({ op: 'append', tab: 'events', row: eventToRow(e, this.opts.device ?? '') })));
  }

  async addCapture(text: string, domain: Domain | ''): Promise<void> {
    const core = await this.core();
    const id = mintId('c', new Set(core.captures.map((c) => c.capture_id!)), this.opts.randomBytes);
    await this.write([{ op: 'append', tab: 'captures', row: { capture_id: id, ts: iso(this.opts.now()), text, domain, context: '', status: 'new' } }]);
  }

  async setWordStatus(wordId: string, to: WordStatusChange): Promise<void> {
    await this.write([{ op: 'setWordStatus', word_id: wordId, to }]);
  }

  /** Development: import a seed CSV through the seed path. Returns the per-row check results. */
  async importCsv(csvText: string): Promise<{ parsed: ParsedSeed; imported: number }> {
    const res = importSeed({ core: await this.core(), csvText, now: iso(this.opts.now()), randomBytes: this.opts.randomBytes });
    await this.opts.store.set(KEY, res.core);
    return { parsed: res.parsed, imported: res.imported };
  }
}
