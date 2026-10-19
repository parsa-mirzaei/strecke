import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@core/engine/settings.ts';
import type { LearnEvent } from '@core/scheduler.ts';
import { dryRun } from './backup';
import type { Migration } from './idb';
import { DB_VERSION, MIGRATIONS, openAppStore } from './store';
import { dumpDatabase, dumpToBackupText, NewerDataError, peekVersion, readSnapshots, SNAPSHOT_KEEP, snapshotDbName, snapshotInfo } from './snapshot';

const T0 = Date.parse('2026-09-01T08:00:00Z');
const ev = (i: number): LearnEvent => ({
  id: `e_${String(i).padStart(8, '0')}`, ts: T0 + i * 60_000, wordId: `w_word${String(i % 9).padStart(4, '0')}`, kind: 'review',
  exercise: 'luecke', correct: i % 3 !== 0, ms: 2000, help: false, dontKnow: false,
});
const SETTINGS = { ...DEFAULT_SETTINGS, theme: 'dark', sheet: { ...DEFAULT_SETTINGS.sheet, fileName: 'words.csv' } };

/** A fixture schema step (v3): rewrites every event record in place, the kind of step a snapshot exists for. */
const fixtureStep: Migration = (_db, tx) => {
  const c = tx.objectStore('events').openCursor();
  c.onsuccess = () => {
    const cur = c.result;
    if (!cur) return;
    cur.update({ ...(cur.value as object), v3: true });
    cur.continue();
  };
};
const withSteps = (n: number) => [...MIGRATIONS, ...Array.from({ length: n }, () => fixtureStep)];

async function seeded(factory: IDBFactory, name = 'strecke-next') {
  const store = await openAppStore(name, factory);
  await store.kv.set('strecke.settings.v1', SETTINGS);
  await store.events.append('sheet', Array.from({ length: 40 }, (_, i) => ev(i)));
  await store.events.append('demo', [ev(100)]);
  store.close();
}

describe('update safety: snapshot before a migration', () => {
  it('a migration first copies the whole database into the snapshot database', async () => {
    const factory = new IDBFactory();
    await seeded(factory);
    const before = await dumpDatabase(factory, 'strecke-next');
    const store = await openAppStore('strecke-next', factory, withSteps(1), () => T0);
    expect(await peekVersion(factory, 'strecke-next')).toBe(DB_VERSION + 1);
    expect((await store.events.load('sheet')).length).toBe(40);
    store.close();
    const snaps = await readSnapshots(factory, 'strecke-next');
    expect(snaps).toHaveLength(1);
    expect(snaps[0]).toMatchObject({ at: T0, from: DB_VERSION, to: DB_VERSION + 1 });
    expect(snaps[0]!.dump).toEqual(before.dump); // exactly the pre-migration content
    expect(snapshotInfo(snaps[0]!)).toMatchObject({ answers: 40 }); // the sheet log (a file is connected)
  });

  it('keeps only the newest two snapshots', async () => {
    const factory = new IDBFactory();
    await seeded(factory);
    for (let n = 1; n <= 4; n++) (await openAppStore('strecke-next', factory, withSteps(n), () => T0 + n)).close();
    const snaps = await readSnapshots(factory, 'strecke-next');
    expect(snaps).toHaveLength(SNAPSHOT_KEEP);
    expect(snaps.map((s) => s.to)).toEqual([DB_VERSION + 4, DB_VERSION + 3]);
  });

  it('no migration, no snapshot (a fresh install and a plain reopen)', async () => {
    const factory = new IDBFactory();
    await seeded(factory);
    (await openAppStore('strecke-next', factory)).close();
    expect(await readSnapshots(factory, 'strecke-next')).toEqual([]);
    expect(await peekVersion(factory, snapshotDbName('strecke-next'))).toBe(0);
  });

  it('a snapshot restores through the normal dry run and merge', async () => {
    const factory = new IDBFactory();
    await seeded(factory);
    const store = await openAppStore('strecke-next', factory, withSteps(1));
    await store.events.remove('sheet', ['e_00000003', 'e_00000004']); // lost after the update
    const now = await store.events.load('sheet');
    const [snap] = await readSnapshots(factory, 'strecke-next');
    const { text, answers } = dumpToBackupText(snap!.dump, snap!.at, 'next', 'sheet');
    expect(answers).toBe(40);
    const plan = dryRun(text, new Set(now.map((e) => e.id)), DEFAULT_SETTINGS);
    expect(plan.ok && plan.fresh.map((e) => e.id)).toEqual(['e_00000003', 'e_00000004']);
    expect(plan.ok && plan.settings.theme).toBe('dark');
    if (plan.ok) await store.events.append('sheet', plan.fresh);
    expect((await store.events.load('sheet')).length).toBe(40);
  });
});

describe('update safety: version guard', () => {
  it('data written by a newer build is not opened, not written and not replaced by an empty store', async () => {
    const factory = new IDBFactory();
    await seeded(factory);
    (await openAppStore('strecke-next', factory, withSteps(1))).close(); // a newer build ran
    const before = await dumpDatabase(factory, 'strecke-next');
    await expect(openAppStore('strecke-next', factory)).rejects.toBeInstanceOf(NewerDataError);
    await expect(openAppStore('strecke-next', factory)).rejects.toMatchObject({ stored: DB_VERSION + 1, known: DB_VERSION });
    expect(await dumpDatabase(factory, 'strecke-next')).toEqual(before);
  });

  it('the newer data can still be exported as a backup file', async () => {
    const factory = new IDBFactory();
    await seeded(factory);
    (await openAppStore('strecke-next', factory, withSteps(1))).close();
    const { dump } = await dumpDatabase(factory, 'strecke-next');
    const { text, answers } = dumpToBackupText(dump, T0, 'next');
    expect(answers).toBe(40);
    expect(dryRun(text, new Set(), DEFAULT_SETTINGS)).toMatchObject({ ok: true, answers: 40 });
  });

  it('peeking never creates a database', async () => {
    const factory = new IDBFactory();
    expect(await peekVersion(factory, 'nothing-here')).toBe(0);
    expect((await factory.databases()).map((d) => d.name)).not.toContain('nothing-here');
  });
});
