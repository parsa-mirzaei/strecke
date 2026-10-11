import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { LearnEvent } from '../../../core/src/scheduler.ts';
import {
  BACKUP_HINT_AFTER_RUNS, createBackup, dryRun, parseBackup, restoreBackup, shareOrDownload, shouldShowBackupHint,
} from './backup';
import { openDb, request, transact } from './idb';
import { convertOldEvent, LEGACY_KEY, MIGRATION_FLAG, migrateLocalStorage } from './migrate';
import { persistState, requestPersist, shouldAskPersist } from './persist';
import { MemoryStore, MIGRATIONS, openStore } from './store';

const ev = (id: string, ts = 1_700_000_000_000, extra: Partial<LearnEvent> = {}): LearnEvent => ({
  id, ts, wordId: 'w_demo0001', kind: 'review', exercise: 'luecke', correct: true, ms: 1200, help: false, dontKnow: false, ...extra,
});

class FakeLocalStorage {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

describe('IndexedDB store', () => {
  it('opens at the current schema version with every store', async () => {
    const factory = new IDBFactory();
    const db = await openDb(factory, 't', MIGRATIONS);
    expect(db.version).toBe(MIGRATIONS.length);
    expect([...db.objectStoreNames].sort()).toEqual(['events', 'kv', 'legacy', 'quarantine']);
    db.close();
  });

  it('runs only the missing migrations when the stored version is older', async () => {
    const factory = new IDBFactory();
    const ran: number[] = [];
    const steps = [() => ran.push(0), () => ran.push(1)].map((f) => (() => { f(); }) as never);
    (await openDb(factory, 'm', steps.slice(0, 1))).close();
    (await openDb(factory, 'm', steps)).close();
    expect(ran).toEqual([0, 1]);
  });

  it('appends events idempotently and in one transaction', async () => {
    const store = await openStore('a', new IDBFactory());
    expect(store.durability).toBe('indexeddb');
    expect(await store.appendEvents([ev('e1'), ev('e2')])).toBe(2);
    expect(await store.appendEvents([ev('e2'), ev('e3')])).toBe(1);
    const { events } = await store.loadEvents();
    expect(events.map((e) => e.id).sort()).toEqual(['e1', 'e2', 'e3']);
  });

  it('writes nothing when one event in a batch is malformed (all or nothing)', async () => {
    const store = await openStore('b', new IDBFactory());
    await expect(store.appendEvents([ev('ok1'), { ...ev('bad'), ts: Number.NaN }])).rejects.toThrow();
    expect((await store.loadEvents()).events).toEqual([]);
  });

  it('aborts a transaction when its callback throws', async () => {
    const factory = new IDBFactory();
    const db = await openDb(factory, 'c', MIGRATIONS);
    await expect(transact(db, 'kv', 'readwrite', (tx) => {
      tx.objectStore('kv').put({ k: 'x', v: 1 });
      throw new Error('boom');
    })).rejects.toThrow('boom');
    const row = await transact(db, 'kv', 'readonly', (tx) => request(tx.objectStore('kv').get('x')));
    expect(row).toBeUndefined();
    db.close();
  });

  it('moves damaged records to quarantine and keeps the rest', async () => {
    const factory = new IDBFactory();
    const store = await openStore('q', factory);
    await store.appendEvents([ev('good1'), ev('good2')]);
    // Simulate damage written by a bug or a partial write: wrong shape, wrong types, garbage.
    const db = await openDb(factory, 'q', MIGRATIONS);
    await transact(db, 'events', 'readwrite', (tx) => {
      const s = tx.objectStore('events');
      s.put({ id: 'broken1', ts: 'yesterday' });
      s.put({ id: 'broken2', ts: 5, wordId: 'w', kind: 'review', exercise: 'nonsense', correct: true, ms: 1, help: false, dontKnow: false });
      s.put({ id: 'broken3' });
    });
    db.close();
    const first = await store.loadEvents();
    expect(first.events.map((e) => e.id).sort()).toEqual(['good1', 'good2']);
    expect(first.quarantined).toBe(3);
    expect(await store.quarantineCount()).toBe(3);
    const second = await store.loadEvents();
    expect(second.quarantined).toBe(0);
    expect(second.events).toHaveLength(2);
  });

  it('falls back to memory when IndexedDB cannot be opened', async () => {
    const broken = { open: () => { throw new Error('SecurityError'); } } as unknown as IDBFactory;
    const store = await openStore('x', broken);
    expect(store.durability).toBe('memory');
    await store.appendEvents([ev('m1')]);
    expect((await store.loadEvents()).events).toHaveLength(1);
    expect((await openStore('x', undefined)).durability).toBe('memory');
  });

  it('keeps key-value settings', async () => {
    const store = await openStore('kv', new IDBFactory());
    await store.setMany({ settings: { locale: 'de' }, other: 3 });
    expect(await store.get('settings')).toEqual({ locale: 'de' });
    expect(await store.get('missing')).toBeUndefined();
  });
});

describe('one-time migration from localStorage', () => {
  const oldItems = [{ id: 'm01', de: 'Haltestelle' }, { id: 'm02', de: 'Gibtsnicht' }];
  const deck = [{ id: 'w_demo0001', de: 'Haltestelle' }];
  const blob = {
    states: { m01: { stage: 2 } },
    events: [
      { id: 'a1', ts: 1_700_000_000_000, itemId: 'm01', card: 'meet', grade: 'new', ms: 900 },
      { id: 'a2', ts: 1_700_000_100_000, itemId: 'm01', card: 'recall', grade: 'good', ms: 3000 },
      { id: 'a3', ts: 1_700_000_200_000, itemId: 'm01', card: 'choice', grade: 'miss', ms: 2000 },
      { id: 'a4', ts: 1_700_000_300_000, itemId: 'm01', card: 'listen', grade: 'skip', ms: 0 },
      { id: 'a5', ts: 1_700_000_400_000, itemId: 'm02', card: 'recall', grade: 'good', ms: 1000 },
    ],
    captures: [{ id: 'c1', ts: 1, text: 'Feierabend', domain: 'arbeit' }],
    usage: [],
  };

  it('converts what it can, archives everything, and removes the old key after commit', async () => {
    const store = await openStore('mig', new IDBFactory());
    const ls = new FakeLocalStorage();
    ls.setItem(LEGACY_KEY, JSON.stringify(blob));
    const r = await migrateLocalStorage(store, ls, { oldItems, deck }, 42);
    expect(r).toMatchObject({ ran: true, found: true, converted: 3, archivedEvents: 5, unreadable: false });
    const { events } = await store.loadEvents();
    expect(events.map((e) => [e.id, e.kind, e.exercise, e.correct, e.wordId])).toEqual(expect.arrayContaining([
      ['h_a1', 'seen', 'karte', true, 'w_demo0001'],
      ['h_a2', 'review', 'luecke', true, 'w_demo0001'],
      ['h_a3', 'review', 'bedeutung', false, 'w_demo0001'],
    ]));
    expect(ls.getItem(LEGACY_KEY)).toBeNull();
    const dump = await store.dump();
    expect(dump.legacy['heft.v1']).toEqual(blob);
    expect(await store.get(MIGRATION_FLAG)).toMatchObject({ converted: 3 });
  });

  it('runs once: a second start does nothing, even if the key reappears', async () => {
    const store = await openStore('mig2', new IDBFactory());
    const ls = new FakeLocalStorage();
    ls.setItem(LEGACY_KEY, JSON.stringify(blob));
    await migrateLocalStorage(store, ls, { oldItems, deck }, 1);
    ls.setItem(LEGACY_KEY, JSON.stringify(blob));
    const again = await migrateLocalStorage(store, ls, { oldItems, deck }, 2);
    expect(again.ran).toBe(false);
    expect((await store.loadEvents()).events).toHaveLength(3);
  });

  it('archives an unreadable blob instead of dropping it', async () => {
    const store = await openStore('mig3', new IDBFactory());
    const ls = new FakeLocalStorage();
    ls.setItem(LEGACY_KEY, '{not json');
    const r = await migrateLocalStorage(store, ls, { oldItems, deck }, 1);
    expect(r).toMatchObject({ found: true, unreadable: true, converted: 0 });
    expect((await store.dump()).legacy['heft.v1']).toEqual({ unreadable: '{not json' });
  });

  it('keeps the old key when the IndexedDB write fails', async () => {
    const store = new MemoryStore();
    store.restore = async () => { throw new Error('quota'); };
    const ls = new FakeLocalStorage();
    ls.setItem(LEGACY_KEY, JSON.stringify(blob));
    await expect(migrateLocalStorage(store, ls, { oldItems, deck }, 1)).rejects.toThrow('quota');
    expect(ls.getItem(LEGACY_KEY)).not.toBeNull();
  });

  it('records that there was nothing to migrate on a fresh device', async () => {
    const store = await openStore('mig4', new IDBFactory());
    const r = await migrateLocalStorage(store, new FakeLocalStorage(), { oldItems, deck }, 1);
    expect(r).toMatchObject({ ran: true, found: false });
    expect(await store.get(MIGRATION_FLAG)).toMatchObject({ found: false });
  });

  it('maps a "known" first encounter to a Karte with the rating "knew it"', () => {
    expect(convertOldEvent({ id: 'x', ts: 5, itemId: 'm01', card: 'meet', grade: 'known' }, () => 'w1'))
      .toMatchObject({ kind: 'seen', rating: 3 });
    expect(convertOldEvent({ id: 'x', ts: 5, itemId: 'm01', card: 'meet', grade: 'dismiss' }, () => 'w1')).toBeNull();
  });
});

describe('backup and restore', () => {
  it('round-trips events and settings into an empty device', async () => {
    const a = await openStore('src', new IDBFactory());
    await a.appendEvents([ev('e1', 1), ev('e2', 2), ev('e3', 3)]);
    await a.setMany({ settings: { locale: 'de' }, 'sheet.connection': { wordsUrl: 'x' }, backup: { lastAt: 1 } });
    await a.putLegacy('heft.v1', { events: [] });
    const file = JSON.stringify(await createBackup(a, 'preview', Date.UTC(2026, 9, 11)));

    const parsed = parseBackup(file);
    if (!parsed.ok) throw new Error(parsed.problem);
    const b = await openStore('dst', new IDBFactory());
    const plan = await dryRun(b, parsed);
    expect(plan).toMatchObject({ eventsInFile: 3, newEvents: 3, alreadyHere: 0, damaged: 0, firstEvent: 1, lastEvent: 3 });
    expect(plan.newSettings.sort()).toEqual(['settings', 'sheet.connection']);
    expect(await restoreBackup(b, parsed)).toBe(3);
    expect((await b.loadEvents()).events.map((e) => e.id).sort()).toEqual(['e1', 'e2', 'e3']);
    expect(await b.get('settings')).toEqual({ locale: 'de' });
    expect(await b.get('backup')).toBeUndefined(); // device bookkeeping is not carried over
  });

  it('merges into a device that has its own data, never replacing anything', async () => {
    const a = await openStore('s2', new IDBFactory());
    await a.appendEvents([ev('e1'), ev('e2')]);
    await a.set('settings', { locale: 'de' });
    const parsed = parseBackup(JSON.stringify(await createBackup(a, 'live', 0)));
    if (!parsed.ok) throw new Error();
    const b = await openStore('d2', new IDBFactory());
    await b.appendEvents([ev('e2'), ev('e9')]);
    await b.set('settings', { locale: 'en' });
    const plan = await dryRun(b, parsed);
    expect(plan).toMatchObject({ newEvents: 1, alreadyHere: 1, newSettings: [] });
    await restoreBackup(b, parsed);
    expect((await b.loadEvents()).events.map((e) => e.id).sort()).toEqual(['e1', 'e2', 'e9']);
    expect(await b.get('settings')).toEqual({ locale: 'en' });
    expect(await restoreBackup(b, parsed)).toBe(0); // restoring twice changes nothing
  });

  it('skips damaged records in a file and reports them', async () => {
    const file = JSON.stringify({ format: 'strecke-backup', version: 1, events: [ev('ok'), { id: 'x' }, 7], kv: {}, legacy: {} });
    const parsed = parseBackup(file);
    expect(parsed.ok && parsed.damaged).toBe(2);
    expect(parsed.ok && parsed.events.map((e) => e.id)).toEqual(['ok']);
  });

  it('rejects files that are not backups, with a reason', () => {
    expect(parseBackup('hello')).toEqual({ ok: false, problem: 'not_json' });
    expect(parseBackup('{"a":1}')).toEqual({ ok: false, problem: 'not_a_backup' });
    expect(parseBackup('{"format":"strecke-backup","version":99,"events":[]}')).toEqual({ ok: false, problem: 'newer_version' });
    expect(parseBackup('{"format":"strecke-backup","version":1,"events":{}}')).toEqual({ ok: false, problem: 'malformed' });
  });

  it('shares a .txt file where files can be shared, otherwise downloads', async () => {
    const shared: File[] = [];
    const nav = { canShare: () => true, share: async (d: { files: File[] }) => { shared.push(...d.files); } };
    expect(await shareOrDownload('{}', 'b.txt', nav, () => { throw new Error('no download'); })).toBe('shared');
    expect(shared[0]?.type).toBe('text/plain');
    let downloaded = '';
    expect(await shareOrDownload('{}', 'b.txt', { canShare: () => false }, (_b, n) => { downloaded = n; })).toBe('downloaded');
    expect(downloaded).toBe('b.txt');
    const abort = { canShare: () => true, share: async () => { throw Object.assign(new Error(), { name: 'AbortError' }); } };
    expect(await shareOrDownload('{}', 'b.txt', abort, () => { throw new Error(); })).toBe('cancelled');
  });

  it('suggests a backup once, after enough runs without one', () => {
    const meta = { lastAt: null, hintShown: false };
    expect(shouldShowBackupHint({ completed: 3, sinceBackup: 3 }, meta, 10)).toBe(false);
    expect(shouldShowBackupHint({ completed: 12, sinceBackup: BACKUP_HINT_AFTER_RUNS }, meta, 10)).toBe(true);
    expect(shouldShowBackupHint({ completed: 12, sinceBackup: 12 }, { ...meta, hintShown: true }, 10)).toBe(false);
    expect(shouldShowBackupHint({ completed: 12, sinceBackup: 12 }, meta, 0)).toBe(false);
  });
});

describe('persistent storage wrapper', () => {
  it('reports the state and asks only when useful', async () => {
    expect(await persistState(undefined)).toBe('unsupported');
    expect(await persistState({ persisted: async () => true })).toBe('protected');
    expect(await persistState({ persisted: async () => false })).toBe('not-protected');
    expect(await persistState({ persisted: async () => { throw new Error(); } })).toBe('unsupported');
  });

  it('requests persistence and returns the result without throwing', async () => {
    let asked = 0;
    const granted = { persisted: async () => false, persist: async () => { asked++; return true; } };
    expect(await requestPersist(granted)).toBe('protected');
    expect(asked).toBe(1);
    const already = { persisted: async () => true, persist: async () => { asked++; return true; } };
    expect(await requestPersist(already)).toBe('protected');
    expect(asked).toBe(1);
    expect(await requestPersist({ persisted: async () => false, persist: async () => false })).toBe('not-protected');
    expect(await requestPersist({})).toBe('unsupported');
  });

  it('never asks before the first completed run', () => {
    expect(shouldAskPersist(0, 'not-protected', false)).toBe(false);
    expect(shouldAskPersist(1, 'not-protected', false)).toBe(true);
    expect(shouldAskPersist(1, 'not-protected', true)).toBe(false);
    expect(shouldAskPersist(5, 'protected', false)).toBe(false);
  });
});
