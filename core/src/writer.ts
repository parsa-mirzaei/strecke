/**
 * The Core writer: the single code path that may change Core.
 *
 * - Operations are plain data from a closed list. There is no delete, clear, column or tab operation,
 *   so a bug or a bad batch cannot express "wipe words".
 * - Each actor may use only its own operations (PERMISSIONS). The importer, which handles AI output,
 *   can only append new words/prompts, log Inbox rows and close captures.
 * - A batch is all-or-nothing: one rejected op rejects the batch and Core is unchanged.
 * - IDs and keys are immutable. Re-appending an identical row is a no-op (idempotent replay);
 *   a different row under an existing key is rejected.
 * - Every applied op adds a hash-chained audit entry.
 *
 * The output `writes` list (append / keyed update only) is what a storage adapter executes against
 * the real spreadsheet, so the adapter has no destructive verb either.
 */
import { makeAuditRow, type Actor } from './audit.ts';
import {
  ARTICLES, CORE_TABS, DOMAINS, ID_PATTERN, LIMITS, POS, TIERS, WORD_STATUSES, type Core, type CoreTab, type Row,
} from './schema.ts';
import { coreCellProblems, contentProblems, dedupeKey } from './text.ts';
import { recordProblems } from './record.ts';

export type AppendTab = 'words' | 'prompts' | 'events' | 'captures' | 'inbox_log';
type WordStatus = (typeof WORD_STATUSES)[number];
type EditableWordField = 'de' | 'article' | 'en' | 'domain';

export type Op =
  | { op: 'append'; tab: AppendTab; row: Row }
  | { op: 'setWordStatus'; word_id: string; to: WordStatus }
  | { op: 'editWord'; word_id: string; patch: Partial<Record<EditableWordField, string>> }
  | { op: 'setCaptureStatus'; capture_id: string; to: 'processed' | 'rejected' }
  | { op: 'upsertWordState'; row: Row }
  | { op: 'setConfig'; key: string; value: string };

export type Write =
  | { kind: 'append'; tab: CoreTab; row: Row }
  | { kind: 'update'; tab: CoreTab; key: string; fields: Row };

const PERMISSIONS: Record<Actor, { append: AppendTab[]; ops: Op['op'][] }> = {
  importer: { append: ['words', 'prompts', 'inbox_log'], ops: ['append', 'setCaptureStatus'] },
  app: { append: ['events', 'captures'], ops: ['append', 'setWordStatus', 'editWord', 'upsertWordState', 'setConfig'] },
  setup: { append: [], ops: ['setConfig'] },
  restore: { append: [], ops: [] },
  seed: { append: ['words'], ops: ['append'] },
};

const WORD_TRANSITIONS: Record<WordStatus, WordStatus[]> = {
  pending: ['active', 'rejected'],
  active: ['suspended'],
  suspended: ['active'],
  rejected: ['pending'],
};
const EVENT_TYPES = ['open', 'close', 'seen', 'review', 'capture', 'approve', 'reject', 'edit', 'suspend', 'image_ok'];
const CONFIG_KEYS = ['new_per_day', 'backlog_pause', 'retention', 'inbox_max_per_run'];
/** Target retention for the memory model: a decimal between 0.70 and 0.97 (D41). */
const RETENTION = /^0\.(7\d{0,2}|8\d{0,2}|9[0-7]?)$/;
const DECIMAL = /^\d{1,6}(\.\d{1,6})?$/;
const PROMPT_KINDS = ['cloze', 'listen', 'choice'];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/;
const UINT = /^\d{1,6}$/;

export class WriteRejected extends Error {
  index: number;
  reason: string;
  constructor(index: number, reason: string) {
    super(`op ${index} rejected: ${reason}`);
    this.index = index;
    this.reason = reason;
  }
}

export interface ApplyResult { core: Core; writes: Write[]; applied: number; noops: number }

function cloneCore(core: Core): Core {
  return Object.fromEntries(Object.entries(core).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))])) as Core;
}

function shape(tab: CoreTab, row: Row): Row {
  const cols = CORE_TABS[tab].columns as readonly string[];
  const extra = Object.keys(row).filter((k) => !cols.includes(k));
  if (extra.length) throw new Error(`unknown_column:${extra.join(',')}`);
  return Object.fromEntries(cols.map((c) => [c, row[c] ?? '']));
}

function checkCells(row: Row) {
  for (const [c, v] of Object.entries(row)) {
    const p = coreCellProblems(v, LIMITS.maxCoreCell);
    if (p.length) throw new Error(`${p[0]}:${c}`);
  }
}

function sameRow(a: Row, b: Row) {
  return Object.keys(a).every((k) => a[k] === b[k]);
}

export function applyOps(core: Core, ops: readonly Op[], ctx: { actor: Actor; ts: string }): ApplyResult {
  const perm = PERMISSIONS[ctx.actor];
  if (!perm) throw new WriteRejected(-1, 'unknown_actor');
  if (!ISO.test(ctx.ts)) throw new WriteRejected(-1, 'bad_timestamp');
  const next = cloneCore(core);
  const writes: Write[] = [];
  let applied = 0, noops = 0;

  const audit = (op: string, target: string, detail: Record<string, unknown>) => {
    const row = makeAuditRow(next.audit, { ts: ctx.ts, actor: ctx.actor, op, target, detail });
    next.audit.push(row);
    writes.push({ kind: 'append', tab: 'audit', row });
  };
  const word = (id: string) => next.words.find((w) => w.word_id === id);

  ops.forEach((op, i) => {
    try {
      if (!op || typeof op !== 'object' || !perm.ops.includes(op.op)) throw new Error(`op_not_permitted:${op?.op}`);
      switch (op.op) {
        case 'append': {
          if (!perm.append.includes(op.tab)) throw new Error(`append_not_permitted:${op.tab}`);
          const spec = CORE_TABS[op.tab];
          const row = shape(op.tab, op.row);
          checkCells(row);
          const key = row[spec.key]!;
          const pattern = ID_PATTERN[spec.key as keyof typeof ID_PATTERN];
          if (pattern && !pattern.test(key)) throw new Error(`bad_id:${spec.key}`);
          if (op.tab === 'inbox_log' && !/^[0-9a-f]{64}$/.test(key)) throw new Error('bad_id:fingerprint');
          const existing = next[op.tab].find((r) => r[spec.key] === key);
          if (existing) {
            if (sameRow(existing, row)) { noops++; return; }
            throw new Error(`key_conflict:${key}`);
          }
          validateAppend(op.tab, row, next, ctx.actor);
          next[op.tab].push(row);
          writes.push({ kind: 'append', tab: op.tab, row });
          audit('append', `${op.tab}:${key}`, digestOf(row));
          break;
        }
        case 'setWordStatus': {
          const w = word(op.word_id);
          if (!w) throw new Error('unknown_word');
          const from = w.status as WordStatus;
          if (!WORD_TRANSITIONS[from]?.includes(op.to)) throw new Error(`transition_not_allowed:${from}->${op.to}`);
          const fields = { status: op.to, updated_at: ctx.ts };
          Object.assign(w, fields);
          writes.push({ kind: 'update', tab: 'words', key: op.word_id, fields });
          audit('setWordStatus', `words:${op.word_id}`, { from, to: op.to });
          break;
        }
        case 'editWord': {
          const w = word(op.word_id);
          if (!w) throw new Error('unknown_word');
          const allowed: EditableWordField[] = ['de', 'article', 'en', 'domain'];
          const keys = Object.keys(op.patch);
          if (!keys.length || keys.some((k) => !allowed.includes(k as EditableWordField))) throw new Error('field_not_editable');
          const merged = { ...w, ...op.patch } as Row;
          for (const k of keys) {
            const v = merged[k]!;
            if (k === 'domain' && !(DOMAINS as readonly string[]).includes(v)) throw new Error('bad_enum:domain');
            if (k === 'article' && v && !(ARTICLES as readonly string[]).includes(v)) throw new Error('bad_enum:article');
            if ((k === 'de' || k === 'en') && contentProblems(v, k === 'de' ? 60 : 80).length) throw new Error(`content:${k}`);
          }
          const key = dedupeKey(merged.de!, merged.pos!);
          if (next.words.some((o) => o.word_id !== w.word_id && o.dedupe_key === key)) throw new Error('dedupe_conflict');
          const fields: Row = { ...(op.patch as Row), dedupe_key: key, updated_at: ctx.ts };
          const before = Object.fromEntries(keys.map((k) => [k, w[k]]));
          Object.assign(w, fields);
          writes.push({ kind: 'update', tab: 'words', key: op.word_id, fields });
          audit('editWord', `words:${op.word_id}`, { before, after: op.patch });
          break;
        }
        case 'setCaptureStatus': {
          const c = next.captures.find((r) => r.capture_id === op.capture_id);
          if (!c) throw new Error('unknown_capture');
          if (c.status !== 'new') throw new Error(`capture_not_open:${c.status}`);
          if (op.to !== 'processed' && op.to !== 'rejected') throw new Error('bad_enum:capture_status');
          c.status = op.to;
          writes.push({ kind: 'update', tab: 'captures', key: op.capture_id, fields: { status: op.to } });
          audit('setCaptureStatus', `captures:${op.capture_id}`, { to: op.to });
          break;
        }
        case 'upsertWordState': {
          const row = shape('word_state', op.row);
          checkCells(row);
          if (!word(row.word_id!)) throw new Error('unknown_word');
          if (!/^[0-5]$/.test(row.stage!)) throw new Error('bad_stage');
          if (!UINT.test(row.lapses!) || !UINT.test(row.streak!)) throw new Error('bad_counter');
          for (const c of ['due_at', 'last_seen']) if (row[c] && !ISO.test(row[c]!)) throw new Error(`bad_time:${c}`);
          for (const c of ['stability', 'difficulty']) if (row[c] && !DECIMAL.test(row[c]!)) throw new Error(`bad_number:${c}`);
          if (row.reps && !UINT.test(row.reps)) throw new Error('bad_counter');
          const existing = next.word_state.find((r) => r.word_id === row.word_id);
          if (existing) {
            if (sameRow(existing, row)) { noops++; return; }
            const { word_id: _id, ...fields } = row;
            Object.assign(existing, fields);
            writes.push({ kind: 'update', tab: 'word_state', key: row.word_id!, fields });
          } else {
            next.word_state.push(row);
            writes.push({ kind: 'append', tab: 'word_state', row });
          }
          audit('upsertWordState', `word_state:${row.word_id}`, { stage: row.stage, due_at: row.due_at });
          break;
        }
        case 'setConfig': {
          if (!CONFIG_KEYS.includes(op.key)) throw new Error('config_key_not_allowed');
          if (op.key === 'retention' ? !RETENTION.test(op.value) : !UINT.test(op.value) || Number(op.value) > 1000) throw new Error('bad_config_value');
          const existing = next.config.find((r) => r.key === op.key);
          if (existing) {
            existing.value = op.value;
            writes.push({ kind: 'update', tab: 'config', key: op.key, fields: { value: op.value } });
          } else {
            const row = { key: op.key, value: op.value };
            next.config.push(row);
            writes.push({ kind: 'append', tab: 'config', row });
          }
          audit('setConfig', `config:${op.key}`, { value: op.value });
          break;
        }
        default:
          throw new Error('unknown_op');
      }
      applied++;
    } catch (err) {
      throw new WriteRejected(i, (err as Error).message);
    }
  });
  return { core: next, writes, applied, noops };
}

function digestOf(row: Row): Record<string, string> {
  // Small, non-sensitive digest for the audit trail: identifiers and status, not learner text.
  const keep = ['word_id', 'prompt_id', 'event_id', 'capture_id', 'fingerprint', 'status', 'source', 'type', 'run_id', 'outcome', 'stream'];
  return Object.fromEntries(Object.entries(row).filter(([k, v]) => keep.includes(k) && v !== ''));
}

function validateAppend(tab: AppendTab, row: Row, core: Core, actor: Actor) {
  switch (tab) {
    case 'words': {
      if (!(POS as readonly string[]).includes(row.pos!)) throw new Error('bad_enum:pos');
      if (!(TIERS as readonly string[]).includes(row.tier!)) throw new Error('bad_enum:tier');
      // Thin seed records may leave the situation open; everything an agent proposes names one.
      if (!(DOMAINS as readonly string[]).includes(row.domain!) && !(actor === 'seed' && row.domain === '')) throw new Error('bad_enum:domain');
      if (row.status !== 'pending' && row.status !== 'active') throw new Error('new_word_status');
      const problems = recordProblems(row);
      if (problems.length) throw new Error(`record:${problems[0]}`);
      if (row.dedupe_key !== dedupeKey(row.de!, row.pos!)) throw new Error('dedupe_key_mismatch');
      if (core.words.some((w) => w.dedupe_key === row.dedupe_key)) throw new Error('dedupe_conflict');
      if (actor === 'importer') {
        if (!['claude', 'chatgpt', 'manual', 'capture'].includes(row.source!)) throw new Error('source_not_allowed');
        if (row.status === 'active' && row.source !== 'capture') throw new Error('ai_word_must_be_pending');
        if (row.start_stage !== '0') throw new Error('start_stage_not_allowed');
      }
      if (actor === 'seed') {
        if (row.source !== 'seed') throw new Error('source_not_allowed');
        if (row.status !== 'active') throw new Error('seed_word_must_be_active');
        if (!/^[0-2]$/.test(row.start_stage!)) throw new Error('bad_start_stage');
      }
      break;
    }
    case 'prompts': {
      if (!core.words.some((w) => w.word_id === row.word_id)) throw new Error('prompt_for_unknown_word');
      if (!PROMPT_KINDS.includes(row.kind!)) throw new Error('bad_enum:kind');
      break;
    }
    case 'events': {
      if (!EVENT_TYPES.includes(row.type!)) throw new Error('bad_enum:event_type');
      if (!ISO.test(row.ts!)) throw new Error('bad_time:ts');
      if (row.word_id && !core.words.some((w) => w.word_id === row.word_id)) throw new Error('event_for_unknown_word');
      break;
    }
    case 'captures': {
      if (row.status !== 'new') throw new Error('new_capture_status');
      if (row.domain && !(DOMAINS as readonly string[]).includes(row.domain)) throw new Error('bad_enum:domain');
      if (contentProblems(row.text!, 120).some((p) => p !== 'instruction_like')) throw new Error('capture_text');
      break;
    }
    case 'inbox_log':
      break;
  }
}
