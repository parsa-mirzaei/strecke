import { applyOps, type Op } from '../src/writer.ts';
import { importInbox } from '../src/importer.ts';
import { seededBytes } from '../src/ids.ts';
import { INBOX_COLUMNS, INBOX_V1_COLUMNS, emptyCore, type Core, type Row } from '../src/schema.ts';

export const NOW = '2026-10-05T10:00:00Z';
export const LATER = '2026-10-05T11:00:00Z';

/** A valid expansion-stream Inbox **v1** row (synthetic, generic A2 content). */
export function goodRow(over: Partial<Record<(typeof INBOX_V1_COLUMNS)[number], string>> = {}): Row {
  const base: Row = Object.fromEntries(INBOX_V1_COLUMNS.map((c) => [c, '']));
  return {
    ...base,
    de: 'Fahrkarte', article: 'die', en: 'ticket', pos: 'noun', tier: 'core', domain: 'alltag',
    cloze_1: 'Ich habe meine ___ für den Zug vergessen.', answer_1: 'Fahrkarte', hint_1: 'ticket',
    cloze_2: 'Brauchst du noch eine ___ für den Bus?', answer_2: 'Fahrkarte',
    listen_de: 'Ich muss noch schnell eine Fahrkarte kaufen.', listen_en: 'I still need to buy a ticket.',
    wrong_1: 'platform', wrong_2: 'timetable', source: 'claude', run_id: 'claude-batch-20261005-1000',
    ...over,
  };
}

export const cells = (r: Row) => INBOX_V1_COLUMNS.map((c) => r[c] ?? '');
export const sheet = (...rows: Row[]) => [[...INBOX_V1_COLUMNS], ...rows.map(cells)];

/** A valid expansion-stream Inbox **v2** row: a full record (synthetic, generic A2 content). */
export function goodRowV2(over: Partial<Record<(typeof INBOX_COLUMNS)[number], string>> = {}): Row {
  const base: Row = Object.fromEntries(INBOX_COLUMNS.map((c) => [c, '']));
  return {
    ...base,
    de: 'Haltestelle', article: 'die', plural: 'Haltestellen', en: 'stop (bus, tram)', pos: 'noun', tier: 'core', domain: 'alltag',
    example_de: 'Wir steigen an der nächsten Haltestelle aus.', example_en: 'We get off at the next stop.', example_form: '',
    example_2_de: 'Die Haltestelle ist direkt vor dem Büro.', example_2_en: 'The stop is right in front of the office.',
    example_2_form: '', collocation: 'an der Haltestelle warten', prep: 'an', note: '', wrong_1: 'station hall',
    wrong_2: 'crossing', image_key: 'bus', source: 'claude', run_id: 'claude-batch-20261007-1000',
    ...over,
  };
}
export const cellsV2 = (r: Row) => INBOX_COLUMNS.map((c) => r[c] ?? '');
export const sheetV2 = (...rows: Row[]) => [[...INBOX_COLUMNS], ...rows.map(cellsV2)];

/** Core with a few existing words and one open capture, built through the writer so the audit is real. */
export function seededCore(): Core {
  let core = emptyCore();
  const word = (id: string, de: string, article: string, en: string, pos: string, tier: string, domain: string, status: string, key: string): Op => ({
    op: 'append', tab: 'words', row: {
      word_id: id, de, article, en, pos, tier, domain, family: '', start_stage: '0', image_url: '', image_ok: '',
      source: status === 'active' ? 'capture' : 'claude', status, dedupe_key: key, created_at: NOW, updated_at: NOW,
    },
  });
  core = applyOps(core, [
    word('w_aaaaaaa1', 'Besprechung', 'die', 'meeting', 'noun', 'core', 'arbeit', 'active', 'besprechung'),
    word('w_aaaaaaa2', 'Das klingt gut.', '', 'Sounds good.', 'phrase', 'chunk', 'smalltalk', 'active', 'das klingt gut'),
    word('w_aaaaaaa3', 'sich beschweren', '', 'to complain', 'verb', 'core', 'alltag', 'pending', 'beschweren'),
  ], { actor: 'importer', ts: NOW }).core;
  core = applyOps(core, [
    { op: 'append', tab: 'captures', row: { capture_id: 'c_cccccc01', ts: NOW, text: 'Verspätung', domain: 'alltag', context: 'train', status: 'new' } },
    { op: 'append', tab: 'events', row: { event_id: 'e_eeeeee01', ts: NOW, type: 'review', word_id: 'w_aaaaaaa1', prompt_id: '', card_type: 'meet', result: '1', ms: '900', payload: '', device: 'phone' } },
    { op: 'upsertWordState', row: { word_id: 'w_aaaaaaa1', stage: '2', due_at: LATER, lapses: '0', streak: '1', last_seen: NOW } },
  ], { actor: 'app', ts: NOW }).core;
  return core;
}

export function runImport(core: Core, inbox: unknown[][], seed = 7, now = NOW) {
  const res = importInbox({ core, inbox, now, randomBytes: seededBytes(seed) });
  const applied = res.ok ? applyOps(core, res.ops, { actor: 'importer', ts: now }) : undefined;
  return { res, core: applied?.core ?? core, writes: applied?.writes ?? [] };
}
