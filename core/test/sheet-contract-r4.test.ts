import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/csv.ts';
import { MemoryStore } from '../src/data/adapter.ts';
import { SheetAdapter } from '../src/data/sheet.ts';
import { cleanRow, mapHeader, normDate, SCHEMA_VERSION } from '../src/sheet/contract.ts';
import { ingest } from '../src/sheet/ingest.ts';
import { parsePublishedLink } from '../src/sheet/link.ts';
import { readInbox, readSchemaVersion } from '../src/sheet/tabs.ts';

/** The Round 4 additions to the one sheet contract (PORT_MAP feature C). */
const T0 = Date.parse('2026-10-11T08:00:00Z');
const KEY = 'PUBKEY_test-0123';

describe('published links', () => {
  it('a published CSV link is kept, with its gid', () => {
    const r = parsePublishedLink(`https://docs.google.com/spreadsheets/d/e/${KEY}/pub?gid=42&single=true&output=csv`);
    expect(r).toMatchObject({ ok: true, gid: '42', csvUrl: `https://docs.google.com/spreadsheets/d/e/${KEY}/pub?gid=42&single=true&output=csv` });
  });
  it('a published web-page link (pubhtml) becomes its CSV form; the gid can come from the fragment', () => {
    const r = parsePublishedLink(`https://docs.google.com/spreadsheets/d/e/${KEY}/pubhtml#gid=7`);
    expect(r.ok && r.csvUrl).toBe(`https://docs.google.com/spreadsheets/d/e/${KEY}/pub?gid=7&single=true&output=csv`);
  });
  it("the sheet's own address, other hosts and non-links are refused with a reason", () => {
    expect(parsePublishedLink('https://docs.google.com/spreadsheets/d/abc123/edit#gid=0')).toMatchObject({ ok: false, problem: 'edit_link' });
    expect(parsePublishedLink('https://example.com/x.csv')).toMatchObject({ ok: false, problem: 'not_google_sheets' });
    expect(parsePublishedLink('   ')).toMatchObject({ ok: false, problem: 'empty' });
    expect(parsePublishedLink(`https://docs.google.com/spreadsheets/d/e/${KEY}/other`)).toMatchObject({ ok: false, problem: 'not_published' });
  });
});

describe('headers and new columns', () => {
  it('a sheet with only a `word` column (and a meaning) is enough', () => {
    const m = mapHeader(['word', 'meaning']);
    expect(m.missingRequired).toEqual([]);
    expect(cleanRow(['Fenster', 'window'], m).skip).toBe(false);
  });
  it('German and English aliases for the Round 4 columns', () => {
    const m = mapHeader(['Wort', 'Bedeutung', 'Quelle', 'Hinzugefügt', 'Geprüft', 'Niveau', 'ID']);
    expect([...m.columns.values()]).toEqual(['de', 'en', 'source', 'added', 'verified', 'level', 'word_id']);
  });
  it('source, added, verified are normalised; a bad value is dropped with a code', () => {
    const m = mapHeader(['word', 'meaning', 'source', 'added', 'verified']);
    const ok = cleanRow(['Fenster', 'window', 'KI', '3.10.2026', 'ja'], m);
    expect([ok.row.source, ok.row.added, ok.row.verified]).toEqual(['agent', '2026-10-03', 'yes']);
    const bad = cleanRow(['Fenster', 'window', 'robot', 'gestern', 'vielleicht'], m);
    const dropped = bad.notes.filter((n) => n.code === 'unknown_value');
    expect(dropped.map((n) => n.column)).toEqual(['source', 'added', 'verified']);
    expect([bad.row.source, bad.row.added, bad.row.verified]).toEqual(['', '', '']);
  });
  it('level is free text and never validated against a list; only cell safety applies', () => {
    const m = mapHeader(['word', 'meaning', 'level']);
    expect(cleanRow(['Fenster', 'window', 'A2+ (eher B1)'], m).row.level).toBe('A2+ (eher B1)');
    const unsafe = cleanRow(['Fenster', 'window', '=IMPORTXML("x")'], m);
    expect(unsafe.row.level).toBe('');
    expect(unsafe.notes).toContainEqual(expect.objectContaining({ code: 'cell_dropped', column: 'level' }));
  });
  it('an article in the word cell or as m/f/n is understood', () => {
    const m = mapHeader(['word', 'article', 'meaning']);
    expect(cleanRow(['der Tisch', '', 'table'], m).row).toMatchObject({ de: 'Tisch', article: 'der' });
    expect(cleanRow(['Brille', 'f', 'glasses'], m).row.article).toBe('die');
    expect(cleanRow(['die Sache klären', '', 'to sort it out'], m).row.de).toBe('die Sache klären'); // a phrase stays as written
  });
  it('dates: ISO and DD.MM.YYYY; anything else is unreadable', () => {
    expect([normDate('2026-1-5'), normDate('05.01.2026'), normDate('Jan 5')]).toEqual(['2026-01-05', '2026-01-05', '']);
  });
});

describe('identity', () => {
  const H = ['id', 'word', 'article', 'meaning'];
  it('a free-text id is the identity: the word may change, the item (and its history) stays', () => {
    const a = ingest(null, [H, ['fenster-1', 'Fenstr', 'das', 'window']], T0);
    const [id] = a.report.added;
    const b = ingest(a.library, [H, ['fenster-1', 'Glasscheibe', 'die', 'pane']], T0 + 1);
    expect(b.report.updated).toEqual([id]);
    expect(b.report.added).toEqual([]);
    expect(b.library.items[id!]!.sheetId).toBe('fenster-1');
  });
  it('the same free-text id on another device gives the same word id', () => {
    const a = ingest(null, [H, ['k7', 'Schrank', 'der', 'cupboard']], T0).report.added;
    const b = ingest(null, [H, ['k7', 'Schrank', 'der', 'wardrobe']], T0 + 5).report.added;
    expect(a).toEqual(b);
  });
  it('an article filled in later keeps the word', () => {
    const H2 = ['word', 'article', 'meaning'];
    const a = ingest(null, [H2, ['Schrank', '', 'cupboard']], T0);
    const b = ingest(a.library, [H2, ['Schrank', 'der', 'cupboard']], T0 + 1);
    expect(b.report.updated).toEqual(a.report.added);
    expect(b.report.added).toEqual([]);
    expect(b.report.archived).toEqual([]);
  });
  it("notes carry the spreadsheet's own row numbers, blank rows included", () => {
    const table = parseCsv('word,article,meaning\nFenster,das,window\n,,\nSchrank,,cupboard\n', { keepEmpty: true });
    const r = ingest(null, table, T0).report;
    expect(r.issues).toEqual([{ line: 4, de: 'Schrank', notes: [{ code: 'article_missing', column: 'article' }], skipped: false }]);
  });
});

describe('optional tabs', () => {
  it('Inbox: counts waiting and processed words; aliases in German', () => {
    expect(readInbox([['Wort', 'Notiz', 'Erledigt'], ['Schrank', '', ''], ['Fenster', 'im Bus gehört', '2026-10-10'], ['', '', '']]))
      .toEqual({ ok: true, total: 2, waiting: 1, processed: 1, header: ['Wort', 'Notiz', 'Erledigt'] });
    expect(readInbox([['foo'], ['bar']])).toEqual({ ok: false, problem: 'no_word_column' });
    expect(readInbox([])).toEqual({ ok: false, problem: 'empty' });
  });
  it('Meta: schema_version same, newer, older, unreadable, none', () => {
    expect(readSchemaVersion([['key', 'value'], ['schema_version', String(SCHEMA_VERSION)]])).toEqual({ status: 'same' });
    expect(readSchemaVersion([['schema_version'], [String(SCHEMA_VERSION + 1)]])).toEqual({ status: 'newer', sheet: SCHEMA_VERSION + 1, app: SCHEMA_VERSION });
    expect(readSchemaVersion([['schema_version', '0']])).toMatchObject({ status: 'older' });
    expect(readSchemaVersion([['schema_version', 'zwei']])).toMatchObject({ status: 'unreadable', value: 'zwei' });
    expect(readSchemaVersion(null)).toEqual({ status: 'none' });
  });
  it('a broken optional tab never stops the words from syncing', async () => {
    const ad = new SheetAdapter(new MemoryStore(), () => T0);
    const words = { label: 'w', read: async () => [['word', 'article', 'meaning'], ['Fenster', 'das', 'window']] };
    const broken = { label: 'x', read: async () => { throw new Error('http_404'); } };
    const res = await ad.sync(words, { inbox: broken, meta: broken });
    expect(res.ok).toBe(true);
    const snap = await ad.load();
    expect(snap.words).toHaveLength(1);
    expect(snap.source!.inbox).toEqual({ ok: false, problem: 'unreachable' });
    expect(snap.source!.schema).toEqual({ status: 'none' });
  });
});
