/**
 * Deterministic validation of one Inbox row. Returns readable reasons; an empty list means valid.
 * The validator never repairs a row: an AI proposes, this code accepts or rejects, nothing in between.
 */
import {
  AGENT_COLUMNS, ARTICLES, DOMAINS, FIELD_MAX, ID_PATTERN, INBOX_COLUMNS, INBOX_SOURCES, LIMITS, POS,
  RESERVED_COLUMNS, TIERS, type Row,
} from './schema.ts';
import { clean, contentProblems, countGaps, wordCount } from './text.ts';

const REQUIRED = ['de', 'en', 'pos', 'domain', 'cloze_1', 'answer_1', 'source', 'run_id'] as const;
const CLOZE_FIELDS = ['cloze_1', 'cloze_2'] as const;
const SENTENCE_FIELDS = ['cloze_1', 'cloze_2', 'listen_de'] as const;
const CONTENT_FIELDS = ['de', 'en', 'family', 'cloze_1', 'answer_1', 'hint_1', 'cloze_2', 'answer_2',
  'listen_de', 'listen_en', 'wrong_1', 'wrong_2'] as const;
const RUN_ID = /^(claude|chatgpt|manual)-[a-z0-9-]{1,40}$/;

const isOneOf = <T extends readonly string[]>(list: T, v: string): v is T[number] => list.includes(v);

/** Map a raw sheet row (array of cells) onto Inbox column names. Missing cells become ''. */
export function toInboxRow(cells: readonly unknown[]): Row {
  const row: Row = {};
  INBOX_COLUMNS.forEach((c, i) => {
    const v = cells[i];
    row[c] = v === undefined || v === null ? '' : String(v);
  });
  return row;
}

export function validateInboxRow(row: Row, extraCells = 0): string[] {
  const reasons: string[] = [];
  if (extraCells > 0) reasons.push('cells_beyond_schema');

  for (const c of RESERVED_COLUMNS) if (row[c] !== '') reasons.push(`reserved_column_filled:${c}`);
  for (const c of REQUIRED) if (clean(row[c] ?? '') === '') reasons.push(`missing:${c}`);
  for (const c of AGENT_COLUMNS) {
    const max = FIELD_MAX[c] ?? 0;
    if ((row[c] ?? '').length > max && !RESERVED_COLUMNS.includes(c as never)) reasons.push(`too_long:${c}`);
  }

  for (const c of CONTENT_FIELDS) {
    const v = row[c] ?? '';
    if (!v) continue;
    const problems = contentProblems(v, FIELD_MAX[c] ?? 0, { cloze: isOneOf(CLOZE_FIELDS, c) })
      .filter((p) => p !== 'too_long');
    for (const p of problems) reasons.push(`${p}:${c}`);
  }

  for (const c of ['de', 'en', 'answer_1'] as const) {
    if (clean(row[c] ?? '') && !/\p{L}/u.test(row[c]!)) reasons.push(`no_letters:${c}`);
  }

  const pos = row.pos ?? '', tier = row.tier ?? '', article = row.article ?? '';
  if (pos && !isOneOf(POS, pos)) reasons.push('bad_enum:pos');
  if (tier && !isOneOf(TIERS, tier)) reasons.push('bad_enum:tier');
  if (row.domain && !isOneOf(DOMAINS, row.domain)) reasons.push('bad_enum:domain');
  if (article && !isOneOf(ARTICLES, article)) reasons.push('bad_enum:article');
  if (pos === 'noun' && !article) reasons.push('noun_without_article');
  if (pos !== 'noun' && article) reasons.push('article_on_non_noun');
  if (tier === 'chunk' && pos !== 'phrase') reasons.push('chunk_must_be_phrase');
  if (tier === 'core' && pos === 'phrase') reasons.push('phrase_must_be_chunk');

  if (row.source && !isOneOf(INBOX_SOURCES, row.source)) reasons.push('source_not_allowed');
  if (row.run_id && !RUN_ID.test(row.run_id)) reasons.push('bad_format:run_id');
  if (row.run_id && row.source && isOneOf(INBOX_SOURCES, row.source) && !row.run_id.startsWith(row.source + '-'))
    reasons.push('run_id_source_mismatch');
  if (row.capture_id && !ID_PATTERN.capture_id.test(row.capture_id)) reasons.push('bad_format:capture_id');

  for (const c of CLOZE_FIELDS) {
    const v = row[c] ?? '';
    if (!v) continue;
    if (countGaps(v) !== 1) reasons.push(`gap_count:${c}`);
    const answer = c === 'cloze_1' ? row.answer_1 : row.answer_2;
    if (!clean(answer ?? '')) reasons.push(`missing_answer:${c}`);
    if ((answer ?? '').includes('_')) reasons.push(`answer_has_gap:${c}`);
  }
  if (row.answer_2 && !row.cloze_2) reasons.push('answer_without_cloze:cloze_2');
  for (const c of SENTENCE_FIELDS) {
    if (row[c] && wordCount(row[c]!) > LIMITS.maxSentenceWords) reasons.push(`too_many_words:${c}`);
  }
  if (row.listen_de && countGaps(row.listen_de) > 0) reasons.push('gap_in_listen_de');
  if (row.listen_en && !row.listen_de) reasons.push('listen_en_without_listen_de');

  const en = clean(row.en ?? '').toLowerCase();
  const w1 = clean(row.wrong_1 ?? '').toLowerCase(), w2 = clean(row.wrong_2 ?? '').toLowerCase();
  if ((w1 && w1 === en) || (w2 && w2 === en)) reasons.push('distractor_equals_answer');
  if (w1 && w1 === w2) reasons.push('distractors_identical');

  return [...new Set(reasons)];
}
