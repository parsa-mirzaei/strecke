import { describe, expect, it } from 'vitest';
import { applyOps, WriteRejected, type Op } from '../src/writer.ts';
import { missingAuditedRows, verifyAudit } from '../src/audit.ts';
import { NOW, LATER, seededCore } from './helpers.ts';

const reject = (ops: unknown[], actor: 'importer' | 'app' | 'setup' | 'restore' = 'app') => {
  try {
    applyOps(seededCore(), ops as Op[], { actor, ts: LATER });
  } catch (e) {
    return (e as WriteRejected).reason;
  }
  return 'ACCEPTED';
};

const event = (id: string, extra: Record<string, string> = {}): Op => ({
  op: 'append', tab: 'events',
  row: { event_id: id, ts: LATER, type: 'review', word_id: 'w_aaaaaaa1', prompt_id: '', card_type: 'recall', result: '1', ms: '800', payload: '', device: 'phone', ...extra },
});

describe('no destructive verbs exist', () => {
  for (const op of ['delete', 'deleteRows', 'clear', 'clearTab', 'dropColumn', 'renameTab', 'overwrite', 'truncate'])
    it(`ATTACK op "${op}" -> rejected`, () => expect(reject([{ op, tab: 'words' }])).toMatch(/op_not_permitted/));
});

describe('actor permissions (importer = the AI-facing path)', () => {
  it('ATTACK importer appends events (fake learner history) -> rejected', () =>
    expect(reject([event('e_fake0001')], 'importer')).toBe('append_not_permitted:events'));
  it('ATTACK importer activates a pending word -> rejected', () =>
    expect(reject([{ op: 'setWordStatus', word_id: 'w_aaaaaaa3', to: 'active' }], 'importer')).toMatch(/op_not_permitted/));
  it('ATTACK importer edits an existing word -> rejected', () =>
    expect(reject([{ op: 'editWord', word_id: 'w_aaaaaaa1', patch: { en: 'party' } }], 'importer')).toMatch(/op_not_permitted/));
  it('ATTACK importer writes word_state / config -> rejected', () => {
    expect(reject([{ op: 'upsertWordState', row: { word_id: 'w_aaaaaaa1', stage: '5', due_at: '', lapses: '0', streak: '9', last_seen: '' } }], 'importer')).toMatch(/op_not_permitted/);
    expect(reject([{ op: 'setConfig', key: 'new_per_day', value: '999' }], 'importer')).toMatch(/op_not_permitted/);
  });
  it('ATTACK importer appends an AI word as active -> rejected', () => {
    const row = { word_id: 'w_bbbbbbb1', de: 'Miete', article: 'die', en: 'rent', pos: 'noun', tier: 'core', domain: 'alltag', family: '', start_stage: '0', image_url: '', image_ok: '', source: 'claude', status: 'active', dedupe_key: 'miete', created_at: LATER, updated_at: LATER };
    expect(reject([{ op: 'append', tab: 'words', row }], 'importer')).toBe('ai_word_must_be_pending');
    expect(reject([{ op: 'append', tab: 'words', row: { ...row, status: 'pending', source: 'seed', start_stage: '2' } }], 'importer')).toBe('source_not_allowed');
  });
  it('ATTACK app appends words directly -> rejected', () =>
    expect(reject([{ op: 'append', tab: 'words', row: {} }], 'app')).toBe('append_not_permitted:words'));
  it('ATTACK unknown actor -> rejected', () => expect(reject([event('e_x0000001')], 'agent' as never)).toBe('unknown_actor'));
  it('ATTACK restore actor cannot use ops at all', () => expect(reject([event('e_x0000002')], 'restore')).toMatch(/op_not_permitted/));
});

describe('immutability and integrity', () => {
  it('ATTACK duplicate ID with different content -> rejected (IDs are immutable)', () =>
    expect(reject([event('e_eeeeee01', { result: '0' })])).toBe('key_conflict:e_eeeeee01'));
  it('replayed identical event -> no-op, no new audit entry (sync idempotency)', () => {
    const core = seededCore();
    const replay = core.events[0]!;
    const r = applyOps(core, [{ op: 'append', tab: 'events', row: { ...replay } }], { actor: 'app', ts: LATER });
    expect([r.applied, r.noops, r.core.events.length, r.core.audit.length]).toEqual([0, 1, 1, core.audit.length]);
  });
  it('ATTACK malformed IDs -> rejected', () => {
    expect(reject([event('e_../x')])).toBe('bad_id:event_id');
    expect(reject([event('E_AAAAAAAA')])).toBe('bad_id:event_id');
  });
  it('ATTACK unknown column smuggled into a row -> rejected', () =>
    expect(reject([{ op: 'append', tab: 'events', row: { ...(event('e_x0000003') as { row: Record<string, string> }).row, admin: '1' } }])).toMatch(/unknown_column:admin/));
  it('ATTACK formula in an app-written cell -> rejected', () =>
    expect(reject([event('e_x0000004', { payload: '=IMPORTXML("http://x","//a")' })])).toBe('formula_prefix:payload'));
  it('ATTACK oversized payload -> rejected', () =>
    expect(reject([event('e_x0000005', { payload: 'x'.repeat(5000) })])).toBe('too_long:payload'));
  it('ATTACK event for a word that does not exist -> rejected', () =>
    expect(reject([event('e_x0000006', { word_id: 'w_nothere1' })])).toBe('event_for_unknown_word'));
  it('ATTACK editWord tries to change word_id / status / source -> rejected', () => {
    for (const patch of [{ word_id: 'w_bbbbbbb9' }, { status: 'active' }, { source: 'seed' }])
      expect(reject([{ op: 'editWord', word_id: 'w_aaaaaaa1', patch }])).toBe('field_not_editable');
  });
  it('ATTACK editWord renames a word onto another word (dedupe bypass) -> rejected', () =>
    expect(reject([{ op: 'editWord', word_id: 'w_aaaaaaa3', patch: { de: 'Besprechung' } }])).toBe('dedupe_conflict'));
  it('ATTACK illegal status transitions -> rejected', () => {
    expect(reject([{ op: 'setWordStatus', word_id: 'w_aaaaaaa1', to: 'pending' }])).toBe('transition_not_allowed:active->pending');
    expect(reject([{ op: 'setWordStatus', word_id: 'w_aaaaaaa1', to: 'deleted' }])).toMatch(/transition_not_allowed/);
  });
  it('ATTACK overwrite protected config key / out-of-range value -> rejected', () => {
    expect(reject([{ op: 'setConfig', key: 'APP_TOKEN', value: '1' }])).toBe('config_key_not_allowed');
    expect(reject([{ op: 'setConfig', key: 'new_per_day', value: '100000' }])).toBe('bad_config_value');
  });
  it('ATTACK corrupt required fields in word_state -> rejected', () => {
    const base = { word_id: 'w_aaaaaaa1', stage: '2', due_at: LATER, lapses: '0', streak: '1', last_seen: NOW };
    for (const bad of [{ stage: '9' }, { stage: '' }, { lapses: '-1' }, { due_at: 'tomorrow' }, { word_id: 'w_nothere1' }])
      expect(reject([{ op: 'upsertWordState', row: { ...base, ...bad } }])).not.toBe('ACCEPTED');
  });
  it('a batch is all-or-nothing: one bad op leaves Core untouched', () => {
    const core = seededCore();
    const before = JSON.stringify(core);
    expect(() => applyOps(core, [event('e_ok000001'), event('e_ok000002'), { op: 'clear' } as unknown as Op], { actor: 'app', ts: LATER })).toThrow(WriteRejected);
    expect(JSON.stringify(core)).toBe(before);
  });
  it('the storage adapter only receives append and keyed update writes', () => {
    const r = applyOps(seededCore(), [
      { op: 'setWordStatus', word_id: 'w_aaaaaaa3', to: 'active' },
      event('e_ok000003'),
      { op: 'upsertWordState', row: { word_id: 'w_aaaaaaa1', stage: '3', due_at: LATER, lapses: '0', streak: '2', last_seen: LATER } },
      { op: 'setConfig', key: 'new_per_day', value: '6' },
    ], { actor: 'app', ts: LATER });
    expect(r.writes.every((w) => w.kind === 'append' || w.kind === 'update')).toBe(true);
    expect(r.writes.filter((w) => w.kind === 'update').map((w) => w.tab).sort()).toEqual(['word_state', 'words']);
  });
});

describe('audit trail', () => {
  it('every applied op is chained; tampering anywhere is detected', () => {
    const core = seededCore();
    expect(verifyAudit(core.audit).ok).toBe(true);
    const edited = core.audit.map((e) => ({ ...e }));
    edited[1]!.detail = '{"status":"active"}';
    expect(verifyAudit(edited)).toMatchObject({ ok: false, brokenAt: 2 });
    expect(verifyAudit(core.audit.filter((_, i) => i !== 2))).toMatchObject({ ok: false, brokenAt: 3 });
    expect(verifyAudit([core.audit[1]!, core.audit[0]!, ...core.audit.slice(2)])).toMatchObject({ ok: false, brokenAt: 1 });
  });
  it('truncating the tail is caught by the head anchored in a backup', () => {
    const core = seededCore();
    const head = core.audit[core.audit.length - 1]!.hash!;
    expect(verifyAudit(core.audit.slice(0, -1), head)).toMatchObject({ ok: false, reason: 'anchored_head_missing' });
  });
  it('rows deleted outside the writer are found via the audit', () => {
    const core = seededCore();
    const damaged = { ...core, events: [], words: core.words.slice(1) };
    expect(missingAuditedRows(damaged).map((m) => m.key).sort()).toEqual(['e_eeeeee01', 'w_aaaaaaa1']);
  });
});
