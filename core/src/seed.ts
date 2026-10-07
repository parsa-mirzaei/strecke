/**
 * The seed path (DECISIONS D16, D47): the learner's own starter records, imported locally through the
 * Core writer as actor `seed`. Never reachable from the Inbox: agents cannot claim `seed`, and the
 * Inbox validator rejects `start_stage`.
 *
 * A seed file is CSV with a header of known record columns in any order, plus optional `start_stage`.
 * The same record rules as everywhere else apply (record.ts); thin rows (`de`, `article`, `en`) are fine.
 */
import { parseCsv } from './csv.ts';
import { exercisesFor, type ExerciseType } from './exercises.ts';
import { mintId, type RandomBytes } from './ids.ts';
import { defaultTier, effectivePos, recordColumns, recordProblems, toWordRecord } from './record.ts';
import { RECORD_COLUMNS, type Core, type Row } from './schema.ts';
import { clean, dedupeKey } from './text.ts';
import { applyOps, type Op } from './writer.ts';

export const SEED_COLUMNS = ['de', 'article', 'en', 'pos', 'tier', 'domain', 'family', ...RECORD_COLUMNS, 'start_stage'] as const;

export interface SeedRowResult {
  line: number; // 1-based line in the file (header = 1)
  de: string;
  reasons: string[];
}

export interface ParsedSeed {
  ok: boolean;
  error?: string;
  rows: Row[];
  results: SeedRowResult[];
}

/** Parse and check a seed file without touching any Core. Duplicates inside the file are reported. */
export function checkSeed(csvText: string, existingKeys: ReadonlySet<string> = new Set()): ParsedSeed {
  let table: string[][];
  try { table = parseCsv(csvText); } catch (e) { return { ok: false, error: (e as Error).message, rows: [], results: [] }; }
  const header = (table[0] ?? []).map((h) => clean(h));
  const unknown = header.filter((h) => !(SEED_COLUMNS as readonly string[]).includes(h));
  if (!header.includes('de') || !header.includes('en')) return { ok: false, error: 'header_needs_de_and_en', rows: [], results: [] };
  if (unknown.length) return { ok: false, error: `unknown_columns:${unknown.join(',')}`, rows: [], results: [] };
  if (new Set(header).size !== header.length) return { ok: false, error: 'duplicate_columns', rows: [], results: [] };

  const keys = new Set(existingKeys);
  const rows: Row[] = [];
  const results: SeedRowResult[] = [];
  table.slice(1).forEach((cells, i) => {
    const row: Row = Object.fromEntries(SEED_COLUMNS.map((c) => [c, '']));
    header.forEach((h, j) => { row[h] = cells[j] ?? ''; });
    const reasons = recordProblems(row);
    if (cells.length > header.length && cells.slice(header.length).some((c) => c !== '')) reasons.push('cells_beyond_header');
    if (row.start_stage && !/^[0-2]$/.test(row.start_stage)) reasons.push('bad_start_stage');
    const pos = effectivePos(row);
    if (!reasons.length) {
      const key = dedupeKey(row.de!, pos);
      if (keys.has(key)) reasons.push('duplicate');
      keys.add(key);
    }
    rows.push(row);
    results.push({ line: i + 2, de: clean(row.de ?? ''), reasons });
  });
  return { ok: results.every((r) => !r.reasons.length), rows, results };
}

/** Core operations that append every valid seed row as an active word (actor `seed`). */
export function seedOps(input: { core: Core; csvText: string; now: string; randomBytes: RandomBytes }): { parsed: ParsedSeed; ops: Op[] } {
  const { core, csvText, now, randomBytes } = input;
  const parsed = checkSeed(csvText, new Set(core.words.map((w) => w.dedupe_key!)));
  const ops: Op[] = [];
  if (parsed.error) return { parsed, ops };
  const taken = new Set(core.words.map((w) => w.word_id!));
  parsed.rows.forEach((r, i) => {
    if (parsed.results[i]!.reasons.length) return;
    const pos = effectivePos(r);
    const wordId = mintId('w', taken, randomBytes);
    taken.add(wordId);
    ops.push({ op: 'append', tab: 'words', row: {
      word_id: wordId, de: clean(r.de!), article: r.article ?? '', en: clean(r.en!), pos, tier: r.tier || defaultTier(pos),
      domain: r.domain ?? '', family: clean(r.family ?? ''), start_stage: r.start_stage || '0', image_url: '', image_ok: '',
      source: 'seed', status: 'active', dedupe_key: dedupeKey(r.de!, pos), created_at: now, updated_at: now,
      ...recordColumns(r),
    } });
  });
  return { parsed, ops };
}

/** Import a seed file into a Core (all-or-nothing through the writer). Invalid rows are skipped and reported. */
export function importSeed(input: { core: Core; csvText: string; now: string; randomBytes: RandomBytes }) {
  const { parsed, ops } = seedOps(input);
  if (parsed.error) return { parsed, core: input.core, imported: 0 };
  const res = applyOps(input.core, ops, { actor: 'seed', ts: input.now });
  return { parsed, core: res.core, imported: ops.length };
}

export interface SeedReport {
  rows: number;
  valid: number;
  invalid: SeedRowResult[];
  byTier: Record<string, number>;
  byPos: Record<string, number>;
  byDomain: Record<string, number>;
  thin: number;
  withSecondExample: number;
  withPrep: number;
  withCollocation: number;
  exercises: Record<ExerciseType, number>;
}

/** Numbers for `tools/seed-check.ts`: mix, coverage, and how many exercises the file generates. */
export function seedReport(parsed: ParsedSeed): SeedReport {
  const count = (xs: string[]) => xs.reduce<Record<string, number>>((m, x) => ((m[x || '(none)'] = (m[x || '(none)'] ?? 0) + 1), m), {});
  const valid = parsed.rows.filter((_, i) => !parsed.results[i]!.reasons.length);
  const words = valid.map((r, i) => {
    const pos = effectivePos(r);
    return toWordRecord({ ...r, word_id: `w_seed${String(i).padStart(4, '0')}`, pos, tier: r.tier || defaultTier(pos), status: 'active' });
  });
  const exercises = Object.fromEntries(
    ['karte', 'artikel', 'bedeutung', 'luecke', 'praeposition', 'hoeren', 'tippen', 'kontext2'].map((t) => [t, 0]),
  ) as Record<ExerciseType, number>;
  for (const w of words) for (const x of exercisesFor(w, words)) exercises[x.type]++;
  return {
    rows: parsed.rows.length,
    valid: valid.length,
    invalid: parsed.results.filter((r) => r.reasons.length),
    byTier: count(words.map((w) => w.tier)),
    byPos: count(words.map((w) => w.pos)),
    byDomain: count(words.map((w) => w.domain)),
    thin: valid.filter((r) => !r.example_de).length,
    withSecondExample: valid.filter((r) => r.example_2_de).length,
    withPrep: valid.filter((r) => r.prep).length,
    withCollocation: valid.filter((r) => r.collocation).length,
    exercises,
  };
}
