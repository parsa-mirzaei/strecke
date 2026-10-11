import { describe, expect, it } from 'vitest';
import { toCsv } from '../../../core/src/csv.ts';
import { connect, connectFile, fetchCsv, shouldAutoSync, syncSheet, type Env } from './sync';

const KEY = '2PACX-placeholderkey';
const pub = (gid: number) => `https://docs.google.com/spreadsheets/d/e/${KEY}/pub?gid=${gid}&single=true&output=csv`;

/** A fake Google: one CSV body per URL; `html` answers like an unpublished tab. */
function fakeEnv(bodies: Record<string, string | { status?: number; html?: boolean; throws?: string }>, opts: { online?: boolean; now?: number } = {}): Env & { calls: string[] } {
  const calls: string[] = [];
  let t = opts.now ?? 1_000_000;
  return {
    calls,
    now: () => (t += 1000),
    online: () => opts.online ?? true,
    timeoutMs: 50,
    fetch: async (url, init) => {
      calls.push(url);
      expect(init.credentials).toBe('omit');
      const b = bodies[url];
      if (b === undefined) throw new TypeError('Failed to fetch');
      if (typeof b === 'string') return { ok: true, status: 200, text: async () => b, headers: { get: () => 'text/csv' } };
      if (b.throws === 'abort') throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      if (b.throws) throw new TypeError(b.throws);
      return {
        ok: (b.status ?? 200) < 400, status: b.status ?? 200,
        text: async () => (b.html ? '<!DOCTYPE html><html><body>Sign in</body></html>' : ''),
        headers: { get: () => (b.html ? 'text/html; charset=utf-8' : 'text/csv') },
      };
    },
  };
}

const words = toCsv([['word', 'meaning', 'article', 'source'], ['Tisch', 'table', 'der', 'me'], ['Schrank', 'wardrobe', '', 'agent']]);

describe('connect', () => {
  it('reads the tab once and reports rows and rows needing attention', async () => {
    const env = fakeEnv({ [pub(0)]: words });
    const r = await connect({ words: pub(0), inbox: '', meta: '' }, env);
    if (!r.ok) throw new Error(r.problem);
    expect(r.connection).toMatchObject({ kind: 'link', wordsUrl: pub(0), inboxUrl: '', metaUrl: '' });
    expect(r.result.cache.rows).toHaveLength(2);
    expect(r.result.cache.rows.filter((x) => x.issues.length)).toHaveLength(1); // Schrank: article missing
    expect(r.result.diff?.added).toHaveLength(2);
  });

  it("refuses the sheet's own address and hands back its id for Fill my list", async () => {
    const r = await connect({ words: 'https://docs.google.com/spreadsheets/d/abc123/edit', inbox: '', meta: '' }, fakeEnv({}));
    expect(r).toEqual({ ok: false, problem: 'edit_link', field: 'words', sheetId: 'abc123' });
  });

  it('explains an unpublished tab, a missing word column, offline and an unreachable host', async () => {
    expect(await connect({ words: pub(0), inbox: '', meta: '' }, fakeEnv({ [pub(0)]: { html: true } }))).toMatchObject({ ok: false, problem: 'not_published' });
    expect(await connect({ words: pub(0), inbox: '', meta: '' }, fakeEnv({ [pub(0)]: toCsv([['a'], ['b']]) }))).toMatchObject({ ok: false, problem: 'no_word_column' });
    expect(await connect({ words: pub(0), inbox: '', meta: '' }, fakeEnv({}, { online: false }))).toMatchObject({ ok: false, problem: 'offline' });
    expect(await connect({ words: pub(0), inbox: '', meta: '' }, fakeEnv({}))).toMatchObject({ ok: false, problem: 'unreachable' });
    expect(await connect({ words: pub(0), inbox: '', meta: '' }, fakeEnv({ [pub(0)]: { status: 500 } }))).toMatchObject({ ok: false, problem: 'http_500' });
  });

  it('checks the optional Inbox link and names the field that failed', async () => {
    const env = fakeEnv({ [pub(0)]: words, [pub(1)]: toCsv([['foo'], ['x']]) });
    expect(await connect({ words: pub(0), inbox: pub(1), meta: '' }, env)).toEqual({ ok: false, problem: 'no_word_column', field: 'inbox' });
  });

  it('reads Inbox and Meta when given', async () => {
    const env = fakeEnv({
      [pub(0)]: words,
      [pub(1)]: toCsv([['word', 'note', 'processed'], ['Feierabend', '', '']]),
      [pub(2)]: toCsv([['key', 'value'], ['schema_version', '2']]),
    });
    const r = await connect({ words: pub(0), inbox: pub(1), meta: pub(2) }, env);
    if (!r.ok) throw new Error(r.problem);
    expect(r.result.cache.inbox).toMatchObject({ waiting: 1 });
    expect(r.result.cache.schema).toMatchObject({ status: 'newer', sheet: 2 });
  });

  it('a downloaded CSV file works as a fallback', () => {
    const r = connectFile(words, 'Words.csv', null, 5);
    expect(r.ok && r.connection).toMatchObject({ kind: 'file', fileName: 'Words.csv' });
  });
});

describe('sync', () => {
  it('unchanged text: no diff, new sync time; changed text: a diff', async () => {
    const env = fakeEnv({ [pub(0)]: words });
    const first = await connect({ words: pub(0), inbox: '', meta: '' }, env);
    if (!first.ok) throw new Error();
    const again = await syncSheet(first.connection, first.result.cache, env);
    expect(again.diff).toBeNull();
    expect(again.cache.syncedAt).toBeGreaterThan(first.result.cache.syncedAt);
    expect(again.cache.rows).toEqual(first.result.cache.rows);

    const env2 = fakeEnv({ [pub(0)]: toCsv([['word', 'meaning'], ['Tisch', 'table, desk'], ['Lampe', 'lamp']]) });
    const next = await syncSheet(first.connection, first.result.cache, env2);
    expect(next.diff).toMatchObject({ added: ['w:lampe'], changed: ['w:tisch'], removed: ['w:schrank'] });
  });

  it('a failed sync keeps the last good copy and records why', async () => {
    const env = fakeEnv({ [pub(0)]: words });
    const first = await connect({ words: pub(0), inbox: '', meta: '' }, env);
    if (!first.ok) throw new Error();
    const off = await syncSheet(first.connection, first.result.cache, fakeEnv({}, { online: false }));
    expect(off.problem).toBe('offline');
    expect(off.cache.rows).toEqual(first.result.cache.rows);
    expect(off.cache.syncedAt).toBe(first.result.cache.syncedAt);
    const broken = await syncSheet(first.connection, first.result.cache, fakeEnv({ [pub(0)]: toCsv([['oops'], ['x']]) }));
    expect(broken.problem).toBe('no_word_column');
    expect(broken.cache.rows).toEqual(first.result.cache.rows);
  });

  it('a failing optional tab never fails the sync', async () => {
    const env = fakeEnv({ [pub(0)]: words });
    const r = await syncSheet({ kind: 'link', wordsUrl: pub(0), inboxUrl: pub(9), metaUrl: pub(8), fileName: '', connectedAt: 0 }, null, env);
    expect(r.problem).toBeNull();
    expect(r.cache.inbox).toBeNull();
    expect(r.cache.schema).toEqual({ status: 'none' });
  });

  it('times out instead of hanging', async () => {
    expect(await fetchCsv(pub(0), fakeEnv({ [pub(0)]: { throws: 'abort' } }))).toEqual({ ok: false, problem: 'timeout' });
  });

  it('auto-sync on return: debounced, never offline, never for a file', () => {
    const conn = { kind: 'link' as const, wordsUrl: pub(0), inboxUrl: '', metaUrl: '', fileName: '', connectedAt: 0 };
    const cache = { attemptAt: 100_000 } as never;
    expect(shouldAutoSync(conn, cache, 130_000, true)).toBe(false);
    expect(shouldAutoSync(conn, cache, 170_000, true)).toBe(true);
    expect(shouldAutoSync(conn, cache, 170_000, false)).toBe(false);
    expect(shouldAutoSync({ ...conn, kind: 'file' }, cache, 999_999, true)).toBe(false);
    expect(shouldAutoSync(null, null, 1, true)).toBe(false);
  });
});
