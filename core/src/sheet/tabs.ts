/**
 * The two optional tabs (ported from Round 4, PORT_MAP feature C). Neither is needed; a missing or
 * unreadable one never breaks anything.
 *
 *   Inbox  words the learner jots down for their AI assistant to fill in: `word` (required), `note`,
 *          `processed` (a date once the assistant has added the full row to Words).
 *   Meta   key/value rows; `schema_version` says which contract version the sheet follows.
 */
import { clean } from '../text.ts';
import { foldHeader, SCHEMA_VERSION } from './contract.ts';

const WORD = new Set(['de', 'wort', 'word', 'lemma', 'deutsch', 'german', 'begriff', 'vokabel', 'term']);
const PROCESSED = new Set(['processed', 'done', 'erledigt', 'verarbeitet', 'filled', 'added']);

export type InboxRead =
  | { ok: true; total: number; waiting: number; processed: number }
  | { ok: false; problem: 'empty' | 'no_word_column' | 'unreachable' };

export function readInbox(table: readonly (readonly string[])[]): InboxRead {
  const rows = table.filter((r) => r.some((c) => clean(String(c ?? ''))));
  if (!rows.length) return { ok: false, problem: 'empty' };
  const head = rows[0]!.map((h) => foldHeader(String(h ?? '')));
  const w = head.findIndex((h) => WORD.has(h));
  if (w < 0) return { ok: false, problem: 'no_word_column' };
  const p = head.findIndex((h) => PROCESSED.has(h));
  const items = rows.slice(1).filter((r) => clean(String(r[w] ?? '')));
  const processed = p < 0 ? 0 : items.filter((r) => clean(String(r[p] ?? ''))).length;
  return { ok: true, total: items.length, waiting: items.length - processed, processed };
}

export type SchemaCheck =
  | { status: 'same' | 'none' }
  | { status: 'newer' | 'older'; sheet: number; app: number }
  | { status: 'unreadable'; value: string; app: number };

/**
 * `schema_version` from a Meta tab, as key/value rows (`schema_version,1`) or as a header row with the
 * value underneath. No Meta tab, or no such key, is fine ("none").
 */
export function readSchemaVersion(table: readonly (readonly string[])[] | null): SchemaCheck {
  if (!table || !table.length) return { status: 'none' };
  let raw: string | undefined;
  for (const r of table) if (foldHeader(String(r[0] ?? '')) === 'schemaversion' && clean(String(r[1] ?? ''))) raw = String(r[1]);
  const col = (table[0] ?? []).findIndex((h) => foldHeader(String(h ?? '')) === 'schemaversion');
  if (raw === undefined && col >= 0) raw = String(table[1]?.[col] ?? '');
  if (raw === undefined || !clean(raw)) return { status: 'none' };
  const n = Number(clean(raw));
  if (!Number.isInteger(n) || n < 0) return { status: 'unreadable', value: clean(raw).slice(0, 20), app: SCHEMA_VERSION };
  if (n === SCHEMA_VERSION) return { status: 'same' };
  return { status: n > SCHEMA_VERSION ? 'newer' : 'older', sheet: n, app: SCHEMA_VERSION };
}
