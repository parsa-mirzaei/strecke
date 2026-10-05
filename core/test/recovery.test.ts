import { describe, expect, it } from 'vitest';
import { applyOps, type Op } from '../src/writer.ts';
import { missingAuditedRows, verifyAudit } from '../src/audit.ts';
import { diffCore, recover, restoreSnapshot, snapshot, verifySnapshot } from '../src/backup.ts';
import type { Core, Row } from '../src/schema.ts';
import { goodRow, runImport, seededCore, sheet } from './helpers.ts';

const T0 = '2026-10-05T10:00:00Z', T1 = '2026-10-05T12:00:00Z', T2 = '2026-10-05T14:00:00Z', T3 = '2026-10-05T16:00:00Z';

const item = (de: string, run: string, domain = 'alltag') =>
  goodRow({ de, answer_1: de, answer_2: de, en: de.toLowerCase() + ' (en)', hint_1: 'x', wrong_1: 'a', wrong_2: 'b', listen_de: `Das ist ${de}.`, run_id: run, domain });

const review = (id: string, word_id: string, ts: string): Op => ({
  op: 'append', tab: 'events',
  row: { event_id: id, ts, type: 'review', word_id, prompt_id: '', card_type: 'recall', result: '1', ms: '700', payload: '', device: 'phone' },
});

/** A realistic day: snapshot at T0, a good batch, learner reviews, then a bad batch. */
function day() {
  const start = seededCore();
  const snap = snapshot(start, T0);
  let core = runImport(start, sheet(item('Miete', 'claude-good-1'), item('Rechnung', 'claude-good-1', 'amt')), 11, T1).core;
  core = applyOps(core, [review('e_rev00001', 'w_aaaaaaa1', T1), review('e_rev00002', 'w_aaaaaaa2', T1)], { actor: 'app', ts: T1 }).core;
  core = runImport(core, sheet(item('Quatschwort', 'claude-bad-1'), item('Unsinnig', 'claude-bad-1'), item('Falschwort', 'claude-bad-1', 'uni')), 12, T2).core;
  core = applyOps(core, [review('e_rev00003', 'w_aaaaaaa1', T2)], { actor: 'app', ts: T2 }).core;
  return { start, snap, core };
}

describe('recovery: bad batch', () => {
  it('the audit identifies exactly the rows of the bad run', () => {
    const { core } = day();
    const bad = core.inbox_log.filter((r) => r.run_id === 'claude-bad-1').map((r) => r.word_id);
    expect(core.words.filter((w) => bad.includes(w.word_id!)).map((w) => w.de).sort()).toEqual(['Falschwort', 'Quatschwort', 'Unsinnig']);
    const audited = core.audit.filter((e) => bad.some((id) => e.target === `words:${id}`));
    expect(audited).toHaveLength(3);
    expect(new Set(audited.map((e) => e.actor))).toEqual(new Set(['importer']));
    expect(verifyAudit(core.audit).ok).toBe(true);
  });

  it('roll back without restore: reject the bad words through the writer (no deletes)', () => {
    const { core } = day();
    const bad = core.inbox_log.filter((r) => r.run_id === 'claude-bad-1').map((r) => r.word_id!);
    const fixed = applyOps(core, bad.map((word_id) => ({ op: 'setWordStatus', word_id, to: 'rejected' }) as Op), { actor: 'app', ts: T3 }).core;
    expect(fixed.words.filter((w) => bad.includes(w.word_id!)).every((w) => w.status === 'rejected')).toBe(true);
    expect(fixed.words).toHaveLength(core.words.length); // nothing deleted; dedupe still blocks re-proposals
  });

  it('restore + merge: good work since the snapshot survives, the bad run is excluded', () => {
    const { snap, core } = day();
    const { core: rec, report } = recover({ snap, damaged: core, excludeRunIds: ['claude-bad-1'], now: T3 });
    const des = rec.words.map((w) => w.de);
    expect(des).toEqual(expect.arrayContaining(['Miete', 'Rechnung', 'Besprechung']));
    expect(des).not.toEqual(expect.arrayContaining(['Quatschwort']));
    expect(rec.events.map((e) => e.event_id).sort()).toEqual(['e_eeeeee01', 'e_rev00001', 'e_rev00002', 'e_rev00003']);
    expect(report.excluded.words).toBe(3);
    expect(verifyAudit(rec.audit).ok).toBe(true);
    expect(rec.audit.at(-1)).toMatchObject({ actor: 'restore', op: 'recover' });
  });
});

describe('recovery: accidental deletion and corruption outside the writer', () => {
  function damage(core: Core): Core {
    // Simulates a buggy sync / a connector clear: events wiped, a capture row deleted, glosses blanked.
    return {
      ...core,
      events: core.events.slice(0, 1),
      captures: [],
      words: core.words.map((w) => ({ ...w, en: '' })),
    };
  }

  it('detects the damage from the audit and from the snapshot diff', () => {
    const { core } = day();
    const snap = snapshot(core, T2);
    const broken = damage(core);
    expect(missingAuditedRows(broken).map((m) => m.key).sort()).toEqual(['c_cccccc01', 'e_rev00001', 'e_rev00002', 'e_rev00003']);
    const d = diffCore(restoreSnapshot(snap), broken);
    expect(d.events!.removed).toHaveLength(3);
    expect(d.words!.changed).toHaveLength(core.words.length);
  });

  it('restores every row and field; events from the phone are merged without duplicates', () => {
    const { core } = day();
    const snap = snapshot(core, T2);
    // After the snapshot the learner reviews twice more; the phone keeps its own copy of those events.
    const after = applyOps(core, [review('e_rev00004', 'w_aaaaaaa1', T3), review('e_rev00005', 'w_aaaaaaa2', T3)], { actor: 'app', ts: T3 }).core;
    const deviceEvents: Row[] = after.events.map((e) => ({ ...e })); // full copy, overlaps with Core
    const broken = damage(after);
    const { core: rec } = recover({ snap, damaged: broken, deviceEvents, now: T3 });
    expect(rec.events.map((e) => e.event_id).sort()).toEqual(after.events.map((e) => e.event_id).sort());
    expect(new Set(rec.events.map((e) => e.event_id)).size).toBe(rec.events.length);
    expect(rec.words).toEqual(core.words); // glosses back from the snapshot
    expect(rec.captures).toEqual(core.captures);
  });
});

describe('recovery: broken migration and corrupted backups', () => {
  it('a migration that drops a column is undone by restoring the snapshot', () => {
    const { core } = day();
    const snap = snapshot(core, T2);
    const migrated = { ...core, words: core.words.map(({ en: _drop, ...rest }) => rest as Row) };
    expect(migrated.words[0]).not.toHaveProperty('en');
    const restored = restoreSnapshot(snap);
    expect(restored.words).toEqual(core.words);
  });

  it('ATTACK a tampered backup is refused (fail closed), not restored', () => {
    const snap = snapshot(day().core, T2);
    const tampered = structuredClone(snap);
    tampered.tabs.words![0]!.de = 'Manipuliert';
    expect(verifySnapshot(tampered).ok).toBe(false);
    expect(() => restoreSnapshot(tampered)).toThrow(/snapshot_invalid/);
  });

  it('ATTACK a backup with a rewritten audit chain is refused', () => {
    const snap = snapshot(day().core, T2);
    const tampered = structuredClone(snap);
    tampered.tabs.audit![2]!.actor = 'app';
    expect(verifySnapshot(tampered).problems.join()).toMatch(/hash:audit|audit_chain/);
  });

  it('snapshots are deterministic: same Core, same manifest', () => {
    const { core } = day();
    expect(snapshot(core, T2).manifest).toEqual(snapshot(structuredClone(core), T2).manifest);
  });
});
