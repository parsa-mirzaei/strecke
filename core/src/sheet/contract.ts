/**
 * The sheet contract (docs/SHEET_SCHEMA.md): how a raw table from the learner's Google Sheet becomes
 * clean word rows. Tolerant on purpose: rows are partly machine-written, so headers may be renamed or
 * reordered, cells may carry stray whitespace or capitalisation, and one bad row never stops the rest.
 *
 * Nothing here invents content. A cell that breaks a rule is dropped (with a note), never repaired into
 * something the learner did not write; a row without a German word or a meaning is skipped (with a note).
 */
import { formCount, recordProblems } from '../record.ts';
import { ARTICLES, DOMAINS, POS, TIERS, type Row } from '../schema.ts';
import { clean } from '../text.ts';

/** Canonical columns the app understands, in documentation order. */
export const SHEET_COLUMNS = [
  'word_id', 'de', 'article', 'plural', 'en', 'pos', 'tier', 'domain', 'family',
  'example_de', 'example_en', 'example_form', 'example_2_de', 'example_2_en', 'example_2_form',
  'collocation', 'prep', 'note', 'wrong_1', 'wrong_2', 'status', 'start_stage',
] as const;
export type SheetColumn = (typeof SHEET_COLUMNS)[number];

export const REQUIRED: readonly SheetColumn[] = ['de', 'en'];

/** Header aliases (folded: lower case, umlauts kept as ae/oe/ue/ss, no spaces or punctuation). */
export const ALIASES: Record<SheetColumn, readonly string[]> = {
  word_id: ['wordid', 'id', 'wortid'],
  de: ['de', 'wort', 'word', 'lemma', 'deutsch', 'german', 'begriff', 'headword', 'ausdruck'],
  article: ['article', 'artikel', 'genus', 'gender', 'art'],
  plural: ['plural', 'mehrzahl', 'pl'],
  en: ['en', 'english', 'englisch', 'meaning', 'bedeutung', 'translation', 'uebersetzung', 'definition'],
  pos: ['pos', 'wortart', 'partofspeech', 'type', 'typ', 'class', 'wordclass'],
  tier: ['tier', 'stufe'],
  domain: ['domain', 'thema', 'topic', 'tag', 'tags', 'situation', 'bereich', 'category', 'kategorie'],
  family: ['family', 'familie', 'wortfamilie'],
  example_de: ['examplede', 'example', 'beispiel', 'beispielsatz', 'example1', 'example1de', 'satz', 'sentence', 'examplesentence'],
  example_en: ['exampleen', 'example1en', 'beispieluebersetzung', 'exampletranslation', 'satzuebersetzung', 'sentencetranslation', 'beispielen'],
  example_form: ['exampleform', 'example1form', 'form', 'beispielform'],
  example_2_de: ['example2de', 'example2', 'beispiel2', 'beispielsatz2', 'satz2', 'sentence2'],
  example_2_en: ['example2en', 'beispiel2uebersetzung', 'example2translation', 'beispiel2en'],
  example_2_form: ['example2form', 'form2', 'beispiel2form'],
  collocation: ['collocation', 'kollokation', 'wortverbindung'],
  prep: ['prep', 'praeposition', 'preposition', 'praep'],
  note: ['note', 'notes', 'notiz', 'notizen', 'hinweis', 'comment', 'kommentar'],
  wrong_1: ['wrong1', 'falsch1', 'distractor1'],
  wrong_2: ['wrong2', 'falsch2', 'distractor2'],
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

/** The first row that contains both required columns is the header (tolerates a title row above it). */
export function findHeader(table: readonly (readonly string[])[], scan = 5): number {
  for (let i = 0; i < Math.min(scan, table.length); i++) if (!mapHeader(table[i]!).missingRequired.length) return i;
  return -1;
}

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
  /** Short reasons in plain German for Settings > Daten; empty when the row is fine. */
  notes: string[];
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

const NOTE: Record<string, string> = {
  example_de: 'Beispielsatz', example_en: 'Übersetzung des Beispiels', example_form: 'Form im Beispiel', example_2_de: 'zweiter Beispielsatz',
  example_2_en: 'Übersetzung des zweiten Beispiels', example_2_form: 'Form im zweiten Beispiel', plural: 'Mehrzahl', article: 'Artikel',
  collocation: 'Wortverbindung', prep: 'Präposition', note: 'Notiz', wrong_1: 'falsche Antwort 1', wrong_2: 'falsche Antwort 2',
  domain: 'Thema', tier: 'Stufe', pos: 'Wortart', family: 'Wortfamilie', de: 'deutsches Wort', en: 'Bedeutung',
};

const WHY: Record<string, string> = {
  missing: 'fehlt', too_long: 'zu lang', charset: 'enthält Zeichen, die die App nicht anzeigt', url: 'enthält einen Link',
  formula_prefix: 'beginnt wie eine Formel', instruction_like: 'sieht nach einer Anweisung aus', control_char: 'enthält Steuerzeichen',
  invisible_char: 'enthält unsichtbare Zeichen', form_not_in_example: 'Wort kommt im Satz nicht vor', form_repeated_in_example: 'Wort kommt im Satz mehrfach vor',
  too_many_words: 'Satz ist sehr lang', bad_enum: 'unbekannter Wert', gap_in_example: 'enthält eine Lücke ___', no_letters: 'enthält keine Buchstaben',
  distractor_equals_answer: 'gleich der richtigen Antwort', second_example_without_first: 'ohne ersten Beispielsatz',
  translation_without_example: 'Übersetzung ohne Satz', form_without_example: 'Form ohne Satz',
};

/** Sentences may be longer in the learner's own sheet than in agent rows; the card scrolls. */
const SHEET_MAX_SENTENCE_WORDS = 30;
const SHEET_MAX_CHARS = 320;
const SHEET_LONG = new Set(['example_de', 'example_en', 'example_2_de', 'example_2_en', 'note', 'en', 'collocation', 'wrong_1', 'wrong_2']);

/**
 * One raw row → a clean row. Steps: map cells; normalise enums; infer what is cheap and safe (word class,
 * a split second example); then drop every cell the record rules reject, with a note.
 */
export function cleanRow(cells: readonly string[], map: HeaderMap): CleanRow {
  const row: Row = Object.fromEntries(SHEET_COLUMNS.map((c) => [c, '']));
  for (const [i, c] of map.columns) row[c] = clean(String(cells[i] ?? ''));
  const notes: string[] = [];

  if (!row.de || !row.en) {
    const missing = [!row.de ? NOTE.de : '', !row.en ? NOTE.en : ''].filter(Boolean).join(' und ');
    return { row, notes: [`fehlt: ${missing}`], skip: true };
  }

  // Enums: case-insensitive, a few aliases; an unknown value is dropped with a note.
  const art = row.article!.toLowerCase();
  row.article = (ARTICLES as readonly string[]).includes(art) ? art : '';
  if (art && !row.article) notes.push(`Artikel „${art}“ unbekannt`);
  const posIn = row.pos!.toLowerCase().replace(/[^a-zäöü]/g, '');
  row.pos = POS_ALIASES[posIn] ?? '';
  if (posIn && !row.pos) notes.push(`Wortart „${posIn}“ unbekannt`);
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
  if (row.pos === 'noun' && !row.article) notes.push('Artikel fehlt');

  // Two examples in one cell (line break or " | "): the second becomes example 2 if that is empty.
  for (const [a, b] of [['example_de', 'example_2_de'], ['example_en', 'example_2_en']] as const) {
    const parts = String(cells[[...map.columns].find(([, c]) => c === a)?.[0] ?? -1] ?? '').split(/\r?\n|\s\|\s/).map(clean).filter(Boolean);
    if (parts.length > 1 && !row[b]) { row[a] = parts[0]!; row[b] = parts[1]!; }
  }
  // An example whose form is not given but appears inflected: leave it, the record rules decide below.

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
      const [reason, column] = p.split(':') as [string, string | undefined];
      if (!column) {
        if (reason === 'noun_without_article' || reason === 'missing') continue;
        if (reason === 'chunk_must_be_phrase') { row.tier = 'chunk'; continue; }
        if (reason === 'phrase_must_be_chunk') { row.tier = 'chunk'; continue; }
        if (reason === 'plural_on_non_noun') { row.plural = ''; notes.push('Mehrzahl ohne Nomen entfernt'); dropped = true; continue; }
        if (reason === 'article_on_non_noun') { row.article = ''; dropped = true; continue; }
        if (reason === 'second_example_without_first') { for (const c of GROUPS.example_2_de!) row[c] = ''; notes.push('zweiter Beispielsatz ohne ersten'); dropped = true; continue; }
        if (reason === 'examples_identical') { for (const c of GROUPS.example_2_de!) row[c] = ''; dropped = true; continue; }
        if (reason === 'distractor_equals_answer' || reason === 'distractors_identical') { row.wrong_1 = ''; row.wrong_2 = ''; dropped = true; continue; }
        continue;
      }
      if (column === 'de' || column === 'en') {
        if (reason === 'missing') continue;
        return { row, notes: [`${NOTE[column]}: ${WHY[reason] ?? reason}`], skip: true };
      }
      if (column === 'pos') { row.pos = guessPos(row.de!, row.article!); continue; }
      if (reason === 'missing' && (column === 'example_en' || column === 'example_2_en')) {
        // An example without translation is still a usable sentence for the German-only exercises.
        notes.push(`${NOTE[column]} fehlt`);
        row[column] = '…';
        dropped = true;
        continue;
      }
      const cols = GROUPS[column] ?? [column];
      if (cols.every((c) => !row[c])) continue;
      for (const c of cols) row[c] = '';
      notes.push(`${NOTE[column] ?? column} ${WHY[reason] ?? reason}: nicht verwendet`);
      dropped = true;
    }
    if (!dropped) break;
  }
  // The placeholder translation is not content: clear it again (record rules accept empty translations here).
  for (const c of ['example_en', 'example_2_en']) if (row[c] === '…') row[c] = '';
  if (row.example_de && row.example_form && formCount(row.example_de, row.example_form) !== 1) row.example_form = '';
  return { row, notes: [...new Set(notes)], skip: false };
}
