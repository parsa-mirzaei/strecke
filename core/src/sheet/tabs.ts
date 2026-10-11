/**
 * The two optional tabs (DECISIONS D56). Neither is needed; a missing one never breaks anything.
 *
 *   Inbox – words the learner jots down for their AI assistant to fill in: `word` (required),
 *           `note`, `processed` (a date once the assistant has added the full row to Words).
 *   Meta  – key/value rows; `schema_version` says which contract version the sheet follows.
 */
import { parseCsv } from '../csv.ts';
import { clean } from '../text.ts';
import { INBOX_ALIASES, mapHeaders, normHeader, SCHEMA_VERSION } from './contract.ts';

export type InboxRead =
  | { ok: true; headers: string[]; total: number; waiting: number; processed: number; waitingWords: string[] }
  | { ok: false; problem: 'empty' | 'not_csv' | 'no_word_column' };

export function parseInboxCsv(text: string): InboxRead {
  if (!text.trim()) return { ok: false, problem: 'empty' };
  if (/^\s*<(!doctype|html)/i.test(text)) return { ok: false, problem: 'not_csv' };
  let table: string[][];
  try {
    table = parseCsv(text);
  } catch {
    return { ok: false, problem: 'not_csv' };
  }
  const head = mapHeaders(table[0] ?? [], INBOX_ALIASES);
  if (head.index.word === undefined) return { ok: false, problem: 'no_word_column' };
  const rows = table.slice(1).filter((r) => clean(r[head.index.word!] ?? ''));
  const isDone = (r: string[]) => head.index.processed !== undefined && !!clean(r[head.index.processed] ?? '');
  const waiting = rows.filter((r) => !isDone(r));
  const headers = (table[0] ?? []).map((h) => clean(h));
  while (headers.length && !headers.at(-1)) headers.pop();
  return {
    ok: true,
    headers,
    total: rows.length,
    waiting: waiting.length,
    processed: rows.length - waiting.length,
    waitingWords: waiting.slice(0, 50).map((r) => clean(r[head.index.word!] ?? '')),
  };
}

export type SchemaCheck =
  | { status: 'same' | 'none' }
  | { status: 'newer' | 'older'; sheet: number; app: number }
  | { status: 'unreadable'; value: string };

/**
 * `schema_version` from a Meta tab, as key/value rows (`schema_version,1`) or as a header row with the
 * value underneath. No Meta tab, or no such key, is fine ("none").
 */
export function readSchemaVersion(text: string | null): SchemaCheck {
  if (!text || !text.trim() || /^\s*<(!doctype|html)/i.test(text)) return { status: 'none' };
  let table: string[][];
  try {
    table = parseCsv(text);
  } catch {
    return { status: 'none' };
  }
  let raw: string | undefined;
  for (const r of table) if (normHeader(r[0] ?? '') === 'schemaversion') raw = r[1];
  const col = (table[0] ?? []).findIndex((h) => normHeader(h) === 'schemaversion');
  if (raw === undefined && col >= 0) raw = table[1]?.[col];
  if (raw === undefined || !clean(raw)) return { status: 'none' };
  const n = Number(clean(raw));
  if (!Number.isInteger(n) || n < 0) return { status: 'unreadable', value: clean(raw).slice(0, 20) };
  if (n === SCHEMA_VERSION) return { status: 'same' };
  return { status: n > SCHEMA_VERSION ? 'newer' : 'older', sheet: n, app: SCHEMA_VERSION };
}
