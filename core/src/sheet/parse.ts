/**
 * Reading the learner's Words tab (DECISIONS D56). Pure: CSV text in, rows with records and neutral
 * notes out. Tolerant by design: any sheet with a `word` column works; columns can be reordered,
 * renamed (English/German aliases), extra, or missing; empty cells are fine.
 *
 * A row is **practised** when it has a word and a meaning. Everything else only adds exercises.
 * A problem in an optional cell drops that cell and adds a note ("needs attention"); the row is
 * still practised. Only a missing word or meaning, a repeated word, or an unreadable word keeps a
 * row out of practice. Notes are codes; the UI words them neutrally ("Row 12 · Schrank: article missing").
 *
 * Row identity (`key`): the `id` column when the row has one; otherwise derived from the word itself
 * (lemma, case-insensitive, umlauts kept distinct), never from the row number. See `rowKey`.
 * The app renders all sheet text as plain text, never as HTML.
 */
import { parseCsv } from '../csv.ts';
import { formCount, toWordRecord, type WordRecord } from '../record.ts';
import { PREPOSITIONS, type Row } from '../schema.ts';
import { sha256 } from '../sha256.ts';
import { clean } from '../text.ts';
import { mapHeaders, WORDS_ALIASES, type WordsColumn } from './contract.ts';

export type IssueCode =
  // keep the row out of practice
  | 'word_missing' | 'meaning_missing' | 'duplicate' | 'word_too_long'
  // the row is practised; the named cell is ignored or a guess is used
  | 'article_missing' | 'article_unknown' | 'pos_unknown' | 'example_without_word' | 'example_2_without_word'
  | 'example_2_without_example' | 'prep_unknown' | 'cell_too_long' | 'invisible_characters';

export const BLOCKING: ReadonlySet<IssueCode> = new Set(['word_missing', 'meaning_missing', 'duplicate', 'word_too_long']);

export interface RowIssue {
  code: IssueCode;
  column?: WordsColumn;
  /** For `duplicate`: the sheet row it repeats. */
  firstRow?: number;
}

export interface RowMeta {
  /** `agent` when an AI assistant wrote the row (source column), `me` for the learner, '' unknown. */
  source: 'agent' | 'me' | '';
  /** ISO date (YYYY-MM-DD) when given and readable, else ''. */
  added: string;
  verified: 'yes' | 'no' | '';
  /** Free text, never validated against a fixed range (A1…C2, "around B1", anything). */
  level: string;
  /** The topic as written, for the label strip when it is not one of the built-in situations. */
  topic: string;
}

export interface SheetRow {
  /** Sheet row number as the learner sees it (the header is row 1). */
  rowNumber: number;
  key: string;
  word: string;
  /** null when a blocking issue keeps the row out of practice. */
  record: WordRecord | null;
  issues: RowIssue[];
  meta: RowMeta;
  /** Hash of everything the app reads from the row, to tell an edited row from an unchanged one. */
  hash: string;
}

export type SheetProblem = 'empty' | 'not_csv' | 'no_word_column' | 'too_large';

export type ParsedWords =
  | {
    ok: true;
    columns: WordsColumn[];
    unknownColumns: string[];
    rows: SheetRow[];
    /** Rows that are practised. */
    usable: number;
    /** Rows with at least one note (practised or not). */
    attention: number;
  }
  | { ok: false; problem: SheetProblem };

/** Upper bounds that keep a mistaken paste (a whole other spreadsheet) from freezing the phone. */
export const MAX_ROWS = 5000;
export const MAX_BYTES = 3_000_000;
const MAX_WORD = 80;
const MAX_CELL = 300;
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F­​-‏‪-‮⁠-⁤﻿]/g;

const ARTICLE_WORDS: Record<string, 'der' | 'die' | 'das'> = {
  der: 'der', die: 'die', das: 'das', r: 'der', e: 'die', s: 'das', m: 'der', f: 'die', n: 'das',
  masc: 'der', fem: 'die', neut: 'das', masculine: 'der', feminine: 'die', neuter: 'das',
  maskulin: 'der', feminin: 'die', neutrum: 'das', männlich: 'der', weiblich: 'die', sächlich: 'das',
};

const POS_WORDS: Record<string, 'noun' | 'verb' | 'adj' | 'phrase'> = {
  noun: 'noun', nomen: 'noun', substantiv: 'noun', n: 'noun', nn: 'noun', subst: 'noun',
  verb: 'verb', v: 'verb', verben: 'verb', vb: 'verb',
  adj: 'adj', adjective: 'adj', adjektiv: 'adj', a: 'adj',
  phrase: 'phrase', chunk: 'phrase', expression: 'phrase', ausdruck: 'phrase', redewendung: 'phrase', idiom: 'phrase',
  wendung: 'phrase', satz: 'phrase', sentence: 'phrase', adverb: 'phrase', adv: 'phrase', konjunktion: 'phrase',
  conjunction: 'phrase', präposition: 'phrase', preposition: 'phrase',
};

/** Built-in situations, by the names learners use for them. Anything else is kept as a free label. */
const TOPIC_WORDS: Record<string, 'arbeit' | 'uni' | 'amt' | 'alltag' | 'smalltalk'> = {
  arbeit: 'arbeit', work: 'arbeit', job: 'arbeit', beruf: 'arbeit', office: 'arbeit', büro: 'arbeit',
  uni: 'uni', university: 'uni', universität: 'uni', studium: 'uni', studies: 'uni', study: 'uni',
  amt: 'amt', admin: 'amt', behörde: 'amt', bürokratie: 'amt', bureaucracy: 'amt', authorities: 'amt',
  alltag: 'alltag', everyday: 'alltag', 'daily life': 'alltag', 'everyday life': 'alltag', daily: 'alltag',
  smalltalk: 'smalltalk', 'small talk': 'smalltalk', chat: 'smalltalk', conversation: 'smalltalk', gespräch: 'smalltalk',
};

const low = (s: string) => clean(s).toLowerCase();

/**
 * Part of speech when the sheet does not say: an article means a noun; spaces or end punctuation mean
 * a phrase; "sich …" a verb; a capital first letter a noun; -en/-ern/-eln a verb; else an adjective.
 * Only distractor pools depend on it, so a wrong guess costs little.
 */
export function guessPos(word: string, article: string): 'noun' | 'verb' | 'adj' | 'phrase' {
  const w = clean(word);
  if (article) return 'noun';
  if (/\s/.test(w.replace(/^sich\s+/i, '')) || /[.!?…,]$/.test(w)) return 'phrase';
  if (/^sich\s/i.test(w)) return 'verb';
  if (/^\p{Lu}/u.test(w)) return 'noun';
  if (/(?:en|ern|eln)$/.test(w)) return 'verb';
  return 'adj';
}

/** Lemma for identity: lower case, NFC, a leading article and final punctuation dropped, quotes folded. */
export function lemmaKey(word: string): string {
  return clean(word).toLowerCase().replace(/[„“”"]/g, '').replace(/[‚‘’]/g, "'")
    .replace(/^(der|die|das)\s+(?=\S)/, '').replace(/[.!?…]+$/, '').trim();
}

/** `id:<id>` when the row carries an id, else `w:<lemma>`. Article and pos are left out on purpose:
 *  filling in a missing article later must not turn the word into a new one. */
export function rowKey(word: string, id: string): string {
  const i = clean(id);
  return i ? `id:${i.slice(0, 64)}` : `w:${lemmaKey(word)}`;
}

function isoDate(s: string): string {
  const v = clean(s);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(v); // 11.10.2026
  if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v); // 10/11/2026 (Google Sheets en-US display)
  if (m) return `${m[3]}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
  return '';
}

function sourceOf(s: string): RowMeta['source'] {
  const v = low(s);
  if (!v) return '';
  if (['me', 'ich', 'mine', 'self', 'manual', 'hand', 'learner', 'user'].includes(v)) return 'me';
  if (['agent', 'ai', 'ki', 'claude', 'chatgpt', 'gpt', 'bot', 'assistant'].includes(v)) return 'agent';
  return '';
}

function verifiedOf(s: string): RowMeta['verified'] {
  const v = low(s);
  if (['yes', 'ja', 'y', 'true', '1', 'x', 'ok', '✓'].includes(v)) return 'yes';
  if (['no', 'nein', 'n', 'false', '0'].includes(v)) return 'no';
  return '';
}

/** Read one row's cells into a core `words` row plus notes. */
function readRow(get: (c: WordsColumn) => string, has: (c: WordsColumn) => boolean, key: string): { row: Row; issues: RowIssue[] } {
  const issues: RowIssue[] = [];
  const cell = (c: WordsColumn) => {
    const raw = get(c);
    const stripped = raw.replace(INVISIBLE, '');
    if (stripped !== raw) issues.push({ code: 'invisible_characters', column: c });
    const v = clean(stripped);
    if (v.length > (c === 'word' ? MAX_WORD : MAX_CELL)) {
      issues.push({ code: c === 'word' ? 'word_too_long' : 'cell_too_long', column: c });
      return '';
    }
    return v;
  };

  let word = cell('word');
  let article = '';
  const rawArticle = cell('article');
  if (rawArticle) {
    const a = ARTICLE_WORDS[rawArticle.toLowerCase()];
    if (a) article = a;
    else issues.push({ code: 'article_unknown', column: 'article' });
  }
  // "der Schrank" in the word column: the article moves to its own field.
  const lead = /^(der|die|das)\s+(\p{Lu}\S*)$/u.exec(word);
  if (lead) {
    article ||= lead[1] as typeof article;
    word = lead[2]!;
  }

  const rawPos = cell('pos');
  let pos = rawPos ? POS_WORDS[rawPos.toLowerCase()] : undefined;
  if (rawPos && !pos) issues.push({ code: 'pos_unknown', column: 'pos' });
  pos ??= guessPos(word, article);
  if (pos !== 'noun' && article) pos = 'noun';
  if (pos === 'noun' && !article && word && (has('article') || rawPos)) issues.push({ code: 'article_missing', column: 'article' });

  const topic = cell('topic');
  const domain = TOPIC_WORDS[topic.toLowerCase()] ?? '';

  const ex = (de: WordsColumn, en: WordsColumn, form: WordsColumn, code: IssueCode) => {
    const sentence = cell(de);
    if (!sentence) return { de: '', en: '', form: '' };
    const f = cell(form) || word;
    if (formCount(sentence, f) !== 1) {
      issues.push({ code, column: de });
      return { de: '', en: '', form: '' };
    }
    return { de: sentence, en: cell(en), form: cell(form) };
  };
  const e1 = ex('example', 'example_translation', 'example_form', 'example_without_word');
  let e2 = ex('example_2', 'example_2_translation', 'example_2_form', 'example_2_without_word');
  if (e2.de && !e1.de) {
    issues.push({ code: 'example_2_without_example', column: 'example_2' });
    e2 = { de: '', en: '', form: '' };
  }

  let prep = cell('prep').toLowerCase();
  if (prep && !(PREPOSITIONS as readonly string[]).includes(prep)) {
    issues.push({ code: 'prep_unknown', column: 'prep' });
    prep = '';
  }

  const row: Row = {
    word_id: key, de: word, article, plural: cell('plural'), en: cell('meaning'), pos,
    tier: pos === 'phrase' ? 'chunk' : 'core', domain,
    example_de: e1.de, example_en: e1.en, example_form: e1.form,
    example_2_de: e2.de, example_2_en: e2.en, example_2_form: e2.form,
    collocation: cell('collocation'), prep, note: cell('note'), wrong_1: cell('wrong_1'), wrong_2: cell('wrong_2'),
    status: 'active', start_stage: '0', image_key: '',
    source: sourceOf(get('source')), topic,
  };
  return { row, issues };
}

export function parseWordsCsv(text: string): ParsedWords {
  if (!text.trim()) return { ok: false, problem: 'empty' };
  if (text.length > MAX_BYTES) return { ok: false, problem: 'too_large' };
  if (/^\s*<(!doctype|html)/i.test(text)) return { ok: false, problem: 'not_csv' };
  let table: string[][];
  try {
    table = parseCsv(text, { keepEmpty: true });
  } catch {
    return { ok: false, problem: 'not_csv' };
  }
  if (!table.some((r) => r.some((c) => c.trim()))) return { ok: false, problem: 'empty' };
  // The header is the first row that names a word column (a title row above it is allowed).
  const headerAt = table.slice(0, 5).findIndex((r) => mapHeaders(r, WORDS_ALIASES).index.word !== undefined);
  if (headerAt < 0) return { ok: false, problem: 'no_word_column' };
  const header = mapHeaders(table[headerAt]!, WORDS_ALIASES);
  const idx = header.index;
  const body = table.slice(headerAt + 1);
  if (body.length > MAX_ROWS) return { ok: false, problem: 'too_large' };

  const seen = new Map<string, number>();
  const rows: SheetRow[] = [];
  body.forEach((cells, i) => {
    const rowNumber = headerAt + i + 2;
    const get = (c: WordsColumn) => (idx[c] !== undefined ? cells[idx[c]!] ?? '' : '');
    const has = (c: WordsColumn) => idx[c] !== undefined;
    if (cells.every((c) => !c.trim())) return;
    const key = rowKey(get('word').replace(INVISIBLE, ''), get('id'));
    const { row, issues } = readRow(get, has, key);
    const word = row.de ?? '';
    if (!word) issues.unshift({ code: 'word_missing', column: 'word' });
    else if (!row.en) issues.unshift({ code: 'meaning_missing', column: 'meaning' });
    if (word) {
      const first = seen.get(key);
      if (first !== undefined) issues.unshift({ code: 'duplicate', firstRow: first });
      else seen.set(key, rowNumber);
    }
    const meta: RowMeta = {
      source: sourceOf(get('source')), added: isoDate(get('added')), verified: verifiedOf(get('verified')),
      level: clean(get('level')).slice(0, 40), topic: row.topic ?? '',
    };
    const blocked = issues.some((x) => BLOCKING.has(x.code));
    rows.push({
      rowNumber, key, word, issues, meta,
      record: blocked ? null : toWordRecord(row),
      hash: sha256(JSON.stringify([row, meta])).slice(0, 16),
    });
  });
  return {
    ok: true,
    columns: (Object.keys(idx) as WordsColumn[]).sort((a, b) => idx[a]! - idx[b]!),
    unknownColumns: header.unknown,
    rows,
    usable: rows.filter((r) => r.record).length,
    attention: rows.filter((r) => r.issues.length).length,
  };
}

export interface SheetDiff {
  added: string[];
  changed: string[];
  removed: string[];
  unchanged: number;
}

/** What changed between two reads of the sheet, by row identity. Reordering rows changes nothing. */
export function diffRows(prev: readonly { key: string; hash: string; record: unknown }[] | null, next: readonly { key: string; hash: string; record: unknown }[]): SheetDiff {
  const usable = (rs: readonly { key: string; hash: string; record: unknown }[]) => new Map(rs.filter((r) => r.record).map((r) => [r.key, r.hash]));
  const before = usable(prev ?? []);
  const after = usable(next);
  const out: SheetDiff = { added: [], changed: [], removed: [], unchanged: 0 };
  for (const [k, h] of after) {
    if (!before.has(k)) out.added.push(k);
    else if (before.get(k) !== h) out.changed.push(k);
    else out.unchanged++;
  }
  for (const k of before.keys()) if (!after.has(k)) out.removed.push(k);
  return out;
}
