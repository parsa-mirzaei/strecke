/**
 * Incremental, idempotent ingestion of the learner's sheet into the device's library (SHEET_SCHEMA.md).
 *
 * The library keeps every row the device has ever seen under a stable word id, so the event log (and
 * with it the FSRS state) stays attached to a word across syncs:
 *   - new row            → new item, status active, enters practice as "new"
 *   - edited row         → same item, content replaced; state kept; exercises regenerate from the new columns
 *   - fixed headword typo→ same item (one edit or two, same meaning, same class, the old one vanished)
 *   - other headword     → a new item; the old one is archived
 *   - deleted row        → archived: history kept, never scheduled; restored if the row comes back
 *   - reordered rows     → no effect
 * Running the same table twice changes nothing.
 */
import { sha256 } from '../sha256.ts';
import type { Row } from '../schema.ts';
import { clean, dedupeKey } from '../text.ts';
import { editDistance } from '../typing.ts';
import { cleanRow, findHeader, mapHeader, SHEET_COLUMNS } from './contract.ts';

export interface LibraryItem {
  id: string;
  /** dedupe(de)|article: what identifies the word when the sheet has no id column. */
  base: string;
  /** base|meaning: tells homonyms apart. */
  full: string;
  row: Row;
  hash: string;
  status: 'active' | 'archived';
  /** Sheet line (1-based) the row was last seen on; for messages only. */
  line: number;
  firstSeen: number;
  updatedAt: number;
  archivedAt: number | null;
}

export interface Library {
  version: 1;
  items: Record<string, LibraryItem>;
  lastSync: number | null;
}

export const emptyLibrary = (): Library => ({ version: 1, items: {}, lastSync: null });

export interface RowIssue { line: number; de: string; notes: string[]; skipped: boolean }

export interface IngestReport {
  ok: boolean;
  /** Set when the table as a whole could not be read; the library is then unchanged. */
  error?: 'no_header' | 'empty';
  added: string[];
  updated: string[];
  renamed: string[];
  archived: string[];
  restored: string[];
  unchanged: number;
  /** Rows used with some cells left out, and rows skipped; plain German notes. */
  issues: RowIssue[];
  /** The same word twice in the sheet: later lines are ignored. */
  duplicates: Array<{ line: number; de: string; firstLine: number }>;
  unknownColumns: string[];
  /** True when the library content changed (lastSync aside). */
  changed: boolean;
}

const foldEn = (s: string) => clean(s).toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function keys(row: Row): { base: string; full: string } {
  const base = `${dedupeKey(row.de!, row.pos!)}|${row.article ?? ''}`;
  return { base, full: `${base}|${foldEn(row.en!)}` };
}

const hashRow = (row: Row) => sha256(SHEET_COLUMNS.map((c) => `${c}=${row[c] ?? ''}`).join('\u0001'));

/** Deterministic id from the identity key, so two devices (or a reset device) agree without talking. */
function mintStableId(full: string, taken: ReadonlySet<string>): string {
  for (let i = 0; ; i++) {
    const h = sha256(i ? `${full}#${i}` : full);
    let body = '';
    for (let k = 0; body.length < 8; k += 2) body += 'abcdefghijklmnopqrstuvwxyz0123456789'[parseInt(h.slice(k % 60, (k % 60) + 2), 16) % 36];
    const id = `w_${body}`;
    if (!taken.has(id)) return id;
  }
}

const ID_RE = /^w_[a-z0-9]{8}$/;

export function ingest(prev: Library | null, table: readonly (readonly string[])[], now: number): { library: Library; report: IngestReport } {
  const lib = structuredClone(prev ?? emptyLibrary()) as Library;
  const report: IngestReport = {
    ok: true, added: [], updated: [], renamed: [], archived: [], restored: [], unchanged: 0, issues: [], duplicates: [], unknownColumns: [], changed: false,
  };
  const h = findHeader(table);
  if (h < 0) return { library: prev ?? emptyLibrary(), report: { ...report, ok: false, error: table.length ? 'no_header' : 'empty' } };
  const map = mapHeader(table[h]!);
  report.unknownColumns = map.unknown;

  // 1. Clean every row; collect usable ones.
  interface Incoming { line: number; row: Row; base: string; full: string; hash: string; explicitId: string }
  const incoming: Incoming[] = [];
  const firstLineOf = new Map<string, number>();
  for (let i = h + 1; i < table.length; i++) {
    const cells = table[i]!;
    if (!cells.some((c) => clean(String(c ?? '')))) continue; // blank line
    const line = i + 1;
    const c = cleanRow(cells, map);
    if (c.skip) { report.issues.push({ line, de: c.row.de ?? '', notes: c.notes, skipped: true }); continue; }
    if (c.notes.length) report.issues.push({ line, de: c.row.de!, notes: c.notes, skipped: false });
    if (c.row.status === 'rejected' || c.row.status === 'pending') continue; // not part of practice (Vorschläge come later)
    const k = keys(c.row);
    const explicitId = ID_RE.test(c.row.word_id ?? '') ? c.row.word_id! : '';
    const identity = explicitId || k.full;
    const first = firstLineOf.get(identity);
    if (first !== undefined) { report.duplicates.push({ line, de: c.row.de!, firstLine: first }); continue; }
    firstLineOf.set(identity, line);
    incoming.push({ line, row: c.row, ...k, hash: hashRow(c.row), explicitId });
  }

  // 2. Match incoming rows to library items, independent of row order.
  const items = Object.values(lib.items);
  const matched = new Map<Incoming, LibraryItem>();
  const used = new Set<string>();
  const take = (inc: Incoming, it: LibraryItem) => { matched.set(inc, it); used.add(it.id); };
  const byId = new Map(items.map((it) => [it.id, it]));
  const sorted = [...incoming].sort((a, b) => (a.full < b.full ? -1 : a.full > b.full ? 1 : a.hash < b.hash ? -1 : 1));
  // a. an id column wins
  for (const inc of sorted) { const it = inc.explicitId ? byId.get(inc.explicitId) : undefined; if (it && !used.has(it.id)) take(inc, it); }
  // b. same word, same meaning
  for (const inc of sorted) {
    if (matched.has(inc)) continue;
    const it = items.find((x) => !used.has(x.id) && x.full === inc.full);
    if (it) take(inc, it);
  }
  // c. same word, meaning edited: only when it is the one candidate on both sides
  for (const inc of sorted) {
    if (matched.has(inc)) continue;
    const libSide = items.filter((x) => !used.has(x.id) && x.base === inc.base);
    const inSide = sorted.filter((y) => !matched.has(y) && y.base === inc.base);
    if (libSide.length === 1 && inSide.length === 1) take(inc, libSide[0]!);
  }
  // d. headword typo fixed: same meaning, class and article; at most two edits; the old word vanished
  for (const inc of sorted) {
    if (matched.has(inc)) continue;
    const cands = items.filter((x) => !used.has(x.id) && x.status === 'active' && x.row.pos === inc.row.pos && (x.row.article ?? '') === (inc.row.article ?? '')
      && foldEn(x.row.en!) === foldEn(inc.row.en!) && editDistance(x.row.de!.toLowerCase(), inc.row.de!.toLowerCase(), 2) <= 2);
    if (cands.length === 1) { take(inc, cands[0]!); report.renamed.push(cands[0]!.id); }
  }

  // 3. Apply.
  const taken = new Set(items.map((x) => x.id));
  for (const inc of incoming) {
    const it = matched.get(inc);
    if (it) {
      const wasArchived = it.status === 'archived';
      const changedContent = it.hash !== inc.hash;
      it.line = inc.line;
      if (wasArchived) { it.status = 'active'; it.archivedAt = null; report.restored.push(it.id); }
      if (changedContent) {
        it.row = { ...inc.row, word_id: it.id };
        it.hash = inc.hash;
        it.base = inc.base;
        it.full = inc.full;
        it.updatedAt = now;
        if (!report.renamed.includes(it.id)) report.updated.push(it.id);
      } else if (!wasArchived) report.unchanged++;
      continue;
    }
    const id = inc.explicitId && !taken.has(inc.explicitId) ? inc.explicitId : mintStableId(inc.full, taken);
    taken.add(id);
    lib.items[id] = {
      id, base: inc.base, full: inc.full, row: { ...inc.row, word_id: id }, hash: inc.hash, status: 'active', line: inc.line,
      firstSeen: now, updatedAt: now, archivedAt: null,
    };
    report.added.push(id);
  }
  for (const it of items) {
    if (used.has(it.id) || it.status === 'archived') continue;
    it.status = 'archived';
    it.archivedAt = now;
    report.archived.push(it.id);
  }
  report.changed = !!(report.added.length || report.updated.length || report.archived.length || report.restored.length || report.renamed.length);
  // `line` changes with reordering but is not content; keep it fresh without marking a change.
  lib.lastSync = now;
  report.issues.sort((a, b) => a.line - b.line);
  return { library: lib, report };
}

/** Library items in the order new words should be introduced: oldest-added first, then sheet order. */
export function introductionOrder(lib: Library): LibraryItem[] {
  return Object.values(lib.items).filter((x) => x.status === 'active').sort((a, b) => a.firstSeen - b.firstSeen || a.line - b.line);
}
