import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { toCsv } from '../src/csv.ts';
import { exercisesFor } from '../src/exercises.ts';
import { mapHeaders, normHeader, SCHEMA_VERSION, WORDS_ALIASES, WORDS_COLUMNS } from '../src/sheet/contract.ts';
import { parsePublishedLink, parseSheetReference } from '../src/sheet/link.ts';
import { diffRows, guessPos, lemmaKey, parseWordsCsv, rowKey } from '../src/sheet/parse.ts';
import { parseInboxCsv, readSchemaVersion } from '../src/sheet/tabs.ts';

const csv = (rows: string[][]) => toCsv(rows);
const ok = (text: string) => {
  const p = parseWordsCsv(text);
  if (!p.ok) throw new Error(p.problem);
  return p;
};

describe('headers', () => {
  it('maps English, German and spaced/underscored names; ignores extra columns', () => {
    const h = mapHeaders(['Wort', 'Bedeutung', 'Artikel', 'Example (EN)', 'my notes', 'Beispielsatz', 'POS'], WORDS_ALIASES);
    expect(h.index).toMatchObject({ word: 0, meaning: 1, article: 2, example_translation: 3, example: 5, pos: 6 });
    expect(h.unknown).toEqual(['my notes']);
  });

  it('every canonical column maps to itself', () => {
    const h = mapHeaders([...WORDS_COLUMNS], WORDS_ALIASES);
    expect(Object.keys(h.index).sort()).toEqual([...WORDS_COLUMNS].sort());
  });

  it('a repeated column keeps the first one', () => {
    const h = mapHeaders(['word', 'meaning', 'English'], WORDS_ALIASES);
    expect(h.index.meaning).toBe(1);
    expect(h.repeated).toEqual(['English']);
  });

  it('normalises umlauts and punctuation', () => {
    expect(normHeader('Übersetzung (Beispiel)')).toBe('uebersetzungbeispiel');
    expect(normHeader('example_2_translation')).toBe(normHeader('Example 2 translation'));
  });
});

describe('any sheet with a word column works', () => {
  it('two columns, any order', () => {
    const p = ok(csv([['meaning', 'word'], ['window', 'Fenster'], ['to pick up', 'abholen']]));
    expect(p.usable).toBe(2);
    expect(p.rows[0]!.record).toMatchObject({ de: 'Fenster', en: 'window', pos: 'noun' });
    expect(p.rows[1]!.record).toMatchObject({ de: 'abholen', pos: 'verb' });
    expect(exercisesFor(p.rows[0]!.record!, p.rows.map((r) => r.record!)).map((x) => x.type)).toContain('karte');
  });

  it('only a word column: rows are listed as needing a meaning, nothing breaks', () => {
    const p = ok(csv([['word'], ['Schrank'], ['müde']]));
    expect(p.usable).toBe(0);
    expect(p.rows.map((r) => r.issues[0]!.code)).toEqual(['meaning_missing', 'meaning_missing']);
  });

  it('refuses text without a word column, HTML, and empty input, with a reason', () => {
    expect(parseWordsCsv(csv([['foo', 'bar'], ['a', 'b']]))).toEqual({ ok: false, problem: 'no_word_column' });
    expect(parseWordsCsv('<!DOCTYPE html><html>sign in</html>')).toEqual({ ok: false, problem: 'not_csv' });
    expect(parseWordsCsv('   ')).toEqual({ ok: false, problem: 'empty' });
    expect(parseWordsCsv('word\n"open quote')).toEqual({ ok: false, problem: 'not_csv' });
  });

  it('allows a title row above the header and skips empty rows', () => {
    const p = ok(csv([['My German words'], ['word', 'meaning'], ['', ''], ['Tisch', 'table']]));
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0]!.rowNumber).toBe(4);
  });

  it('reads the full template row into a full record', () => {
    const p = ok(csv([[...WORDS_COLUMNS], [
      'Haltestelle', 'die', 'Haltestellen', 'stop (bus, tram)', 'noun', 'alltag',
      'Wir steigen an der nächsten Haltestelle aus.', 'We get off at the next stop.', '',
      'Treffen wir uns an der Haltestelle?', 'Shall we meet at the stop?', '',
      'an der Haltestelle warten', 'an', '', 'station', 'ticket', 'A2', 'agent', '2026-10-11', 'no', '',
    ]]));
    const r = p.rows[0]!;
    expect(r.issues).toEqual([]);
    expect(r.record).toMatchObject({ de: 'Haltestelle', article: 'die', domain: 'alltag', prep: 'an', collocation: 'an der Haltestelle warten' });
    expect(r.record!.examples).toHaveLength(2);
    expect(r.meta).toEqual({ source: 'agent', added: '2026-10-11', verified: 'no', level: 'A2', topic: 'alltag' });
  });
});

describe('tolerant reading of cells', () => {
  it('accepts article spellings and an article inside the word cell', () => {
    const p = ok(csv([['word', 'meaning', 'article'], ['Tisch', 'table', 'm'], ['der Stuhl', 'chair', ''], ['Lampe', 'lamp', 'feminine']]));
    expect(p.rows.map((r) => [r.record!.de, r.record!.article])).toEqual([['Tisch', 'der'], ['Stuhl', 'der'], ['Lampe', 'die']]);
  });

  it('notes a noun without article neutrally, and still practises it', () => {
    const p = ok(csv([['word', 'meaning', 'article'], ['Schrank', 'wardrobe', '']]));
    expect(p.rows[0]!.issues).toEqual([{ code: 'article_missing', column: 'article' }]);
    expect(p.rows[0]!.record).not.toBeNull();
    expect(p.attention).toBe(1);
  });

  it('does not ask for articles in a sheet that has no article column', () => {
    expect(ok(csv([['word', 'meaning'], ['Schrank', 'wardrobe']])).rows[0]!.issues).toEqual([]);
  });

  it('drops an example that does not contain the word, keeps the row', () => {
    const p = ok(csv([['word', 'meaning', 'example'], ['Tisch', 'table', 'Der Stuhl ist neu.']]));
    expect(p.rows[0]!.issues.map((i) => i.code)).toEqual(['example_without_word']);
    expect(p.rows[0]!.record!.examples).toEqual([]);
  });

  it('maps topics to built-in situations and keeps any other label', () => {
    const p = ok(csv([['word', 'meaning', 'topic'], ['Tisch', 'table', 'Everyday'], ['Topf', 'pot', 'Küche']]));
    expect(p.rows.map((r) => [r.record!.domain, r.meta.topic])).toEqual([['alltag', 'Everyday'], ['', 'Küche']]);
  });

  it('level is free text, never validated', () => {
    const p = ok(csv([['word', 'meaning', 'level'], ['a', 'x', 'C2'], ['b', 'y', 'around my level'], ['c', 'z', 'A0?']]));
    expect(p.rows.map((r) => r.meta.level)).toEqual(['C2', 'around my level', 'A0?']);
    expect(p.attention).toBe(0);
  });

  it('strips invisible characters and notes it; refuses an overlong word', () => {
    const p = ok(csv([['word', 'meaning'], ['Ti​sch', 'table'], ['x'.repeat(90), 'long']]));
    expect(p.rows[0]!.record!.de).toBe('Tisch');
    expect(p.rows[0]!.issues.map((i) => i.code)).toEqual(['invisible_characters']);
    expect(p.rows[1]!.record).toBeNull();
  });

  it('reads German dates and source spellings', () => {
    const p = ok(csv([['word', 'meaning', 'added', 'source', 'verified'], ['a', 'x', '11.10.2026', 'Claude', 'ja'], ['b', 'y', 'gestern', 'ich', '']]));
    expect(p.rows.map((r) => r.meta)).toMatchObject([
      { added: '2026-10-11', source: 'agent', verified: 'yes' },
      { added: '', source: 'me', verified: '' },
    ]);
  });

  it('guesses the part of speech when none is given', () => {
    expect(['Tisch', 'abholen', 'müde', 'Wie geht’s?', 'sich freuen'].map((w) => guessPos(w, ''))).toEqual(['noun', 'verb', 'adj', 'phrase', 'verb']);
    expect(guessPos('Rechnung', 'die')).toBe('noun');
  });
});

describe('row identity and incremental sync', () => {
  const base = [['word', 'meaning', 'example'], ['Tisch', 'table', ''], ['Stuhl', 'chair', ''], ['müde', 'tired', '']];
  const first = ok(csv(base)).rows;

  it('content-derived key: case-insensitive, article-free, umlauts kept distinct', () => {
    expect(rowKey('der Tisch', '')).toBe(rowKey('Tisch', ''));
    expect(rowKey('TISCH', '')).toBe(rowKey('tisch', ''));
    expect(rowKey('schön', '')).not.toBe(rowKey('schon', ''));
    expect(rowKey('Tisch', 'w42')).toBe('id:w42');
    expect(lemmaKey('Das klingt gut.')).toBe('klingt gut');
  });

  it('a new row is added; a reordered sheet changes nothing', () => {
    const d1 = diffRows(first, ok(csv([...base, ['Lampe', 'lamp', '']])).rows);
    expect(d1).toMatchObject({ added: ['w:lampe'], changed: [], removed: [] });
    const reordered = [base[0]!, base[3]!, base[1]!, base[2]!];
    expect(diffRows(first, ok(csv(reordered)).rows)).toEqual({ added: [], changed: [], removed: [], unchanged: 3 });
  });

  it('an edited row keeps its identity (and so its progress)', () => {
    const edited = base.map((r) => (r[0] === 'Tisch' ? ['Tisch', 'table, desk', 'Der Tisch ist neu.'] : r));
    expect(diffRows(first, ok(csv(edited)).rows)).toMatchObject({ added: [], changed: ['w:tisch'], removed: [] });
  });

  it('filling in a missing article is an edit, not a new word', () => {
    const a = ok(csv([['word', 'meaning', 'article'], ['Tisch', 'table', '']])).rows;
    const b = ok(csv([['word', 'meaning', 'article'], ['Tisch', 'table', 'der']])).rows;
    expect(diffRows(a, b)).toMatchObject({ added: [], changed: ['w:tisch'] });
  });

  it('renaming a word without an id is a removal plus a new word; with an id it is an edit', () => {
    const renamed = base.map((r) => (r[0] === 'Stuhl' ? ['Sessel', 'armchair', ''] : r));
    expect(diffRows(first, ok(csv(renamed)).rows)).toMatchObject({ added: ['w:sessel'], removed: ['w:stuhl'] });
    const withId = (w: string) => ok(csv([['id', 'word', 'meaning'], ['7', w, 'chair']])).rows;
    expect(diffRows(withId('Stuhl'), withId('Sessel'))).toMatchObject({ added: [], changed: ['id:7'], removed: [] });
  });

  it('a deleted row is removed from practice', () => {
    expect(diffRows(first, ok(csv(base.slice(0, 3))).rows)).toMatchObject({ removed: ['w:müde'] });
  });

  it('a repeated word is kept once and the repeat is noted with the first row', () => {
    const p = ok(csv([['word', 'meaning'], ['Tisch', 'table'], ['der Tisch', 'table again']]));
    expect(p.usable).toBe(1);
    expect(p.rows[1]!.issues[0]).toEqual({ code: 'duplicate', firstRow: 2 });
  });

  it('extra and missing columns between reads do not change identities', () => {
    const wide = ok(csv([['notes', 'word', 'extra', 'meaning'], ['x', 'Tisch', 'y', 'table']])).rows;
    const narrow = ok(csv([['word', 'meaning'], ['Tisch', 'table']])).rows;
    expect(wide[0]!.key).toBe(narrow[0]!.key);
  });

  it('the same input always gives the same rows and hashes (idempotent)', () => {
    expect(ok(csv(base)).rows).toEqual(first);
  });
});

describe('optional tabs', () => {
  it('Inbox: counts waiting and processed words; tolerates a missing processed column', () => {
    const r = parseInboxCsv(csv([['Word', 'Note', 'Processed'], ['Kühlschrank', '', ''], ['Feierabend', 'heard at work', '2026-10-10'], ['', 'x', '']]));
    expect(r).toEqual({ ok: true, total: 2, waiting: 1, processed: 1, waitingWords: ['Kühlschrank'] });
    expect(parseInboxCsv(csv([['wort'], ['Tisch']]))).toMatchObject({ ok: true, waiting: 1 });
    expect(parseInboxCsv(csv([['foo'], ['x']]))).toEqual({ ok: false, problem: 'no_word_column' });
  });

  it('Meta: schema_version as key/value or as a header; none when missing', () => {
    expect(readSchemaVersion(csv([['key', 'value'], ['schema_version', String(SCHEMA_VERSION)]]))).toEqual({ status: 'same' });
    expect(readSchemaVersion(csv([['schema_version'], [String(SCHEMA_VERSION + 1)]]))).toEqual({ status: 'newer', sheet: SCHEMA_VERSION + 1, app: SCHEMA_VERSION });
    expect(readSchemaVersion(csv([['Schema version', '0']]))).toEqual({ status: 'older', sheet: 0, app: SCHEMA_VERSION });
    expect(readSchemaVersion(csv([['schema_version', 'two']]))).toEqual({ status: 'unreadable', value: 'two' });
    expect(readSchemaVersion(null)).toEqual({ status: 'none' });
    expect(readSchemaVersion(csv([['key', 'value'], ['owner', 'me']]))).toEqual({ status: 'none' });
  });
});

describe('links', () => {
  // Placeholder keys only; real sheet addresses never appear in the repo.
  const KEY = '2PACX-placeholderkey';

  it('accepts a published CSV link and keeps its tab', () => {
    const r = parsePublishedLink(`https://docs.google.com/spreadsheets/d/e/${KEY}/pub?gid=123&single=true&output=csv`);
    expect(r).toEqual({ ok: true, key: KEY, gid: '123', single: true, csvUrl: `https://docs.google.com/spreadsheets/d/e/${KEY}/pub?gid=123&single=true&output=csv` });
  });

  it('turns a published web-page link into its CSV form', () => {
    const r = parsePublishedLink(`docs.google.com/spreadsheets/d/e/${KEY}/pubhtml?gid=5&single=true`);
    expect(r.ok && r.csvUrl).toBe(`https://docs.google.com/spreadsheets/d/e/${KEY}/pub?gid=5&single=true&output=csv`);
    const t = parsePublishedLink(`https://docs.google.com/spreadsheets/d/e/${KEY}/pub?output=tsv`);
    expect(t.ok && t.csvUrl).toBe(`https://docs.google.com/spreadsheets/d/e/${KEY}/pub?output=csv`);
  });

  it("explains the sheet's own address and keeps its id as the reference", () => {
    expect(parsePublishedLink('https://docs.google.com/spreadsheets/d/abc123/edit#gid=77'))
      .toEqual({ ok: false, problem: 'edit_link', sheetId: 'abc123', gid: '77' });
  });

  it('refuses other links with a reason', () => {
    expect(parsePublishedLink('')).toEqual({ ok: false, problem: 'empty' });
    expect(parsePublishedLink('hello world')).toEqual({ ok: false, problem: 'not_a_link' });
    expect(parsePublishedLink('https://example.org/words.csv')).toEqual({ ok: false, problem: 'not_google_sheets' });
    expect(parsePublishedLink('https://docs.google.com/document/d/abc/edit')).toEqual({ ok: false, problem: 'not_google_sheets' });
  });

  it('reads a sheet reference for Fill my list', () => {
    expect(parseSheetReference('https://docs.google.com/spreadsheets/d/abc123/edit?usp=sharing')).toEqual({ ok: true, id: 'abc123', url: 'https://docs.google.com/spreadsheets/d/abc123/edit' });
    expect(parseSheetReference(`https://docs.google.com/spreadsheets/d/e/${KEY}/pub`)).toEqual({ ok: false });
    expect(parseSheetReference('my sheet')).toEqual({ ok: false });
  });
});

describe('template files (docs/template)', () => {
  const read = (f: string) => readFileSync(new URL(`../../docs/template/${f}`, import.meta.url), 'utf8');

  it('Words.csv has exactly the contract columns and its example row reads with no notes', () => {
    const p = ok(read('Words.csv'));
    expect(p.columns).toEqual([...WORDS_COLUMNS]);
    expect(p.unknownColumns).toEqual([]);
    expect(p.rows[0]!.issues).toEqual([]);
    expect(exercisesFor(p.rows[0]!.record!, [p.rows[0]!.record!]).map((x) => x.type)).toEqual(
      expect.arrayContaining(['karte', 'artikel', 'bedeutung', 'praeposition', 'tippen']), // Lücke needs other words' forms
    );
  });

  it('Inbox.csv and Meta.csv are read by the optional-tab readers', () => {
    expect(parseInboxCsv(read('Inbox.csv') + 'Kühlschrank,,\n')).toMatchObject({ ok: true, waiting: 1 });
    expect(readSchemaVersion(read('Meta.csv'))).toEqual({ status: 'same' });
  });
});
