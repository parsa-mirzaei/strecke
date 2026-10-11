/**
 * The sheet contract (docs/SHEET_SCHEMA.md, version 1): how a raw table from the learner's Google Sheet
 * becomes clean word rows. Tolerant on purpose: rows are partly machine-written, so headers may be renamed
 * or reordered, cells may carry stray whitespace or capitalisation, and one bad row never stops the rest.
 *
 * Nothing here invents content. A cell that breaks a rule is dropped (with a note), never repaired into
 * something the learner did not write; a row without a German word or a meaning is skipped (with a note).
 * The app only reads the sheet, so it can never overwrite a cell the learner wrote.
 *
 * Round 4 (PORT_MAP feature C) merged in: a `word`-only header, the optional columns `source`, `added`,
 * `verified`, `level` and a free-text `id`, the aliases of the Round 4 contract, and notes as codes that
 * the interface translates.
 */
import { formCount, recordProblems } from '../record.ts';
import { ARTICLES, DOMAINS, POS, TIERS, type Row } from '../schema.ts';
import { clean, contentProblems, coreCellProblems } from '../text.ts';

/** Version of this contract. A sheet can state its own in an optional `Meta` tab (`schema_version`). */
export const SCHEMA_VERSION = 1;

/** Canonical columns the app understands, in documentation order. */
export const SHEET_COLUMNS = [
  'word_id', 'de', 'article', 'plural', 'en', 'pos', 'tier', 'domain', 'family',
  'example_de', 'example_en', 'example_form', 'example_2_de', 'example_2_en', 'example_2_form',
  'collocation', 'prep', 'note', 'wrong_1', 'wrong_2', 'level', 'source', 'added', 'verified', 'status', 'start_stage',
] as const;
export type SheetColumn = (typeof SHEET_COLUMNS)[number];

/** Only the word column is required for a sheet to be read; a row also needs a meaning to be practised. */
export const REQUIRED: readonly SheetColumn[] = ['de'];

/** Header aliases (folded: lower case, umlauts as ae/oe/ue/ss, no spaces or punctuation). First match wins. */
export const ALIASES: Record<SheetColumn, readonly string[]> = {
  word_id: ['wordid', 'id', 'wortid', 'key', 'schluessel'],
  de: ['de', 'wort', 'word', 'lemma', 'deutsch', 'german', 'begriff', 'headword', 'ausdruck', 'vokabel', 'vocabulary', 'term', 'front'],
  article: ['article', 'artikel', 'genus', 'gender', 'art', 'geschlecht'],
  plural: ['plural', 'mehrzahl', 'pl', 'pluralform'],
  en: ['en', 'english', 'englisch', 'meaning', 'bedeutung', 'translation', 'uebersetzung', 'definition', 'gloss', 'back'],
  pos: ['pos', 'wortart', 'partofspeech', 'type', 'typ', 'class', 'wordclass', 'wordtype'],
  tier: ['tier'],
  domain: ['domain', 'thema', 'topic', 'tag', 'tags', 'situation', 'bereich', 'category', 'kategorie'],
  family: ['family', 'familie', 'wortfamilie'],
  example_de: ['examplede', 'example', 'beispiel', 'beispielsatz', 'example1', 'example1de', 'satz', 'sentence', 'examplesentence'],
  example_en: ['exampleen', 'example1en', 'beispieluebersetzung', 'exampletranslation', 'satzuebersetzung', 'sentencetranslation', 'beispielen',
    'exampleenglish', 'examplemeaning', 'uebersetzungbeispiel', 'beispielenglisch', 'example1translation'],
  example_form: ['exampleform', 'example1form', 'form', 'beispielform', 'wordform', 'forminexample', 'formimbeispiel'],
  example_2_de: ['example2de', 'example2', 'beispiel2', 'beispielsatz2', 'satz2', 'sentence2', 'secondexample', 'zweitesbeispiel'],
  example_2_en: ['example2en', 'beispiel2uebersetzung', 'example2translation', 'beispiel2en'],
  example_2_form: ['example2form', 'form2', 'beispiel2form'],
  collocation: ['collocation', 'kollokation', 'wortverbindung', 'combination', 'verbindung', 'wendung'],
  prep: ['prep', 'praeposition', 'preposition', 'praep'],
  note: ['note', 'notes', 'notiz', 'notizen', 'hinweis', 'comment', 'kommentar', 'anmerkung', 'grammar', 'grammatik', 'usage'],
  wrong_1: ['wrong1', 'falsch1', 'distractor1'],
  wrong_2: ['wrong2', 'falsch2', 'distractor2'],
  level: ['level', 'niveau', 'stufe', 'cefr', 'ger'],
  source: ['source', 'quelle', 'addedby', 'origin', 'herkunft'],
  added: ['added', 'dateadded', 'addedon', 'date', 'datum', 'hinzugefuegt', 'created', 'erstellt'],
  verified: ['verified', 'checked', 'geprueft', 'ok'],
  status: ['status'],
  start_stage: ['startstage'],
};

export function foldHeader(h: string): string {
  return clean(h).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
}

const ALIAS_INDEX = new Map<string, SheetColumn>();
for (const c of SHEET_COLUMNS) for (const a of [foldHeader(c), ...ALIASES[c]]) if (!ALIAS_INDEX.has(a)) ALIAS_INDEX.set(a, c);

export interface HeaderMap {
  /** Column index → canonical column. */
  columns: Map<number, SheetColumn>;
  /** Headers the app does not use; kept in the sheet, ignored here. */
  unknown: string[];
  /** Canonical columns that appear twice; the first one wins. */
  repeated: SheetColumn[];
  missingRequired: SheetColumn[];
}

/** Map a header row to canonical columns: any order, aliases, case and spacing tolerated. */
export function mapHeader(header: readonly string[]): HeaderMap {
  const columns = new Map<number, SheetColumn>();
  const seen = new Set<SheetColumn>();
  const unknown: string[] = [], repeated: SheetColumn[] = [];
  header.forEach((h, i) => {
    let c = ALIAS_INDEX.get(foldHeader(h));
    if (!c) { if (clean(h)) unknown.push(clean(h)); return; }
    // "Bedeutung | Beispielsatz | Übersetzung": a second meaning-like column is the example's translation.
    if (c === 'en' && seen.has('en') && !seen.has('example_en') && /uebersetzung|translation/.test(foldHeader(h))) c = 'example_en';
    if (seen.has(c)) { repeated.push(c); return; }
    seen.add(c);
    columns.set(i, c);
  });
  return { columns, unknown, repeated, missingRequired: REQUIRED.filter((c) => !seen.has(c)) };
}

/** The first of the top rows that names a word column is the header (tolerates a title row above it). */
export function findHeader(table: readonly (readonly string[])[], scan = 5): number {
  for (let i = 0; i < Math.min(scan, table.length); i++) if (!mapHeader(table[i]!).missingRequired.length) return i;
  return -1;
}

// ---------------------------------------------------------------- notes (codes; the UI words them)

export type NoteCode =
  | 'missing_word' | 'missing_meaning' | 'article_missing' | 'unknown_value' | 'cell_dropped' | 'translation_missing' | 'unsafe_word';

/** One note about a row. `column` is a canonical column; `reason` a record-rule reason (too_long, url, …). */
export interface Note { code: NoteCode; column?: SheetColumn; value?: string; reason?: string }

const noteKey = (n: Note) => `${n.code}|${n.column ?? ''}|${n.value ?? ''}|${n.reason ?? ''}`;

// ---------------------------------------------------------------- values

const DOMAIN_ALIASES: Record<string, (typeof DOMAINS)[number]> = {
  arbeit: 'arbeit', job: 'arbeit', work: 'arbeit', beruf: 'arbeit', buero: 'arbeit',
  uni: 'uni', universitaet: 'uni', studium: 'uni', university: 'uni', study: 'uni',
  amt: 'amt', behoerde: 'amt', buerokratie: 'amt', admin: 'amt', office: 'amt',
  alltag: 'alltag', everyday: 'alltag', daily: 'alltag', leben: 'alltag',
  smalltalk: 'smalltalk', gespraeche: 'smalltalk', gespraech: 'smalltalk', chat: 'smalltalk', conversation: 'smalltalk',
};
const POS_ALIASES: Record<string, (typeof POS)[number]> = {
  noun: 'noun', nomen: 'noun', substantiv: 'noun', n: 'noun',
  verb: 'verb', v: 'verb', verben: 'verb',
  adj: 'adj', adjective: 'adj', adjektiv: 'adj', adverb: 'adj', adv: 'adj',
  phrase: 'phrase', chunk: 'phrase', ausdruck: 'phrase', redewendung: 'phrase', satz: 'phrase', sentence: 'phrase', expression: 'phrase',
};
const ARTICLE_ALIASES: Record<string, (typeof ARTICLES)[number]> = {
  m: 'der', masc: 'der', maskulin: 'der', masculine: 'der', f: 'die', fem: 'die', feminin: 'die', feminine: 'die',
  n: 'das', neut: 'das', neutrum: 'das', neuter: 'das',
};
const SOURCE_ALIASES: Record<string, 'agent' | 'me'> = {
  agent: 'agent', ai: 'agent', ki: 'agent', claude: 'agent', chatgpt: 'agent', assistant: 'agent', bot: 'agent',
  me: 'me', ich: 'me', manual: 'me', selbst: 'me', self: 'me', mine: 'me',
};
const YES = new Set(['yes', 'y', 'ja', 'j', 'true', '1', 'x', 'ok']);
const NO = new Set(['no', 'n', 'nein', 'false', '0']);

/** A date as YYYY-MM-DD, from ISO or DD.MM.YYYY; '' when unreadable. */
export function normDate(v: string): string {
  const s = clean(v);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  return '';
}

/**
 * Word class when the sheet leaves it empty. Only cheap, safe signals; the guess is noted, never hidden:
 * an article → noun; several words or final punctuation → phrase; "sich …" or a lower-case word in -en/-ern/-eln → verb;
 * another lower-case single word → adjective; a capitalised single word → noun (article missing).
 */
export function guessPos(de: string, article: string): (typeof POS)[number] {
  const d = clean(de);
  if (article) return 'noun';
  if (/^sich\s+\S+$/i.test(d)) return 'verb';
  if (/\s/.test(d) || /[.!?…]$/.test(d)) return 'phrase';
  if (/^\p{Lu}/u.test(d)) return 'noun';
  if (/(en|ern|eln)$/.test(d)) return 'verb';
  return 'adj';
}

export interface CleanRow {
  /** Canonical columns, cleaned; empty string when absent. */
  row: Row;
  /** Notes for Settings › Data; empty when the row is fine. */
  notes: Note[];
  /** The row cannot be used at all (no German word or no meaning). */
  skip: boolean;
}

/** Paired columns: dropping one drops its partners, so an example never loses its translation alone. */
const GROUPS: Record<string, string[]> = {
  example_de: ['example_de', 'example_en', 'example_form', 'example_2_de', 'example_2_en', 'example_2_form'],
  example_en: ['example_de', 'example_en', 'example_form', 'example_2_de', 'example_2_en', 'example_2_form'],
  example_form: ['example_de', 'example_en', 'example_form', 'example_2_de', 'example_2_en', 'example_2_form'],
  example_2_de: ['example_2_de', 'example_2_en', 'example_2_form'],
  example_2_en: ['example_2_de', 'example_2_en', 'example_2_form'],
  example_2_form: ['example_2_de', 'example_2_en', 'example_2_form'],
};

/** Sentences may be longer in the learner's own sheet than in agent rows; the card scrolls. */
const SHEET_MAX_SENTENCE_WORDS = 30;
const SHEET_MAX_CHARS = 320;
const SHEET_LONG = new Set(['example_de', 'example_en', 'example_2_de', 'example_2_en', 'note', 'en', 'collocation', 'wrong_1', 'wrong_2']);
const LEVEL_MAX = 40;
/** A free-text id: what the identity is built from when present. */
export const FREE_ID_MAX = 64;

/**
 * One raw row → a clean row. Steps: map cells; normalise enums; infer what is cheap and safe (word class,
 * a split second example); then drop every cell the record rules reject, with a note.
 */
export function cleanRow(cells: readonly string[], map: HeaderMap): CleanRow {
  const row: Row = Object.fromEntries(SHEET_COLUMNS.map((c) => [c, '']));
  for (const [i, c] of map.columns) row[c] = clean(String(cells[i] ?? ''));
  const notes: Note[] = [];
  const add = (n: Note) => { if (!notes.some((x) => noteKey(x) === noteKey(n))) notes.push(n); };

  if (!row.de) return { row, notes: [{ code: 'missing_word' }], skip: true };
  if (!row.en) return { row, notes: [{ code: 'missing_meaning' }], skip: true };

  // An article typed into the word cell ("der Tisch") moves to the article column when that is empty.
  const lead = /^(der|die|das)\s+(\p{Lu}\S*)$/u.exec(row.de!); // one noun only; phrases stay as written
  if (lead && !row.article) { row.article = lead[1]!; row.de = lead[2]!; }

  // Enums: case-insensitive, a few aliases; an unknown value is dropped with a note.
  const art = row.article!.toLowerCase();
  row.article = (ARTICLES as readonly string[]).includes(art) ? art : ARTICLE_ALIASES[art.replace(/[^a-z]/g, '')] ?? '';
  if (art && !row.article) add({ code: 'unknown_value', column: 'article', value: art });
  const posIn = row.pos!.toLowerCase().replace(/[^a-zäöü]/g, '');
  row.pos = POS_ALIASES[posIn] ?? '';
  if (posIn && !row.pos) add({ code: 'unknown_value', column: 'pos', value: posIn });
  if (!row.pos) row.pos = guessPos(row.de!, row.article!);
  if (row.pos !== 'noun' && row.article) row.pos = 'noun';
  const dom = foldHeader(row.domain!);
  row.domain = (DOMAINS as readonly string[]).includes(dom) ? dom : DOMAIN_ALIASES[dom] ?? '';
  const tier = row.tier!.toLowerCase();
  row.tier = (TIERS as readonly string[]).includes(tier) ? tier : '';
  if (row.pos === 'phrase') row.tier = 'chunk';
  else if (row.tier === 'chunk') row.tier = 'core';
  row.prep = row.prep!.toLowerCase();
  const status = row.status!.toLowerCase();
  row.status = ['active', 'pending', 'rejected', 'suspended'].includes(status) ? status : 'active';
  row.start_stage = /^[0-2]$/.test(row.start_stage!) ? row.start_stage! : '';
  if (row.pos === 'noun' && !row.article) add({ code: 'article_missing', column: 'article' });

  // Round 4 columns: provenance and bookkeeping. Never required; a bad value is dropped with a note.
  if (row.source) {
    const s = SOURCE_ALIASES[foldHeader(row.source)];
    if (!s) add({ code: 'unknown_value', column: 'source', value: row.source.slice(0, 20) });
    row.source = s ?? '';
  }
  if (row.added) {
    const d = normDate(row.added);
    if (!d) add({ code: 'unknown_value', column: 'added', value: row.added.slice(0, 20) });
    row.added = d;
  }
  if (row.verified) {
    const v = row.verified.toLowerCase();
    row.verified = YES.has(v) ? 'yes' : NO.has(v) ? 'no' : '';
    if (!row.verified) add({ code: 'unknown_value', column: 'verified', value: v.slice(0, 20) });
  }
  // `level` is free text, never validated against a list; only the cell safety rules apply.
  // An id is only ever compared, never shown on a card: the cell safety rules apply, not the text rules.
  for (const c of ['level', 'word_id'] as const) {
    const probs = !row[c] ? [] : c === 'level' ? contentProblems(row[c]!.replace(/[+*#]/g, ''), LEVEL_MAX) // "A2+" is a level
      : [...coreCellProblems(row[c]!, FREE_ID_MAX), ...(/^[\p{L}\p{N}_.:\-# ]+$/u.test(row[c]!) ? [] : ['charset' as const])];
    if (probs.length) { add({ code: 'cell_dropped', column: c, reason: probs[0] }); row[c] = ''; }
  }

  // Two examples in one cell (line break or " | "): the second becomes example 2 if that is empty.
  for (const [a, b] of [['example_de', 'example_2_de'], ['example_en', 'example_2_en']] as const) {
    const parts = String(cells[[...map.columns].find(([, c]) => c === a)?.[0] ?? -1] ?? '').split(/\r?\n|\s\|\s/).map(clean).filter(Boolean);
    if (parts.length > 1 && !row[b]) { row[a] = parts[0]!; row[b] = parts[1]!; }
  }

  // Drop what the record rules reject, column by column, until nothing is left to drop.
  for (let pass = 0; pass < 8; pass++) {
    const probs = recordProblems(row).filter((p) => {
      if (p.startsWith('too_many_words')) return false;
      // The learner's own sentences, notes and meanings may be longer than agent rows; the card scrolls.
      const [r, c] = p.split(':');
      return !(r === 'too_long' && c && SHEET_LONG.has(c) && row[c]!.length <= SHEET_MAX_CHARS);
    });
    const longs = ['example_de', 'example_2_de'].filter((c) => row[c] && clean(row[c]!).split(' ').length > SHEET_MAX_SENTENCE_WORDS);
    const all = [...probs, ...longs.map((c) => `too_many_words:${c}`)];
    if (!all.length) break;
    let dropped = false;
    for (const p of all) {
      const [reason, column] = p.split(':') as [string, SheetColumn | undefined];
      if (!column) {
        if (reason === 'noun_without_article' || reason === 'missing') continue;
        if (reason === 'chunk_must_be_phrase' || reason === 'phrase_must_be_chunk') { row.tier = 'chunk'; continue; }
        if (reason === 'plural_on_non_noun') { row.plural = ''; add({ code: 'cell_dropped', column: 'plural', reason }); dropped = true; continue; }
        if (reason === 'article_on_non_noun') { row.article = ''; dropped = true; continue; }
        if (reason === 'second_example_without_first') { for (const c of GROUPS.example_2_de!) row[c] = ''; add({ code: 'cell_dropped', column: 'example_2_de', reason }); dropped = true; continue; }
        if (reason === 'examples_identical') { for (const c of GROUPS.example_2_de!) row[c] = ''; dropped = true; continue; }
        if (reason === 'distractor_equals_answer' || reason === 'distractors_identical') { row.wrong_1 = ''; row.wrong_2 = ''; dropped = true; continue; }
        continue;
      }
      if (column === 'de' || column === 'en') {
        if (reason === 'missing') continue;
        return { row, notes: [{ code: 'unsafe_word', column, reason }], skip: true };
      }
      if (column === 'pos') { row.pos = guessPos(row.de!, row.article!); continue; }
      if (reason === 'missing' && (column === 'example_en' || column === 'example_2_en')) {
        // An example without translation is still a usable sentence for the German-only exercises.
        add({ code: 'translation_missing', column });
        row[column] = '…';
        dropped = true;
        continue;
      }
      const cols = GROUPS[column] ?? [column];
      if (cols.every((c) => !row[c])) continue;
      for (const c of cols) row[c] = '';
      add({ code: 'cell_dropped', column, reason });
      dropped = true;
    }
    if (!dropped) break;
  }
  // The placeholder translation is not content: clear it again (record rules accept empty translations here).
  for (const c of ['example_en', 'example_2_en']) if (row[c] === '…') row[c] = '';
  if (row.example_de && row.example_form && formCount(row.example_de, row.example_form) !== 1) row.example_form = '';
  return { row, notes, skip: false };
}
