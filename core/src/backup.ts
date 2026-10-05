/**
 * Backup boundary: snapshots of Core with per-tab SHA-256 manifests and the audit head,
 * verification, diffing, and recovery.
 *
 * Recovery = restore the last good snapshot, then merge rows created after it from the damaged Core
 * (and from the phone's own copy of its events), excluding anything from runs the learner marks bad.
 * Learner history (events, captures) is append-only and keyed by ID, so merging never duplicates it.
 */
import { auditHead, makeAuditRow, verifyAudit } from './audit.ts';
import { CORE_TABS, CORE_TAB_NAMES, emptyCore, type Core, type CoreTab, type Row } from './schema.ts';
import { canonical, sha256 } from './sha256.ts';
import { coreCellProblems } from './text.ts';

export const SNAPSHOT_FORMAT = 'strecke-core-snapshot/1';

export interface Snapshot {
  format: string;
  created_at: string;
  audit_head: string;
  manifest: Record<string, { rows: number; sha256: string }>;
  tabs: Record<string, Row[]>;
}

export function tabHash(rows: readonly Row[]): string {
  return sha256(canonical(rows));
}

export function snapshot(core: Core, createdAt: string): Snapshot {
  const tabs: Record<string, Row[]> = {};
  const manifest: Snapshot['manifest'] = {};
  for (const t of CORE_TAB_NAMES) {
    tabs[t] = core[t].map((r) => ({ ...r }));
    manifest[t] = { rows: core[t].length, sha256: tabHash(core[t]) };
  }
  return { format: SNAPSHOT_FORMAT, created_at: createdAt, audit_head: auditHead(core.audit), manifest, tabs };
}

export function verifySnapshot(s: Snapshot): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  if (s.format !== SNAPSHOT_FORMAT) problems.push('format');
  for (const t of CORE_TAB_NAMES) {
    const rows = s.tabs[t];
    const m = s.manifest[t];
    if (!rows || !m) { problems.push(`missing_tab:${t}`); continue; }
    if (rows.length !== m.rows) problems.push(`row_count:${t}`);
    if (tabHash(rows) !== m.sha256) problems.push(`hash:${t}`);
  }
  const chain = verifyAudit(s.tabs.audit ?? []);
  if (!chain.ok) problems.push(`audit_chain:${chain.reason}@${chain.brokenAt}`);
  if (auditHead(s.tabs.audit ?? []) !== s.audit_head) problems.push('audit_head');
  return { ok: problems.length === 0, problems };
}

export function restoreSnapshot(s: Snapshot): Core {
  const v = verifySnapshot(s);
  if (!v.ok) throw new Error(`snapshot_invalid:${v.problems.join(',')}`);
  const core = emptyCore();
  for (const t of CORE_TAB_NAMES) core[t] = s.tabs[t]!.map((r) => ({ ...r }));
  return core;
}

export interface TabDiff { added: string[]; removed: string[]; changed: string[] }

/** Per-tab differences by primary key. */
export function diffCore(before: Core, after: Core): Record<string, TabDiff> {
  const out: Record<string, TabDiff> = {};
  for (const t of CORE_TAB_NAMES) {
    const key = CORE_TABS[t].key;
    const a = new Map(before[t].map((r) => [r[key]!, canonical(r)]));
    const b = new Map(after[t].map((r) => [r[key]!, canonical(r)]));
    const d: TabDiff = { added: [], removed: [], changed: [] };
    for (const [k, v] of b) if (!a.has(k)) d.added.push(k); else if (a.get(k) !== v) d.changed.push(k);
    for (const k of a.keys()) if (!b.has(k)) d.removed.push(k);
    if (d.added.length || d.removed.length || d.changed.length) out[t] = d;
  }
  return out;
}

export interface RecoveryReport {
  restoredFrom: string;
  merged: Record<string, number>;
  excluded: Record<string, number>;
  auditChainOfDamagedCore: string;
}

/**
 * Restores `snap`, then carries over rows created after it in `damaged` (plus `deviceEvents`, the
 * phone's own copy), skipping words/prompts/log rows that belong to `excludeRunIds`.
 * Rows already in the snapshot keep their snapshot version (the damage may have changed them).
 */
export function recover(input: {
  snap: Snapshot;
  damaged: Core;
  deviceEvents?: Row[];
  excludeRunIds?: string[];
  now: string;
}): { core: Core; report: RecoveryReport } {
  const core = restoreSnapshot(input.snap);
  const exclude = new Set(input.excludeRunIds ?? []);
  const badWords = new Set(
    input.damaged.inbox_log.filter((r) => exclude.has(r.run_id!) && r.word_id).map((r) => r.word_id!),
  );
  const merged: Record<string, number> = {}, excluded: Record<string, number> = {};
  const carry = (tab: CoreTab, rows: Row[], skip: (r: Row) => boolean) => {
    const key = CORE_TABS[tab].key;
    const have = new Set(core[tab].map((r) => r[key]!));
    for (const r of rows) {
      const k = r[key];
      if (!k || have.has(k)) continue;
      const shaped = Object.fromEntries(CORE_TABS[tab].columns.map((c) => [c, r[c] ?? '']));
      if (skip(shaped) || Object.values(shaped).some((v) => coreCellProblems(v, 2000).length)) {
        excluded[tab] = (excluded[tab] ?? 0) + 1;
        continue;
      }
      core[tab].push(shaped);
      have.add(k);
      merged[tab] = (merged[tab] ?? 0) + 1;
    }
  };
  carry('words', input.damaged.words, (r) => badWords.has(r.word_id!));
  carry('prompts', input.damaged.prompts, (r) => badWords.has(r.word_id!) || !core.words.some((w) => w.word_id === r.word_id));
  carry('inbox_log', input.damaged.inbox_log, (r) => exclude.has(r.run_id!));
  carry('captures', input.damaged.captures, () => false);
  carry('events', [...input.damaged.events, ...(input.deviceEvents ?? [])], (r) => !!r.word_id && !core.words.some((w) => w.word_id === r.word_id));

  // Keep the history of what happened after the snapshot (including the damage) when that part of
  // the chain is intact and continues from the snapshot head; otherwise keep only the snapshot's.
  const chain = verifyAudit(input.damaged.audit);
  const headIdx = input.damaged.audit.findIndex((e) => e.hash === input.snap.audit_head);
  const continues = input.snap.audit_head === '0'.repeat(64) || headIdx === input.snap.tabs.audit!.length - 1;
  if (chain.ok && continues) {
    for (const e of input.damaged.audit.slice(input.snap.tabs.audit!.length)) core.audit.push({ ...e });
  }
  const restoreEntry = makeAuditRow(core.audit, {
    ts: input.now, actor: 'restore', op: 'recover', target: 'core',
    detail: { from: input.snap.created_at, snapshot_head: input.snap.audit_head, merged, excluded, exclude_runs: [...exclude] },
  });
  core.audit.push(restoreEntry);
  return {
    core,
    report: {
      restoredFrom: input.snap.created_at,
      merged,
      excluded,
      auditChainOfDamagedCore: chain.ok ? 'intact' : `broken at ${chain.brokenAt} (${chain.reason})`,
    },
  };
}
