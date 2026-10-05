/**
 * Deterministic text checks shared by the validator and the Core writer.
 * No model, no network, no locale-dependent behaviour: the same input always gives the same verdict.
 */

/** Characters allowed in German/English content fields: letters, digits, spaces and ordinary punctuation. */
const CONTENT_CHARS = /^[\p{L}\p{M}\p{N} .,;:!?'"„“”‚‘’«»–—\-…()/%&]*$/u;
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/;
/** Zero-width, bidi overrides, word joiners, BOM, private use, tag characters. */
const INVISIBLE = /[­​-‏‪-‮⁠-⁤⁦-⁩﻿-]|[\u{E0000}-\u{E007F}]/u;
/** Leading characters that make a spreadsheet treat a cell as a formula (CSV/formula injection). */
const FORMULA_PREFIX = /^\s*[=+\-@]/;
const URL_LIKE = /(https?:|ftp:|mailto:|www\.|\b[a-z0-9-]+\.(com|de|org|net|io|ai|app|dev|ly|me|co)\b)/i;
/**
 * Text that addresses a model or a tool instead of a learner. Deliberately narrow: a 14-word German
 * sentence cannot be made safe by a blocklist, so this is defence in depth, not the boundary.
 * The boundary is that validated content never reaches an agent with tools (see docs/security).
 */
const w = (alts: string) => `(?<![\\p{L}\\p{N}])(?:${alts})(?![\\p{L}\\p{N}])`;
const INSTRUCTION_LIKE = new RegExp(
  [
    `${w('ignore|disregard|override')}.{0,30}${w('rules?|instructions?|above|previous|contract|readme')}`,
    w('system ?prompt|you are now|as an ai|assistant|claude|chatgpt|gpt|llm|(?:tool|function) ?call|api[ _-]?key|spreadsheet ?id'),
    `${w('append|update|clear|delete|share|copy|write|overwrite')}.{0,20}${w('(?:sheet|tab|range|inbox|core|file|drive|cell)s?')}`,
    `${w('ignoriere|vergiss')}.{0,30}${w('regeln|anweisungen|oben|alles')}`,
    w('systemprompt'),
    `${w('lösche|teile|kopiere|überschreibe')}.{0,20}${w('tabelle|blatt|datei|sheet|inbox')}`,
  ].join('|'),
  'iu',
);

export type CellProblem =
  | 'control_char' | 'invisible_char' | 'formula_prefix' | 'url' | 'charset' | 'instruction_like' | 'too_long';

/** Problems with one untrusted content cell. Empty array = acceptable. */
export function contentProblems(value: string, maxLen: number, opts: { cloze?: boolean } = {}): CellProblem[] {
  const out: CellProblem[] = [];
  if (value.length > maxLen) out.push('too_long');
  if (CONTROL.test(value)) out.push('control_char');
  if (INVISIBLE.test(value)) out.push('invisible_char');
  if (FORMULA_PREFIX.test(value)) out.push('formula_prefix');
  if (URL_LIKE.test(value)) out.push('url');
  const body = opts.cloze ? value.split('___').join('') : value;
  if (!CONTENT_CHARS.test(body)) out.push('charset');
  if (INSTRUCTION_LIKE.test(value)) out.push('instruction_like');
  return out;
}

/** Problems with any cell the Core writer is about to store (IDs, timestamps, JSON payloads included). */
export function coreCellProblems(value: string, maxLen: number): CellProblem[] {
  const out: CellProblem[] = [];
  if (value.length > maxLen) out.push('too_long');
  if (CONTROL.test(value)) out.push('control_char');
  if (INVISIBLE.test(value)) out.push('invisible_char');
  if (FORMULA_PREFIX.test(value)) out.push('formula_prefix');
  return out;
}

/** Unicode NFC, trimmed, inner whitespace collapsed. Umlauts and ß are kept. */
export function clean(s: string): string {
  return s.normalize('NFC').replace(/\s+/g, ' ').trim();
}

export function wordCount(s: string): number {
  const t = clean(s.split('___').join(' X '));
  return t ? t.split(' ').length : 0;
}

export function countGaps(s: string): number {
  return s.split('___').length - 1;
}

/**
 * dedupe_key: NFC, lower-case, typographic quotes folded, whitespace collapsed, trailing .!?… dropped;
 * a leading der/die/das only for nouns ("Das klingt gut." stays "das klingt gut"), a leading "sich" only for verbs.
 */
export function dedupeKey(de: string, pos: string): string {
  let s = clean(de).toLowerCase().replace(/[„“”"]/g, '').replace(/[‚‘’]/g, "'");
  if (pos === 'noun') s = s.replace(/^(der|die|das) /, '');
  if (pos === 'verb') s = s.replace(/^sich /, '');
  return s.replace(/[.!?…]+$/, '').trim();
}

/** Loose form for matching an enriched row against the learner's raw capture text. */
export function fold(s: string): string {
  return clean(s).toLowerCase().replace(/^(der|die|das|sich) /, '').replace(/[^\p{L}\p{N} ]/gu, '').trim();
}
