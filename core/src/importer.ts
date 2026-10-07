/**
 * Import boundary: untrusted Inbox rows -> deterministic checks -> Core operations.
 *
 * Two streams, decided here by code and recorded on every word:
 *   capture stream:   row carries the capture_id of an open learner capture and matches its text
 *                     -> word `active`, source `capture`, capture marked processed.
 *   expansion stream: no capture_id -> word `pending` (shown as a *Vorschlag* card), source = claimed agent.
 *
 * Idempotency does not trust the Inbox: rows are identified by a SHA-256 fingerprint of their agent
 * columns, and every fingerprint ever seen is kept in Core `inbox_log`. Re-running the importer,
 * replaying a batch, moving rows, or editing the status column changes nothing in Core.
 */
import {
  CORE_TABS, INBOX_HEADERS, LIMITS, agentColumns, type Core, type InboxVersion, type Row,
} from './schema.ts';
import { recordColumns } from './record.ts';
import { canonical, sha256 } from './sha256.ts';
import { clean, contentProblems, dedupeKey, fold } from './text.ts';
import { mintId, type RandomBytes } from './ids.ts';
import { toInboxRow, validateInboxRow } from './validate.ts';
import { applyOps, type Op, type WriteRejected } from './writer.ts';

export type Outcome = 'imported' | 'duplicate' | 'invalid' | 'deferred';

export interface RowResult {
  sheetRow: number; // 1-based row number in the Inbox sheet
  fingerprint: string;
  outcome: Outcome | 'already_seen';
  reason: string;
  word_id: string;
  stream: 'capture' | 'expansion' | '';
}

export interface ImportResult {
  ok: boolean;
  error?: string;
  ops: Op[];
  rows: RowResult[];
  /** Status write-back for the Inbox sheet (columns status, reason, word_id). Informational only. */
  inboxWriteBack: Array<{ sheetRow: number; status: string; reason: string; word_id: string }>;
  summary: Record<string, number>;
}

const SAFE_LABEL = /^[a-z][a-z0-9-]{0,47}$/;

function asciiJson(v: unknown): string {
  return JSON.stringify(v).replace(/[\u007f-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

/**
 * Content fingerprint of a row's agent columns. v1 keeps its original formula, so rows already in
 * `inbox_log` stay recognised; v2 is prefixed with its version so the two can never collide.
 */
export function fingerprint(row: Row, version: InboxVersion = 2): string {
  const values = agentColumns(version).map((c) => row[c] ?? '');
  return sha256(canonical(version === 1 ? values : ['v2', ...values]));
}

/** Which Inbox contract a header row speaks, or why it is refused. */
export function headerVersion(headerCells: readonly unknown[]): InboxVersion | 'header_mismatch' | 'header_extra_columns' {
  const header = headerCells.map((h) => String(h ?? '').trim());
  for (const v of [2, 1] as const) {
    const cols = INBOX_HEADERS[v];
    if (header.length >= cols.length && cols.every((c, i) => header[i] === c)) {
      return header.slice(cols.length).some((h) => h !== '') ? 'header_extra_columns' : v;
    }
  }
  return 'header_mismatch';
}

function captureMatches(captureText: string, de: string): boolean {
  const a = fold(captureText), b = fold(de);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i >= 5;
}

export function importInbox(input: {
  core: Core;
  inbox: readonly (readonly unknown[])[]; // raw sheet values, header first
  now: string;
  randomBytes: RandomBytes;
}): ImportResult {
  const { core, inbox, now, randomBytes } = input;
  const fail = (error: string): ImportResult => ({ ok: false, error, ops: [], rows: [], inboxWriteBack: [], summary: {} });

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/.test(now)) return fail('bad_timestamp');
  // Fail closed on a tampered header: column positions would no longer mean what we think.
  const version = headerVersion(inbox[0] ?? []);
  if (typeof version === 'string') return fail(version);
  const width = INBOX_HEADERS[version].length;
  const agentCols = agentColumns(version);

  const seen = new Map(core.inbox_log.map((r) => [r.fingerprint!, r]));
  const takenIds = new Set([...core.words.map((w) => w.word_id!), ...core.prompts.map((p) => p.prompt_id!)]);
  const keys = new Set(core.words.map((w) => w.dedupe_key!));
  const runCounts = new Map<string, number>();
  for (const r of core.inbox_log) runCounts.set(r.run_id!, (runCounts.get(r.run_id!) ?? 0) + 1);
  const openCaptures = new Map(core.captures.filter((c) => c.status === 'new').map((c) => [c.capture_id!, c]));
  const usedCaptures = new Set<string>();

  const ops: Op[] = [];
  let working = core;
  const rows: RowResult[] = [];
  const summary: Record<string, number> = { imported: 0, duplicate: 0, invalid: 0, deferred: 0, already_seen: 0, empty: 0 };
  let evaluated = 0;

  const last = Math.min(inbox.length, LIMITS.maxInboxRows + 1);
  if (inbox.length > last) summary.truncated = inbox.length - last;

  for (let i = 1; i < last; i++) {
    const cells = inbox[i] ?? [];
    const row = toInboxRow(cells, version);
    const extra = cells.slice(width).filter((c) => String(c ?? '') !== '').length;
    if (agentCols.every((c) => (row[c] ?? '').trim() === '') && !extra) { summary.empty!++; continue; }

    const fp = fingerprint(row, version);
    const prior = seen.get(fp);
    if (prior) {
      summary.already_seen!++;
      rows.push({ sheetRow: i + 1, fingerprint: fp, outcome: 'already_seen', reason: prior.outcome!, word_id: prior.word_id!, stream: (prior.stream as RowResult['stream']) ?? '' });
      continue;
    }
    if (evaluated >= LIMITS.maxRowsPerPass) {
      summary.deferred!++;
      rows.push({ sheetRow: i + 1, fingerprint: fp, outcome: 'deferred', reason: 'pass_cap', word_id: '', stream: '' });
      continue;
    }
    evaluated++;

    const reasons = validateInboxRow(row, extra, version);
    const runId = row.run_id ?? '';
    const runCount = (runCounts.get(runId) ?? 0) + 1;
    runCounts.set(runId, runCount);
    if (runCount > LIMITS.maxRowsPerRun) reasons.push('run_cap_exceeded');

    const stream: RowResult['stream'] = row.capture_id ? 'capture' : 'expansion';
    let capture: Row | undefined;
    if (row.capture_id) {
      capture = openCaptures.get(row.capture_id);
      if (!capture) reasons.push(core.captures.some((c) => c.capture_id === row.capture_id) ? 'capture_not_open' : 'capture_unknown');
      else if (usedCaptures.has(row.capture_id)) reasons.push('capture_already_used');
      else if (!captureMatches(capture.text!, row.de!)) reasons.push('capture_mismatch');
    }

    const rowOps: Op[] = [];
    const pos = row.pos ?? '';
    const key = reasons.length ? '' : dedupeKey(row.de!, pos);
    let outcome: Outcome = 'imported';
    let wordId = '';
    if (reasons.length) outcome = 'invalid';
    else if (keys.has(key)) { outcome = 'duplicate'; reasons.push('duplicate'); }

    if (outcome === 'imported') {
      keys.add(key);
      wordId = mintId('w', takenIds, randomBytes); takenIds.add(wordId);
      const tier = row.tier || (pos === 'phrase' ? 'chunk' : 'core');
      const isCapture = stream === 'capture';
      rowOps.push({ op: 'append', tab: 'words', row: {
        word_id: wordId, de: clean(row.de!), article: row.article!, en: clean(row.en!), pos, tier,
        domain: row.domain!, family: clean(row.family ?? ''), start_stage: '0', image_url: '', image_ok: '',
        source: isCapture ? 'capture' : row.source!, status: isCapture ? 'active' : 'pending',
        dedupe_key: key, created_at: now, updated_at: now,
        // v2 carries the record columns; exercises are generated from them (D39). v1 keeps its clozes,
        // listen sentence and distractors as prompts below, which the compat layer reads.
        ...(version === 2 ? recordColumns(row) : {}),
      } });
      const distractors = JSON.stringify([row.wrong_1, row.wrong_2].filter(Boolean).map((s) => clean(s!)));
      const prompt = (kind: string, de_text: string, answer: string, hint_en: string, en_text: string, d = '[]') => {
        const pid = mintId('p', takenIds, randomBytes); takenIds.add(pid);
        rowOps.push({ op: 'append', tab: 'prompts', row: {
          prompt_id: pid, word_id: wordId, kind, de_text: clean(de_text), answer: clean(answer),
          hint_en: clean(hint_en), en_text: clean(en_text), distractors: d, status: 'active',
        } });
      };
      if (version === 1) {
        prompt('cloze', row.cloze_1!, row.answer_1!, row.hint_1 ?? '', '', distractors);
        if (row.cloze_2) prompt('cloze', row.cloze_2, row.answer_2!, '', '');
        if (row.listen_de) prompt('listen', row.listen_de, '', '', row.listen_en ?? '');
      }
      if (capture) { usedCaptures.add(capture.capture_id!); rowOps.push({ op: 'setCaptureStatus', capture_id: capture.capture_id!, to: 'processed' }); }
    } else if (capture && outcome === 'duplicate') {
      usedCaptures.add(capture.capture_id!);
      rowOps.push({ op: 'setCaptureStatus', capture_id: capture.capture_id!, to: 'rejected' });
    }

    let reason = reasons.join(';').slice(0, 500);
    // Raw row kept for audit and recovery as ASCII-only JSON: it cannot act as a formula and cannot
    // smuggle invisible characters into Core (which would make the writer refuse the whole batch).
    const raw = asciiJson(agentCols.map((c) => row[c] ?? '')).slice(0, 1900);
    rowOps.push({ op: 'append', tab: 'inbox_log', row: {
      // Only well-formed labels reach Core: anything else (e.g. "-1", "=A1") would be refused by the
      // writer as a formula and, batches being all-or-nothing, block the whole import.
      fingerprint: fp, seen_at: now, run_id: SAFE_LABEL.test(runId) ? runId : 'malformed',
      source_claimed: SAFE_LABEL.test(row.source ?? '') ? row.source! : 'malformed', stream, outcome, reason, word_id: wordId, raw,
    } });
    // Dry-run this row's ops through the writer. If the writer would refuse them (a bug or an input
    // nobody anticipated), the row is logged as rejected instead, so one row can never block a batch.
    try {
      working = applyOps(working, rowOps, { actor: 'importer', ts: now }).core;
      ops.push(...rowOps);
    } catch (err) {
      outcome = 'invalid';
      wordId = '';
      reason = `internal_reject:${(err as WriteRejected).reason ?? 'unknown'}`;
      const fallback: Op = { op: 'append', tab: 'inbox_log', row: {
        fingerprint: fp, seen_at: now, run_id: 'malformed', source_claimed: 'malformed', stream, outcome, reason, word_id: '', raw: '',
      } };
      working = applyOps(working, [fallback], { actor: 'importer', ts: now }).core;
      ops.push(fallback);
    }
    seen.set(fp, { fingerprint: fp, outcome, word_id: wordId, stream });
    summary[outcome]!++;
    rows.push({ sheetRow: i + 1, fingerprint: fp, outcome, reason, word_id: wordId, stream });
  }

  // Write-back mirrors Core's verdict, including for rows whose status cells an agent tampered with.
  const inboxWriteBack = rows
    .filter((r) => r.outcome !== 'deferred')
    .map((r) => ({
      sheetRow: r.sheetRow,
      status: r.outcome === 'already_seen' ? r.reason : r.outcome,
      reason: r.outcome === 'already_seen' ? '' : r.reason,
      word_id: r.word_id,
    }));
  return { ok: true, ops, rows, inboxWriteBack, summary };
}

/**
 * The only Core-derived data published to the Inbox for agents: dedupe keys, counts, and open
 * captures that pass the content checks. No events, no progress, no config, no learner context.
 */
export function agentView(core: Core): {
  keys: string[];
  status: Array<[string, string]>;
  captures_open: Array<[string, string, string]>;
} {
  const keys = [...new Set(core.words.map((w) => w.dedupe_key!))].sort();
  const open = core.captures
    .filter((c) => c.status === 'new' && clean(c.text!).length <= 60 && contentProblems(c.text!, 60).length === 0)
    .slice(0, LIMITS.maxOpenCaptures)
    .map((c) => [c.capture_id!, clean(c.text!), c.domain!] as [string, string, string]);
  const domainCounts = new Map<string, number>();
  for (const w of core.words) if (w.status !== 'rejected') domainCounts.set(w.domain!, (domainCounts.get(w.domain!) ?? 0) + 1);
  const neediest = ['arbeit', 'uni', 'amt', 'alltag', 'smalltalk']
    .sort((a, b) => (domainCounts.get(a) ?? 0) - (domainCounts.get(b) ?? 0)).slice(0, 2).join(',');
  return {
    keys,
    status: [
      ['pending', String(core.words.filter((w) => w.status === 'pending').length)],
      ['open_captures', String(open.length)],
      ['favour_domains', neediest],
    ],
    captures_open: open,
  };
}

export const AGENT_VIEW_COLUMNS = {
  keys: ['dedupe_key'],
  status: ['key', 'value'],
  captures_open: ['capture_id', 'text', 'domain'],
} as const;

export { CORE_TABS };
