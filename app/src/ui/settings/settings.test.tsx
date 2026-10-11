import { render } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { toCsv } from '../../../../core/src/csv.ts';
import { setLocale } from '../../i18n';
import { cacheFromText, type SheetCache, type SheetConnection } from '../../sheet/sync';
import { DataSource } from './DataSource';
import { aiHealth, DEFAULT_FILL, FillMyList, gate, PROVIDER_HOME, type FillPrefs } from './FillMyList';

// Placeholders only: real sheet addresses never appear in the repo.
const REF = 'https://docs.google.com/spreadsheets/d/your-sheet-id/edit';
const words = toCsv([
  ['word', 'meaning', 'article', 'source', 'added'],
  ['Tisch', 'table', 'der', 'me', '2026-10-01'],
  ['Lampe', 'lamp', 'die', 'agent', '2026-10-09'],
  ['Kissen', 'pillow', 'das', 'agent', '2026-10-10'],
  ['Schrank', 'wardrobe', '', 'me', ''],
]);
const cache: SheetCache = cacheFromText(words, null, 1_700_000_000_000, { inbox: null, schema: { status: 'none' } }).cache;
const link: SheetConnection = { kind: 'link', wordsUrl: 'x', inboxUrl: '', metaUrl: '', fileName: '', connectedAt: 0 };
const prefs = (over: Partial<FillPrefs> = {}): FillPrefs => ({ ...DEFAULT_FILL, sheetRef: REF, ...over });
const noop = () => {};
const html = (el: preact.VNode) => render(el).replace(/<!-- -->/g, '');

setLocale('en');

describe('Fill my list: gating', () => {
  it('needs a connected sheet, a link (not a file), and the sheet address', () => {
    expect(gate(null, null, REF)).toBe('not_connected');
    expect(gate({ ...link, kind: 'file' }, cache, REF)).toBe('file_only');
    expect(gate(link, cache, '')).toBe('no_reference');
    expect(gate(link, cache, 'not a link')).toBe('no_reference');
    expect(gate(link, cache, REF)).toBe('ok');
  });

  it('not connected: one-sentence reason, both buttons disabled, no text box', () => {
    const out = html(<FillMyList connection={null} cache={null} prefs={prefs()} onPrefs={noop} />);
    expect(out).toContain('Connect your sheet first');
    expect(out.match(/<button[^>]*disabled[^>]*class="(primary|secondary)"|<button[^>]*class="(primary|secondary)"[^>]*disabled/g)).toHaveLength(2);
    expect(out).not.toContain('<textarea');
  });

  it('ready: buttons enabled, the text names the sheet and the exact column order', () => {
    const out = html(<FillMyList connection={link} cache={cache} prefs={prefs()} onPrefs={noop} />);
    expect(out).not.toContain('Connect your sheet first');
    expect(out).not.toMatch(/class="primary"[^>]*disabled/);
    expect(out).toContain(REF);
    expect(out).toContain('word | meaning | article | source | added');
    expect(out).toContain('Generate now');
  });

  it('an edited text without the critical parts gets a gentle warning, never a block', () => {
    const out = html(<FillMyList connection={link} cache={cache} prefs={prefs({ custom: 'Please add words.' })} onPrefs={noop} />);
    expect(out).toContain('Your text no longer contains');
    expect(out).toContain('Reset to default');
    expect(out).not.toMatch(/class="primary"[^>]*disabled/);
  });

  it('"Other" assistants: copy only, no site is opened', () => {
    expect(PROVIDER_HOME.other).toBeNull();
    const out = html(<FillMyList connection={link} cache={cache} prefs={prefs({ provider: 'other' })} onPrefs={noop} />);
    expect(out).toContain('Copy instructions');
    expect(out).not.toContain('Generate now');
  });

  it('German UI, German labels; the instructions stay as generated', () => {
    setLocale('de');
    const out = html(<FillMyList connection={null} cache={null} prefs={prefs()} onPrefs={noop} />);
    expect(out).toContain('Verbinde zuerst dein Sheet');
    setLocale('en');
  });
});

describe('Fill my list: health hint', () => {
  it('names the latest date of an AI row, neutrally', () => {
    expect(aiHealth(cache.rows)).toEqual({ kind: 'dated', date: '2026-10-10' });
    expect(aiHealth(cache.rows.filter((r) => r.meta.source !== 'agent'))).toEqual({ kind: 'none' });
    const out = html(<FillMyList connection={null} cache={null} prefs={prefs()} onPrefs={noop} />);
    expect(out).toContain('No AI rows yet');
  });
});

describe('Settings › Data', () => {
  const props = {
    wordCount: 4, skipped: 0, onConnect: async () => ({ ok: false as const, problem: 'empty' as const, field: 'words' as const }),
    onFile: async () => ({ ok: false as const, problem: 'empty' as const, field: 'words' as const }),
    onSync: async () => null, onDisconnect: noop, onUnskip: noop,
  };

  it('not connected: demo words in use, the guide, the warning and the fallback', () => {
    const out = html(<DataSource connection={null} cache={null} {...props} />);
    expect(out).toContain('Demo words');
    expect(out).toContain('Publish to web');
    expect(out).toContain('Anyone who has a published link can read that tab');
    expect(out).toContain('Import CSV file');
  });

  it('connected: the sheet in use, rows needing attention listed neutrally', () => {
    const out = html(<DataSource connection={link} cache={cache} {...props} />);
    expect(out).toMatch(/Your sheet · 4 words · synced/);
    expect(out).toContain('Connected: 4 rows, 1 need attention.');
    expect(out).toContain('Row 5');
    expect(out).toContain('Schrank');
    expect(out).toContain('article missing');
    expect(out).toContain('Sync now');
    expect(out).not.toMatch(/error|failed|wrong/i);
  });
});
