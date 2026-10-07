import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from '../src/csv.ts';
import { checkSeed, importSeed, seedReport } from '../src/seed.ts';
import { seededBytes } from '../src/ids.ts';
import { emptyCore } from '../src/schema.ts';
import { verifyAudit } from '../src/audit.ts';
import { exercisesFor } from '../src/exercises.ts';
import { MemoryStore } from '../src/data/adapter.ts';
import { LocalAdapter } from '../src/data/local.ts';
import { DemoAdapter } from '../src/data/demo.ts';
import type { LearnEvent } from '../src/scheduler.ts';
import { NOW } from './helpers.ts';

/** Synthetic fixture in the seed layout: two full rows, one chunk, one thin row. */
const SEED = toCsv([
  ['de', 'article', 'plural', 'en', 'pos', 'tier', 'domain', 'example_de', 'example_en', 'example_form', 'example_2_de', 'example_2_en', 'prep', 'start_stage'],
  ['Wohnung', 'die', 'Wohnungen', 'flat', 'noun', 'core', 'alltag', 'Wir suchen eine Wohnung.', "We're looking for a flat.", '', 'Die Wohnung ist hell.', 'The flat is bright.', 'in', '0'],
  ['warten', '', '', 'to wait', 'verb', '', 'alltag', 'Ich warte auf den Bus.', "I'm waiting for the bus.", 'warte', '', '', 'auf', '1'],
  ['Na klar!', '', '', 'Of course!', 'phrase', 'chunk', 'smalltalk', '„Kommst du mit?“ – „Na klar!“', '“Are you coming?” – “Of course!”', '', '', '', '', ''],
  ['Fenster', 'das', '', 'window', '', '', '', '', '', '', '', '', '', ''],
]);

describe('CSV', () => {
  it('parses quotes, doubled quotes, commas and line breaks inside quotes, CRLF and a BOM', () => {
    const text = '﻿a,b\r\n"x, y","say ""hi"""\r\n"two\nlines",z\n';
    expect(parseCsv(text)).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['two\nlines', 'z']]);
  });
  it('round-trips', () => {
    const rows = [['a', 'b,c'], ['"q"', 'line\nbreak']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
  it('refuses an unterminated quote', () => expect(() => parseCsv('"abc')).toThrow('csv_unterminated_quote'));
});

describe('seed check', () => {
  it('accepts full, chunk and thin rows', () => {
    const r = checkSeed(SEED);
    expect([r.ok, r.results.map((x) => x.reasons)]).toEqual([true, [[], [], [], []]]);
  });
  it('refuses unknown or duplicate columns, and a header without de/en', () => {
    expect(checkSeed('de,en,cloze_1\nA,b,c\n').error).toBe('unknown_columns:cloze_1');
    expect(checkSeed('de,en,en\nA,b,c\n').error).toBe('duplicate_columns');
    expect(checkSeed('de,article\nA,der\n').error).toBe('header_needs_de_and_en');
  });
  it('reports bad rows with line numbers; duplicates inside the file; bad start_stage', () => {
    const r = checkSeed('de,article,en,start_stage\nFenster,das,window,0\ndas Fenster,das,window,0\nTür,die,door,4\nBaum,,tree,0\n');
    expect(r.results.map((x) => [x.line, x.reasons])).toEqual([
      [2, []], [3, ['duplicate']], [4, ['bad_start_stage']], [5, ['missing:pos']],
    ]);
  });
  it('the report counts mix, coverage and generated exercises', () => {
    const rep = seedReport(checkSeed(SEED));
    expect([rep.valid, rep.thin, rep.withSecondExample, rep.byTier]).toEqual([4, 1, 1, { core: 3, chunk: 1 }]);
    expect(rep.exercises.karte).toBe(4);
  });
});

describe('seed import through the writer (actor seed)', () => {
  it('imports active seed words with start stages; the audit chain stays valid', () => {
    const { core, imported } = importSeed({ core: emptyCore(), csvText: SEED, now: NOW, randomBytes: seededBytes(3) });
    expect(imported).toBe(4);
    expect(core.words.map((w) => [w.de, w.status, w.source, w.start_stage])).toEqual([
      ['Wohnung', 'active', 'seed', '0'], ['warten', 'active', 'seed', '1'], ['Na klar!', 'active', 'seed', '0'], ['Fenster', 'active', 'seed', '0'],
    ]);
    expect(core.words[3]!.pos).toBe('noun');
    expect(verifyAudit(core.audit).ok).toBe(true);
  });
  it('importing the same file twice adds nothing', () => {
    const once = importSeed({ core: emptyCore(), csvText: SEED, now: NOW, randomBytes: seededBytes(3) }).core;
    const twice = importSeed({ core: once, csvText: SEED, now: NOW, randomBytes: seededBytes(4) });
    expect([twice.imported, twice.core.words.length]).toEqual([0, 4]);
  });
});

const clock = () => { let t = Date.parse('2026-10-07T09:00:00Z'); return () => (t += 1000); };
const local = () => new LocalAdapter({ store: new MemoryStore(), now: clock(), randomBytes: seededBytes(11), device: 'test' });
const event = (id: string, wordId: string, over: Partial<LearnEvent> = {}): LearnEvent => ({
  id, ts: Date.parse('2026-10-07T09:30:00Z'), wordId, kind: 'review', exercise: 'luecke', correct: true, ms: 1500, help: false, dontKnow: false, ...over,
});

describe('local adapter', () => {
  it('a row added to the local source appears with its exercises on the next load, no code change', async () => {
    const a = local();
    await a.importCsv(SEED);
    const before = await a.load();
    expect(before.words.map((w) => w.de)).toEqual(['Wohnung', 'warten', 'Na klar!', 'Fenster']);
    await a.importCsv('de,article,en,pos,domain,example_de,example_en\nBahnhof,der,station,noun,alltag,Wir treffen uns am Bahnhof.,We meet at the station.\n');
    const after = await a.load();
    const bahnhof = after.words.find((w) => w.de === 'Bahnhof')!;
    expect(exercisesFor(bahnhof, after.words).map((x) => x.type)).toEqual(['karte', 'artikel', 'bedeutung', 'luecke', 'hoeren', 'tippen']);
  });
  it('events are appended once (idempotent by id) and come back as learning events', async () => {
    const a = local();
    await a.importCsv(SEED);
    const id = (await a.load()).words[0]!.id;
    await a.appendEvents([event('e_00000001', id)]);
    await a.appendEvents([event('e_00000001', id), event('e_00000002', id, { kind: 'seen', exercise: 'karte' })]);
    const snap = await a.load();
    expect(snap.events.map((e) => [e.id, e.kind])).toEqual([['e_00000001', 'review'], ['e_00000002', 'seen']]);
  });
  it('events for unknown words are dropped instead of failing the batch', async () => {
    const a = local();
    await a.importCsv(SEED);
    await a.appendEvents([event('e_00000009', 'w_unknown1')]);
    expect((await a.load()).events).toEqual([]);
  });
  it('captures and status changes go through the writer', async () => {
    const a = local();
    await a.importCsv(SEED);
    const id = (await a.load()).words[1]!.id;
    await a.setWordStatus(id, 'suspended');
    await a.addCapture('Feierabend', 'arbeit');
    const snap = await a.load();
    expect(snap.words.map((w) => w.id)).not.toContain(id);
    expect(snap.suspended.map((w) => w.id)).toEqual([id]);
    const core = await a.core();
    expect(core.captures.map((c) => [c.text, c.status])).toEqual([['Feierabend', 'new']]);
    await expect(a.setWordStatus(id, 'rejected')).rejects.toThrow(/transition_not_allowed/);
  });
  it('config comes from the Core config tab, with defaults', async () => {
    const a = local();
    expect((await a.load()).config).toEqual({ newPerDay: 5, backlogPause: 40, retention: 0.9 });
  });
});

describe('demo adapter', () => {
  it('serves the bundled deck; state stays on the device; no captures', async () => {
    const store = new MemoryStore();
    const a = new DemoAdapter(store);
    const snap = await a.load();
    expect(snap.words.length).toBeGreaterThanOrEqual(20);
    await a.appendEvents([event('e_d0000001', snap.words[0]!.id), event('e_d0000001', snap.words[0]!.id)]);
    await a.setWordStatus(snap.words[1]!.id, 'suspended');
    const again = await new DemoAdapter(store).load();
    expect(again.events).toHaveLength(1);
    expect(again.suspended.map((w) => w.id)).toEqual([snap.words[1]!.id]);
    await expect(a.addCapture()).rejects.toThrow('not_in_demo');
  });
});
