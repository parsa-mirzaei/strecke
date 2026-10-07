/**
 * Append-only audit log with a hash chain: hash_n = sha256(prev_hash + canonical(entry_n)).
 * Editing, deleting or reordering any past entry breaks every later hash, so tampering is detectable.
 * Each daily backup stores the current head hash, which anchors the chain outside Core.
 */
import { CORE_TABS, type Core, type Row } from './schema.ts';
import { canonical, sha256 } from './sha256.ts';

export const GENESIS = '0'.repeat(64);

/** `seed` is the learner's one-time local seed import (D16, D47); never reachable from the Inbox. */
export type Actor = 'importer' | 'app' | 'setup' | 'restore' | 'seed';

export interface AuditInput {
  ts: string;
  actor: Actor;
  op: string;
  target: string;
  detail: Record<string, unknown>;
}

function entryHash(prev: string, e: Omit<Row, 'hash' | 'prev_hash'>): string {
  return sha256(prev + canonical({ seq: e.seq, ts: e.ts, actor: e.actor, op: e.op, target: e.target, detail: e.detail }));
}

export function auditHead(audit: readonly Row[]): string {
  return audit.length ? audit[audit.length - 1]!.hash! : GENESIS;
}

/** Returns a new audit row chained onto `audit`. Does not mutate. */
export function makeAuditRow(audit: readonly Row[], input: AuditInput): Row {
  const prev = auditHead(audit);
  const base = {
    seq: String(audit.length + 1),
    ts: input.ts,
    actor: input.actor,
    op: input.op,
    target: input.target,
    detail: canonical(input.detail),
  };
  const row: Row = { ...base, prev_hash: prev, hash: entryHash(prev, base) };
  // Keep column order stable for the sheet.
  return Object.fromEntries(CORE_TABS.audit.columns.map((c) => [c, row[c] ?? '']));
}

export interface ChainCheck { ok: boolean; length: number; brokenAt?: number; reason?: string }

/** Verifies the whole chain; `brokenAt` is the 1-based seq of the first bad entry. */
export function verifyAudit(audit: readonly Row[], expectedHead?: string): ChainCheck {
  let prev = GENESIS;
  for (let i = 0; i < audit.length; i++) {
    const e = audit[i]!;
    if (e.seq !== String(i + 1)) return { ok: false, length: audit.length, brokenAt: i + 1, reason: 'seq_gap_or_reorder' };
    if (e.prev_hash !== prev) return { ok: false, length: audit.length, brokenAt: i + 1, reason: 'prev_hash_mismatch' };
    if (e.hash !== entryHash(prev, e)) return { ok: false, length: audit.length, brokenAt: i + 1, reason: 'hash_mismatch' };
    prev = e.hash!;
  }
  if (expectedHead && !audit.some((e) => e.hash === expectedHead) && expectedHead !== GENESIS)
    return { ok: false, length: audit.length, reason: 'anchored_head_missing' };
  return { ok: true, length: audit.length };
}

/** Audit entries mention keys they wrote; this lists keys the audit says exist but Core no longer has. */
export function missingAuditedRows(core: Core): Array<{ seq: string; tab: string; key: string }> {
  const out: Array<{ seq: string; tab: string; key: string }> = [];
  for (const e of core.audit) {
    if (e.op !== 'append') continue;
    const [tab, key] = (e.target ?? '').split(':');
    const spec = CORE_TABS[tab as keyof typeof CORE_TABS];
    if (!spec || !key) continue;
    if (!core[tab as keyof Core].some((r) => r[spec.key] === key)) out.push({ seq: e.seq!, tab: tab!, key });
  }
  return out;
}
