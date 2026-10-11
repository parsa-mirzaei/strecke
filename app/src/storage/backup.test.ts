import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, makeExport, parseSettings } from '@core/engine/settings.ts';
import { eventToRow, type LearnEvent } from '@core/scheduler.ts';
import { buildBackup, dryRun, shouldHintBackup } from './backup';
import { persistState, requestPersist, shouldAskPersist } from './persist';

const ev = (i: number): LearnEvent => ({ id: `e_${String(i).padStart(8, '0')}`, ts: 1_790_000_000_000 + i, wordId: 'w_abcdefgh', kind: 'review', exercise: 'luecke', correct: true, ms: 900, help: false, dontKnow: false });

describe('backup', () => {
  it('Next reads a file exported by the Stable build (same envelope, .json)', () => {
    const stableFile = JSON.stringify(makeExport(parseSettings({ theme: 'dark' }), [ev(1), ev(2)].map((e) => eventToRow(e)), 0), null, 2);
    const d = dryRun(stableFile, new Set(), DEFAULT_SETTINGS);
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect([d.answers, d.fresh.length, d.already, d.skipped, d.channel]).toEqual([2, 2, 0, 0, 'stable']);
      expect(d.settingsChanged).toEqual(['theme']);
    }
  });
  it('the dry run shows what is new, what is already here and what is skipped, before anything changes', () => {
    const f = buildBackup(DEFAULT_SETTINGS, [ev(1), ev(2), ev(3)], 0, 'next');
    const tampered = JSON.parse(f.text);
    tampered.events.push({ bogus: true });
    const d = dryRun(JSON.stringify(tampered), new Set(['e_00000001']), DEFAULT_SETTINGS);
    expect(d.ok && [d.answers, d.fresh.length, d.already, d.skipped, d.settingsChanged.length]).toEqual([3, 2, 1, 1, 0]);
  });
  it('is a .txt file holding JSON (Chrome shares text/plain, not JSON); no key material', () => {
    const f = buildBackup(DEFAULT_SETTINGS, [ev(1)], Date.parse('2026-10-11T10:00:00Z'), 'next');
    expect(f.name).toBe('strecke-backup-2026-10-11.txt');
    expect(JSON.parse(f.text).channel).toBe('next');
    expect(f.text).not.toMatch(/xi-api|api[_-]?key|token/i);
  });
  it('rejects other files with a reason', () => {
    expect(dryRun('hello', new Set(), DEFAULT_SETTINGS)).toEqual({ ok: false, error: 'not_json' });
    expect(dryRun('{"a":1}', new Set(), DEFAULT_SETTINGS)).toEqual({ ok: false, error: 'not_a_strecke_backup' });
  });
  it('one gentle hint after ten runs without a backup, once', () => {
    expect(shouldHintBackup(9, false)).toBe(false);
    expect(shouldHintBackup(10, false)).toBe(true);
    expect(shouldHintBackup(30, true)).toBe(false);
  });
});

describe('persistent storage', () => {
  it('asks only after a completed run, once per visit, while not protected', () => {
    expect(shouldAskPersist(0, 'not-protected', false)).toBe(false);
    expect(shouldAskPersist(1, 'not-protected', false)).toBe(true);
    expect(shouldAskPersist(1, 'not-protected', true)).toBe(false);
    expect(shouldAskPersist(3, 'protected', false)).toBe(false);
  });
  it('reports the state and never throws', async () => {
    expect(await persistState(undefined)).toBe('unsupported');
    expect(await persistState({ persisted: async () => true })).toBe('protected');
    expect(await requestPersist({ persisted: async () => false, persist: async () => false })).toBe('not-protected');
    expect(await requestPersist({ persist: async () => { throw new Error('x'); } })).toBe('unsupported');
  });
});
