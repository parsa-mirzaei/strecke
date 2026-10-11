import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DemoAdapter } from '@core/data/demo.ts';
import { SheetAdapter } from '@core/data/sheet.ts';
import type { LearnEvent } from '@core/scheduler.ts';
import { logForKey, openAppStore } from './store';

const T0 = Date.parse('2026-09-01T08:00:00Z');
const ev = (i: number, wordId: string, over: Partial<LearnEvent> = {}): LearnEvent => ({
  id: `e_${String(i).padStart(8, '0')}`, ts: T0 + i * 60_000, wordId, kind: 'review', exercise: 'luecke',
  correct: i % 3 !== 0, ms: 2000, help: false, dontKnow: false, run: `r_${Math.floor(i / 6)}`, ...over,
});

/** A database exactly as every earlier build wrote it (version 1, one out-of-line `kv` store). */
async function v1Database(factory: IDBFactory, name: string, entries: Record<string, unknown>) {
  const db = await new Promise<IDBDatabase>((res, rej) => {
    const r = factory.open(name, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  await new Promise<void>((res, rej) => {
    const tx = db.transaction('kv', 'readwrite');
    for (const [k, v] of Object.entries(entries)) tx.objectStore('kv').put(v, k);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}

async function readV1(factory: IDBFactory, name: string): Promise<Record<string, unknown>> {
  const db = await new Promise<IDBDatabase>((res) => { const r = factory.open(name); r.onsuccess = () => res(r.result); });
  const out: Record<string, unknown> = {};
  await new Promise<void>((res) => {
    const c = db.transaction('kv').objectStore('kv').openCursor();
    c.onsuccess = () => { const cur = c.result; if (!cur) return res(); out[String(cur.key)] = cur.value; cur.continue(); };
  });
  db.close();
  return out;
}

/** A realistic fixture: a year-ish of sheet answers, some demo answers, one damaged record, settings. */
function fixture() {
  const sheetEvents = Array.from({ length: 2000 }, (_, i) => ev(i, `w_word${String(i % 60).padStart(4, '0')}`, i % 7 === 0 ? { exercise: 'karte', rating: 3 } : {}));
  const damaged = { id: 'e_broken01', ts: 'yesterday', wordId: 'w_x' };
  return {
    'strecke.settings.v1': { version: 1, runLength: 6, theme: 'dark', sheet: { csvUrl: 'https://docs.google.com/spreadsheets/d/e/KEY/pub?output=csv' } },
    'strecke.demo.v1': { events: Array.from({ length: 300 }, (_, i) => ev(10_000 + i, 'w_demo0001')), status: { w_demo0002: 'suspended' } },
    'strecke.sheet.library.v1': { version: 1, items: { w_word0001: { id: 'w_word0001', row: { de: 'Termin' } } }, lastSync: T0 },
    'strecke.sheet.log.v1': { events: [...sheetEvents, damaged], status: {}, lastReport: null, lastError: null, lastAttempt: T0 },
    'strecke.sheet.log.v1.dev-seed': { events: [ev(20_000, 'w_seed0001')], status: {}, lastReport: null, lastError: null, lastAttempt: null },
  };
}

describe('storage: v1 → v2 migration (lossless)', () => {
  it('every event moves to the per-record store; every other entry is kept; the v1 store stays as a snapshot', async () => {
    const factory = new IDBFactory();
    const before = fixture();
    await v1Database(factory, 'strecke-test', before);
    const store = await openAppStore('strecke-test', factory);
    expect(store.durability).toBe('indexeddb');
    expect((await store.events.load('sheet')).length).toBe(2000);
    expect((await store.events.load('demo')).length).toBe(300);
    expect((await store.events.load('sheet.dev-seed')).length).toBe(1);
    expect(await store.quarantineCount()).toBe(1);
    expect(await store.kv.get('strecke.settings.v1')).toEqual(before['strecke.settings.v1']);
    expect(await store.kv.get('strecke.sheet.library.v1')).toEqual(before['strecke.sheet.library.v1']);
    expect(await store.kv.get('strecke.demo.v1')).toEqual({ ...before['strecke.demo.v1'], events: [] });
    expect(await store.migration()).toMatchObject({ from: 1, to: 2, events: 2301, entries: 5, quarantined: 1 });
    // The same events, field for field, in time order.
    const sheet = await store.events.load('sheet');
    expect(sheet).toEqual((before['strecke.sheet.log.v1'].events as LearnEvent[]).slice(0, 2000));
    store.close();
    expect(await readV1(factory, 'strecke-test')).toEqual(before); // snapshot untouched
  });

  it('runs once: reopening does not migrate again or duplicate anything', async () => {
    const factory = new IDBFactory();
    await v1Database(factory, 'strecke-test', fixture());
    (await openAppStore('strecke-test', factory)).close();
    const again = await openAppStore('strecke-test', factory);
    expect((await again.events.load('sheet')).length).toBe(2000);
    expect(await again.quarantineCount()).toBe(1);
    again.close();
  });

  it('a fresh install starts at v2 with nothing to migrate', async () => {
    const store = await openAppStore('strecke-fresh', new IDBFactory());
    expect((await store.events.load('sheet')).length).toBe(0);
    expect(await store.migration()).toMatchObject({ events: 0, entries: 0 });
  });

  it('adapters read the migrated events exactly as before', async () => {
    const factory = new IDBFactory();
    const before = fixture();
    await v1Database(factory, 'strecke-test', before);
    const store = await openAppStore('strecke-test', factory);
    const demo = await new DemoAdapter(store.kv, undefined, store.events).load();
    expect(demo.events).toHaveLength(300);
    expect(demo.suspended.map((w) => w.id)).toEqual(['w_demo0002']); // the status blob came along
    const sheet = await new SheetAdapter(store.kv, () => T0, '', store.events).load();
    expect(sheet.events).toHaveLength(2000);
    expect(sheet.source!.lastSync).toBe(T0);
  });

  it('logs are mapped from the old blob keys', () => {
    expect(logForKey('strecke.demo.v1')).toBe('demo');
    expect(logForKey('strecke.sheet.log.v1')).toBe('sheet');
    expect(logForKey('strecke.sheet.log.v1.dev-stress')).toBe('sheet.dev-stress');
    expect(logForKey('strecke.settings.v1')).toBeNull();
  });
});

describe('storage: transactions and damaged records', () => {
  it('a run is written in one transaction: one bad event and nothing of the batch is stored', async () => {
    const store = await openAppStore('t1', new IDBFactory());
    const good = [ev(1, 'w_a'), ev(2, 'w_a')];
    await expect(store.events.append('sheet', [...good, { ...ev(3, 'w_a'), ts: Number.NaN } as LearnEvent])).rejects.toThrow();
    expect(await store.events.load('sheet')).toEqual([]);
    expect(await store.events.append('sheet', good)).toBe(2);
    expect(await store.events.append('sheet', good)).toBe(0); // idempotent
  });

  it('"Don\'t count this run" removes exactly that run\'s events', async () => {
    const store = await openAppStore('t2', new IDBFactory());
    await store.events.append('sheet', [ev(1, 'w_a'), ev(2, 'w_a'), ev(3, 'w_b')]);
    expect(await store.events.remove('sheet', ['e_00000002', 'e_00000003', 'e_nothere0'])).toBe(2);
    expect((await store.events.load('sheet')).map((e) => e.id)).toEqual(['e_00000001']);
  });

  it('a record damaged after writing is set aside on load, the rest loads', async () => {
    const factory = new IDBFactory();
    const store = await openAppStore('t3', factory);
    await store.events.append('sheet', [ev(1, 'w_a'), ev(2, 'w_a')]);
    store.close();
    // Corrupt one record behind the store's back.
    const db = await new Promise<IDBDatabase>((res) => { const r = factory.open('t3'); r.onsuccess = () => res(r.result); });
    await new Promise<void>((res) => {
      const tx = db.transaction('events', 'readwrite');
      tx.objectStore('events').put({ key: 'sheet|e_00000002', log: 'sheet', e: { id: 'e_00000002', kind: 'nonsense' } });
      tx.oncomplete = () => res();
    });
    db.close();
    const again = await openAppStore('t3', factory);
    expect((await again.events.load('sheet')).map((e) => e.id)).toEqual(['e_00000001']);
    expect(await again.quarantineCount()).toBe(1);
  });

  it('channels are separate databases: one never sees the other', async () => {
    const factory = new IDBFactory();
    const stable = await openAppStore('strecke-preview', factory);
    const next = await openAppStore('strecke-next', factory);
    await next.events.append('sheet', [ev(1, 'w_a')]);
    await next.kv.set('strecke.settings.v1', { theme: 'light' });
    expect(await stable.events.load('sheet')).toEqual([]);
    expect(await stable.kv.get('strecke.settings.v1')).toBeUndefined();
  });

  it('without IndexedDB the same API works in memory and says so', async () => {
    const store = await openAppStore('m', undefined);
    expect(store.durability).toBe('memory');
    await store.events.append('demo', [ev(1, 'w_a')]);
    expect(await store.events.load('demo')).toHaveLength(1);
  });
});
