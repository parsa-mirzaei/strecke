/**
 * Regression against real agent output: the 44 Inbox rows Claude wrote unattended in Phase 0.
 * The rows are private evidence (gitignored data/phase0/); the test is skipped where they are absent.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyOps, type Op } from '../src/writer.ts';
import { emptyCore } from '../src/schema.ts';
import { runImport } from './helpers.ts';

const FIXTURE = 'data/phase0/inbox-snapshot-2026-10-05.json';
const T = '2026-10-04T12:00:00Z';

describe.skipIf(!existsSync(FIXTURE))('Phase 0 real agent output (private fixture)', () => {
  it('44 rows: no false rejections; the known duplicate and the capture are handled', () => {
    const { values } = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { values: string[][] };
    const w = (id: string, de: string, article: string, pos: string, tier: string, domain: string, status: string, key: string): Op => ({
      op: 'append', tab: 'words', row: { word_id: id, de, article, en: 'x', pos, tier, domain, family: '', start_stage: '0', image_url: '', image_ok: '',
        source: status === 'active' ? 'capture' : 'manual', status, dedupe_key: key, created_at: T, updated_at: T },
    });
    // The Phase 0 test Sheet's five sample words and two captures.
    let core = applyOps(emptyCore(), [
      w('w_t0000001', 'Besprechung', 'die', 'noun', 'core', 'arbeit', 'active', 'besprechung'),
      w('w_t0000002', 'Das klingt gut.', '', 'phrase', 'chunk', 'smalltalk', 'active', 'das klingt gut'),
      w('w_t0000003', 'Vorlesung', 'die', 'noun', 'core', 'uni', 'active', 'vorlesung'),
      w('w_t0000004', 'Termin', 'der', 'noun', 'core', 'amt', 'active', 'termin'),
      w('w_t0000005', 'sich beschweren', '', 'verb', 'core', 'alltag', 'pending', 'beschweren'),
    ], { actor: 'importer', ts: T }).core;
    core = applyOps(core, [
      { op: 'append', tab: 'captures', row: { capture_id: 'c_t0000001', ts: T, text: 'Verspätung', domain: 'alltag', context: '', status: 'new' } },
      { op: 'append', tab: 'captures', row: { capture_id: 'c_t0000002', ts: T, text: 'der Termin', domain: 'amt', context: '', status: 'new' } },
    ], { actor: 'app', ts: T }).core;

    const { res, core: after } = runImport(core, values, 3, '2026-10-05T10:00:00Z');
    const invalid = res.rows.filter((r) => r.outcome === 'invalid');
    expect(invalid.map((r) => `${values[r.sheetRow - 1]![0]}: ${r.reason}`)).toEqual([]);
    expect(res.summary).toMatchObject({ imported: 43, duplicate: 1, invalid: 0 });
    expect(res.rows.find((r) => r.outcome === 'duplicate')!.sheetRow).toBe(3); // "Das klingt gut."
    expect(after.words.find((x) => x.de === 'Verspätung')).toMatchObject({ status: 'active', source: 'capture' });
    expect(after.words.filter((x) => x.source === 'claude').every((x) => x.status === 'pending')).toBe(true);
  });
});
