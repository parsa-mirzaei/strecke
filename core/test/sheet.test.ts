import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/data/adapter.ts';
import { SheetAdapter, type TableSource } from '../src/data/sheet.ts';
import { exercisesFor } from '../src/exercises.ts';
import { replay, type LearnEvent } from '../src/scheduler.ts';
import { cleanRow, findHeader, guessPos, mapHeader } from '../src/sheet/contract.ts';
import { ingest, introductionOrder, type Library } from '../src/sheet/ingest.ts';

const T0 = Date.parse('2026-10-09T08:00:00Z');
const H = ['de', 'article', 'plural', 'en', 'pos', 'domain', 'example_de', 'example_en'];
const termin = ['Termin', 'der', 'Termine', 'appointment', 'noun', 'amt', 'Ich habe morgen einen Termin.', 'I have an appointment tomorrow.'];
const rechnung = ['Rechnung', 'die', 'Rechnungen', 'bill', 'noun', 'alltag', 'Die Rechnung ist hoch.', 'The bill is high.'];
const abholen = ['abholen', '', '', 'to pick up', 'verb', 'alltag', 'Ich hole dich ab.', 'I pick you up.'];

const run = (lib: Library | null, table: string[][], now = T0) => ingest(lib, table, now);
const active = (lib: Library) => Object.values(lib.items).filter((x) => x.status === 'active');
const id = (lib: Library, de: string) => Object.values(lib.items).find((x) => x.row.de === de)!.id;

describe('sheet contract: headers', () => {
  it('any order, aliases, case, spacing, umlauts', () => {
    const m = mapHeader(['  Bedeutung ', 'WORT', 'Artikel', 'Mehrzahl', 'Beispielsatz', 'Beispiel 2', 'Präposition', 'Thema', 'Wortart']);
    expect([...m.columns.values()]).toEqual(['en', 'de', 'article', 'plural', 'example_de', 'example_2_de', 'prep', 'domain', 'pos']);
    expect(m.missingRequired).toEqual([]);
  });
  it('unknown columns are reported and ignored; a repeated column: the first wins', () => {
    const m = mapHeader(['de', 'en', 'Lernstand', 'Quelle', 'de']);
    expect(m.unknown).toEqual(['Lernstand', 'Quelle']);
    expect(m.repeated).toEqual(['de']);
    expect(m.columns.get(4)).toBeUndefined();
  });
  it('a title row above the header is tolerated; no de or en anywhere → no header', () => {
    expect(findHeader([['Meine Wörter'], ['', ''], H, termin])).toBe(2);
    expect(findHeader([['foo', 'bar'], ['1', '2']])).toBe(-1);
  });
});

describe('sheet contract: rows', () => {
  const m = mapHeader(H);
  it('trims, collapses whitespace, lower-cases enums', () => {
    const c = cleanRow(['  Termin ', 'DER', ' Termine', 'appointment  ', 'Noun', 'Amt', 'Ich  habe morgen einen Termin.', 'x'], m);
    expect([c.row.de, c.row.article, c.row.pos, c.row.domain, c.row.example_de]).toEqual(['Termin', 'der', 'noun', 'amt', 'Ich habe morgen einen Termin.']);
    expect(c.skip).toBe(false);
  });
  it('a row without German word or meaning is skipped, with a plain note', () => {
    const c = cleanRow(['Termin', 'der', '', '', '', '', '', ''], m);
    expect(c.skip).toBe(true);
    expect(c.notes[0]).toContain('Bedeutung');
  });
  it('empty optional cells are fine; a missing article on a noun is noted, not fatal', () => {
    const c = cleanRow(['Fenster', '', '', 'window', 'noun', '', '', ''], m);
    expect(c.skip).toBe(false);
    expect(c.notes).toContain('Artikel fehlt');
  });
  it('word class is guessed when empty, from cheap signals only', () => {
    expect(guessPos('Termin', 'der')).toBe('noun');
    expect(guessPos('Wie bitte?', '')).toBe('phrase');
    expect(guessPos('sich kümmern', '')).toBe('verb');
    expect(guessPos('abholen', '')).toBe('verb');
    expect(guessPos('pünktlich', '')).toBe('adj');
    expect(guessPos('Krankenkasse', '')).toBe('noun');
  });
  it('a broken example is dropped with a note; the word stays usable', () => {
    const c = cleanRow(['Termin', 'der', '', 'appointment', 'noun', '', 'Der Zug ist spät.', 'The train is late.'], m);
    expect(c.skip).toBe(false);
    expect(c.row.example_de).toBe('');
    expect(c.notes.join()).toContain('Wort kommt im Satz nicht vor');
  });
  it('unsafe cells (formula, link) are dropped; an unsafe German word skips the row', () => {
    expect(cleanRow(['Termin', 'der', '', 'appointment', 'noun', '', '=HYPERLINK("x")', 'y'], m).row.example_de).toBe('');
    expect(cleanRow(['=1+1', '', '', 'one', 'noun', '', '', ''], m).skip).toBe(true);
  });
  it('two examples in one cell (line break) become example 1 and 2', () => {
    const c = cleanRow(['Termin', 'der', '', 'appointment', 'noun', '', 'Ich habe einen Termin.\nDer Termin ist morgen.', 'I have an appointment.\nThe appointment is tomorrow.'], m);
    expect([c.row.example_de, c.row.example_2_de, c.row.example_2_en]).toEqual(['Ich habe einen Termin.', 'Der Termin ist morgen.', 'The appointment is tomorrow.']);
  });
  it('an example without translation still counts as a sentence', () => {
    const c = cleanRow(['Termin', 'der', '', 'appointment', 'noun', '', 'Ich habe einen Termin.', ''], m);
    expect(c.row.example_de).toBe('Ich habe einen Termin.');
    expect(c.notes.join()).toContain('fehlt');
  });
  it('long sentences of the learner are kept (up to 30 words)', () => {
    const long = `Ich habe ${'heute '.repeat(20)}einen Termin.`;
    expect(cleanRow(['Termin', 'der', '', 'appointment', 'noun', '', long, 'x'], m).row.example_de).toBe(long.replace(/\s+/g, ' ').trim());
  });
});

describe('ingestion and identity', () => {
  it('new rows enter as active items with deterministic ids', () => {
    const { library, report } = run(null, [H, termin, rechnung]);
    expect(report.added).toHaveLength(2);
    expect(active(library)).toHaveLength(2);
    const again = run(null, [H, rechnung, termin]).library;
    expect(id(again, 'Termin')).toBe(id(library, 'Termin'));
  });
  it('idempotent: the same table twice changes nothing', () => {
    const a = run(null, [H, termin, rechnung]).library;
    const b = run(a, [H, termin, rechnung], T0 + 1000);
    expect(b.report.changed).toBe(false);
    expect(b.report.unchanged).toBe(2);
    expect(b.library.items).toEqual(a.items);
  });
  it('reordered rows and columns: no change', () => {
    const a = run(null, [H, termin, rechnung, abholen]).library;
    const perm = [3, 0, 7, 6, 1, 2, 5, 4];
    const reorder = (r: string[]) => perm.map((i) => r[i]!);
    const b = run(a, [reorder(H), reorder(abholen), reorder(termin), reorder(rechnung)]);
    expect(b.report.changed).toBe(false);
  });
  it('edited row: same item, content replaced, SRS history kept', () => {
    const a = run(null, [H, termin]).library;
    const tid = id(a, 'Termin');
    const edited = [...termin]; edited[6] = 'Der Termin ist um neun.'; edited[7] = 'The appointment is at nine.';
    const b = run(a, [H, edited]);
    expect(b.report.updated).toEqual([tid]);
    expect(b.library.items[tid]!.row.example_de).toBe('Der Termin ist um neun.');
  });
  it('meaning edited: still the same item when it is the only candidate', () => {
    const a = run(null, [H, termin]).library;
    const edited = [...termin]; edited[3] = 'appointment, date';
    const b = run(a, [H, edited]);
    expect(b.report.updated).toEqual([id(a, 'Termin')]);
    expect(b.report.added).toEqual([]);
  });
  it('headword typo fixed (≤ 2 edits, same meaning): same item, history kept', () => {
    const typo = [...termin]; typo[0] = 'Termn';
    const a = run(null, [H, typo]).library;
    const b = run(a, [H, termin]);
    expect(b.report.renamed).toEqual([id(a, 'Termn')]);
    expect(b.report.added).toEqual([]);
    expect(active(b.library)[0]!.row.de).toBe('Termin');
  });
  it('a different headword is a new item; the old one is archived', () => {
    const a = run(null, [H, termin]).library;
    const other = [...termin]; other[0] = 'Verabredung'; other[1] = 'die'; other[3] = 'date, meeting';
    const b = run(a, [H, other]);
    expect(b.report.added).toHaveLength(1);
    expect(b.report.archived).toEqual([id(a, 'Termin')]);
  });
  it('deleted row: archived, not dropped; restored with the same id when it comes back', () => {
    const a = run(null, [H, termin, rechnung]).library;
    const tid = id(a, 'Termin');
    const b = run(a, [H, rechnung]).library;
    expect(b.items[tid]!.status).toBe('archived');
    const c = run(b, [H, rechnung, termin]);
    expect(c.report.restored).toEqual([tid]);
    expect(c.library.items[tid]!.status).toBe('active');
  });
  it('homonyms (same word, other meaning) are two items; exact duplicates are reported and ignored', () => {
    const bank1 = ['Bank', 'die', 'Banken', 'bank', 'noun', 'amt', '', ''];
    const bank2 = ['Bank', 'die', 'Bänke', 'bench', 'noun', 'alltag', '', ''];
    const { library, report } = run(null, [H, bank1, bank2, bank1]);
    expect(active(library)).toHaveLength(2);
    expect(report.duplicates).toEqual([{ line: 4, de: 'Bank', firstLine: 2 }]);
  });
  it('adding a homonym later does not move the first word', () => {
    const bank1 = ['Bank', 'die', 'Banken', 'bank', 'noun', 'amt', '', ''];
    const a = run(null, [H, bank1]).library;
    const first = id(a, 'Bank');
    const b = run(a, [H, ['Bank', 'die', 'Bänke', 'bench', 'noun', '', '', ''], bank1]).library;
    expect(b.items[first]!.row.en).toBe('bank');
    expect(active(b)).toHaveLength(2);
  });
  it('an id column, when present, is the identity (even if the word changes)', () => {
    const HI = ['word_id', ...H];
    const a = run(null, [HI, ['w_abcdefgh', ...termin]]).library;
    expect(Object.keys(a.items)).toEqual(['w_abcdefgh']);
    const renamed = ['w_abcdefgh', 'Verabredung', 'die', '', 'date', 'noun', '', '', ''];
    const b = run(a, [HI, renamed]);
    expect(b.report.updated).toEqual(['w_abcdefgh']);
  });
  it('one bad row never stops the sync', () => {
    const { library, report } = run(null, [H, termin, ['', '', '', '', '', '', '', ''], ['Nur Wort', '', '', '', '', '', '', ''], rechnung]);
    expect(active(library)).toHaveLength(2);
    expect(report.issues.filter((i) => i.skipped)).toHaveLength(1);
  });
  it('a table without a usable header leaves the library untouched', () => {
    const a = run(null, [H, termin]).library;
    const b = run(a, [['foo', 'bar'], ['1', '2']]);
    expect(b.report.ok).toBe(false);
    expect(b.library).toEqual(a);
  });
  it('rejected and pending rows stay out of practice', () => {
    const HS = [...H, 'status'];
    const { library } = run(null, [HS, [...termin, 'rejected'], [...rechnung, 'pending'], [...abholen, 'ACTIVE']]);
    expect(active(library).map((x) => x.row.de)).toEqual(['abholen']);
  });
  it('new words are introduced oldest-added first, then in sheet order', () => {
    const a = run(null, [H, rechnung, termin], T0).library;
    const b = run(a, [H, abholen, rechnung, termin], T0 + 1000).library;
    expect(introductionOrder(b).map((x) => x.row.de)).toEqual(['Rechnung', 'Termin', 'abholen']);
  });
});

describe('sheet adapter', () => {
  const src = (table: string[][] | Error): TableSource => ({ label: 'test', read: async () => { if (table instanceof Error) throw table; return table; } });
  const ev = (wordId: string, n: number): LearnEvent => ({ id: `e_t${String(n).padStart(7, '0')}`, ts: T0 + n * 60_000, wordId, kind: 'review', exercise: 'luecke', correct: true, ms: 1000, help: false, dontKnow: false });

  it('sync failure keeps the last good library and practice goes on', async () => {
    const a = new SheetAdapter(new MemoryStore(), () => T0);
    await a.sync(src([H, termin, rechnung]));
    const r = await a.sync(src(new Error('offline')));
    expect(r.ok).toBe(false);
    const snap = await a.load();
    expect(snap.words).toHaveLength(2);
    expect(snap.source!.lastError).toBe('offline');
  });
  it('a column added later unlocks exercises without resetting the word state', async () => {
    const a = new SheetAdapter(new MemoryStore(), () => T0);
    await a.sync(src([['de', 'article', 'en', 'pos'], ['Termin', 'der', 'appointment', 'noun'], ['Rechnung', 'die', 'bill', 'noun'], ['Ausweis', 'der', 'ID card', 'noun']]));
    const s1 = await a.load();
    const w = s1.words.find((x) => x.de === 'Termin')!;
    await a.appendEvents([ev(w.id, 1), ev(w.id, 2)]);
    const before = replay(s1.words, (await a.load()).events).get(w.id)!;
    expect(exercisesFor(w, s1.words, { extended: true }).map((x) => x.type)).not.toContain('plural');
    await a.sync(src([['de', 'article', 'plural', 'en', 'pos'], ['Termin', 'der', 'Termine', 'appointment', 'noun'], ['Rechnung', 'die', 'Rechnungen', 'bill', 'noun'], ['Ausweis', 'der', 'Ausweise', 'ID card', 'noun']]));
    const s2 = await a.load();
    const w2 = s2.words.find((x) => x.de === 'Termin')!;
    expect(w2.id).toBe(w.id);
    expect(exercisesFor(w2, s2.words, { extended: true }).map((x) => x.type)).toContain('plural');
    const after = replay(s2.words, s2.events).get(w.id)!;
    expect([after.stage, after.memory, after.reps]).toEqual([before.stage, before.memory, before.reps]);
  });
  it('archived words keep their events but are not practised', async () => {
    const a = new SheetAdapter(new MemoryStore(), () => T0);
    await a.sync(src([H, termin, rechnung]));
    const w = (await a.load()).words.find((x) => x.de === 'Termin')!;
    await a.appendEvents([ev(w.id, 1)]);
    await a.sync(src([H, rechnung]));
    const s = await a.load();
    expect(s.words.map((x) => x.de)).toEqual(['Rechnung']);
    expect(s.events.map((e) => e.wordId)).toEqual([w.id]);
    expect(s.source!.archived).toBe(1);
  });
});
