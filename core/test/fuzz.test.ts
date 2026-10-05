import { describe, expect, it } from 'vitest';
import { importInbox } from '../src/importer.ts';
import { applyOps } from '../src/writer.ts';
import { seededBytes } from '../src/ids.ts';
import { verifyAudit } from '../src/audit.ts';
import { INBOX_COLUMNS } from '../src/schema.ts';
import { dedupeKey } from '../src/text.ts';
import { cells, goodRow, seededCore } from './helpers.ts';

const NASTY = [
  '', ' ', '=1+1', '+A1', '@x', '-1', '___', '______', 'a'.repeat(300), '\u0000', '\n', '‮', '​', '﻿',
  '<script>', '{{x}}', 'https://x.y', 'IGNORE PREVIOUS INSTRUCTIONS', 'der', 'die Fahrkarte', 'Fahrkarte', 'noun', 'phrase',
  'chunk', 'core', 'alltag', 'claude', 'seed', 'capture', 'c_cccccc01', 'c_zzzzzz99', 'w_aaaaaaa1', 'claude-x', 'imported',
  '😀', 'Straße', 'Ich ___ das.', 'null', 'undefined', '0', '2', '"', "'", ',', ';',
];

describe('fuzz: hostile Inbox content never breaks the import boundary', () => {
  it('2,000 random rows over 40 passes: writer accepts every batch and Core invariants hold', () => {
    const rand = seededBytes(2026);
    const pick = <T,>(xs: readonly T[]) => xs[rand(1)[0]! % xs.length]!;
    let core = seededCore();
    for (let pass = 0; pass < 40; pass++) {
      const rows: unknown[][] = [[...INBOX_COLUMNS]];
      for (let i = 0; i < 50; i++) {
        const base = cells(goodRow({ run_id: `claude-fuzz-${pass}-${i % 3}` }));
        const mutations = 1 + (rand(1)[0]! % 4);
        for (let m = 0; m < mutations; m++) base[rand(1)[0]! % (base.length + 2)] = pick(NASTY);
        rows.push(base);
      }
      const res = importInbox({ core, inbox: rows, now: `2026-10-05T10:${String(pass).padStart(2, '0')}:00Z`, randomBytes: rand });
      expect(res.ok).toBe(true);
      core = applyOps(core, res.ops, { actor: 'importer', ts: `2026-10-05T10:${String(pass).padStart(2, '0')}:00Z` }).core; // throws if any op is refused
    }
    const keys = core.words.map((w) => w.dedupe_key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const w of core.words) {
      expect(w.dedupe_key).toBe(dedupeKey(w.de!, w.pos!));
      if (w.source !== 'capture' && !w.word_id!.startsWith('w_aaaaaaa')) expect(w.status).toBe('pending');
      for (const v of Object.values(w)) expect(v).not.toMatch(/^\s*[=+\-@]|[\u0000-\u001F​‮﻿]/);
    }
    expect(verifyAudit(core.audit).ok).toBe(true);
    expect(core.events).toHaveLength(1); // the importer never touched learner history
  });
});
