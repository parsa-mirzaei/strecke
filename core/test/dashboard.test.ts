import { describe, expect, it } from 'vitest';
import { dashboard, levelOf, secureTimes, SECURE_STABILITY_DAYS } from '../src/engine/stats.ts';
import { DEFAULT_SETTINGS, LIMITS, makeExport, parseSettings, readExport } from '../src/engine/settings.ts';
import { eventFromRow, eventToRow, initialState, type LearnEvent } from '../src/scheduler.ts';
import { by, sheet } from './fixtures/engine-sheet.ts';

// Wednesday 2026-10-07, UTC.
const NOON = Date.parse('2026-10-07T12:00:00Z');
const MIN = 60_000, DAY = 86_400_000;
const all = sheet();
const termin = by(all, 'Termin'), rechnung = by(all, 'Rechnung'), verspaetung = by(all, 'Verspätung');

let n = 0;
const ev = (w: { id: string }, ts: number, over: Partial<LearnEvent> = {}): LearnEvent => ({
  id: `e_${String(++n).padStart(8, '0')}`, ts, wordId: w.id, kind: 'review', exercise: 'luecke', correct: true, ms: 2000,
  help: false, dontKnow: false, run: `r${Math.floor(ts / (10 * MIN))}`, ...over,
});
const dash = (events: LearnEvent[], extra: Partial<Parameters<typeof dashboard>[0]> = {}) =>
  dashboard({ words: all, events, now: NOON, tzOffsetMin: 0, ...extra });

describe('dashboard', () => {
  it('empty log: marked empty, zero counts, nothing hard, no goal', () => {
    const d = dash([]);
    expect(d.empty).toBe(true);
    expect(d.today).toMatchObject({ runs: 0, cards: 0, secured: 0 });
    expect(d.words).toMatchObject({ new: all.length, learning: 0, secure: 0 });
    expect(d.hard).toEqual({ words: [], kinds: [], topics: [] });
    expect(d.goal).toBeNull();
  });

  it('micro-sessions add up: three short runs on one day are three runs, cards summed', () => {
    const day = Date.parse('2026-10-07T07:00:00Z');
    const events = [
      ev(termin, day), ev(termin, day + MIN), ev(rechnung, day + 2 * MIN),
      ev(termin, day + 3 * 60 * MIN), ev(rechnung, day + 3 * 60 * MIN + MIN),
      ev(verspaetung, day + 6 * 60 * MIN),
    ];
    const d = dash(events);
    expect(d.today).toMatchObject({ runs: 3, cards: 6 });
    expect(d.week).toMatchObject({ runs: 3, cards: 6 });
    expect(d.week.days.map((x) => x.runs)).toEqual([0, 0, 3, 0, 0, 0, 0]);
    expect(d.week.todayIndex).toBe(2);
  });

  it('the week runs Monday to Sunday; older events are outside it', () => {
    const d = dash([ev(termin, Date.parse('2026-10-05T09:00:00Z')), ev(termin, Date.parse('2026-10-04T09:00:00Z'))]);
    expect(d.week.days[0]!.date).toBe('2026-10-05');
    expect(d.week.days[0]!.runs).toBe(1);
    expect(d.week.runs).toBe(1);
  });

  it('the time zone decides which day an event belongs to', () => {
    const late = Date.parse('2026-10-06T23:30:00Z');
    expect(dash([ev(termin, late)], { tzOffsetMin: 0 }).week.days[1]!.runs).toBe(1);
    expect(dash([ev(termin, late)], { tzOffsetMin: 120 }).week.days[2]!.runs).toBe(1);
  });

  it('word states: new, learning, secure by FSRS stability', () => {
    const events: LearnEvent[] = [];
    // Termin: reviewed many times, spread out → long memory.
    for (let i = 0; i < 8; i++) events.push(ev(termin, NOON - (60 - i * 7) * DAY, { run: `t${i}` }));
    events.push(ev(rechnung, NOON - DAY, { exercise: 'karte', rating: 3, correct: true }));
    const d = dash(events);
    expect(d.words.secure).toBe(1);
    expect(d.words.learning).toBe(1);
    expect(d.words.new).toBe(all.length - 2);
    expect(d.words.total).toBe(all.length);
    expect(SECURE_STABILITY_DAYS).toBe(21);
    expect(levelOf(undefined)).toBe('new');
    expect(levelOf(initialState(termin))).toBe('new');
  });

  it('a word that became secure is counted on the day it crossed the line', () => {
    const events: LearnEvent[] = [];
    for (let i = 0; i < 8; i++) events.push(ev(termin, NOON - (60 - i * 7) * DAY, { run: `t${i}` }));
    const when = secureTimes(all, events, 0.9).get(termin.id)!;
    expect(when).toBeGreaterThan(0);
    const d = dash(events);
    const total = d.week.days.reduce((s, x) => s + x.secured, 0);
    expect(total).toBe(when >= Date.parse('2026-10-05T00:00:00Z') ? 1 : 0);
  });

  it('where it is hard: neutral lists, only with enough evidence', () => {
    const events: LearnEvent[] = [];
    // Verspätung: 4 attempts, 3 misses. Rechnung: 4 attempts, none. Plural exercises on other words: 9 attempts, 6 misses.
    ['a', 'b', 'c'].forEach((r, i) => events.push(ev(verspaetung, NOON - (10 - i) * DAY, { correct: false, run: r })));
    events.push(ev(verspaetung, NOON - 5 * DAY, { run: 'd' }));
    for (let i = 0; i < 4; i++) events.push(ev(rechnung, NOON - (9 - i) * DAY, { run: `x${i}` }));
    for (let i = 0; i < 9; i++) events.push(ev(i % 3 === 0 ? termin : by(all, i % 2 ? 'Haltestelle' : 'Fenster'), NOON - (30 + i) * DAY, { exercise: 'plural', correct: i % 3 !== 1 && i % 3 !== 2 ? true : false, run: `p${i}` }));
    const d = dash(events);
    expect(d.hard.words.map((x) => x.label)).toContain('Verspätung');
    expect(d.hard.words.map((x) => x.label)).not.toContain('Rechnung');
    expect(d.hard.kinds.map((x) => x.kind)).toContain('plural');
    expect(d.hard.kinds.find((x) => x.kind === 'plural')!.wordIds.length).toBeGreaterThan(0);
    // topics need enough attempts and a visible share
    for (const t of d.hard.topics) expect(t.attempts).toBeGreaterThanOrEqual(8);
  });

  it('Karte rated Nicht gewusst counts as a miss, Gewusst does not', () => {
    const mk = (ratings: number[]) => ratings.map((r, i) => ev(rechnung, NOON - (5 - i) * DAY, { exercise: 'karte', rating: r as 1 | 3, correct: r > 1, run: `k${i}` }));
    expect(dash(mk([1, 1, 3, 3])).hard.words.map((x) => x.label)).toEqual(['Rechnung']);
    expect(dash(mk([1, 3, 3, 3])).hard.words).toEqual([]); // one miss is not a pattern
  });

  it('goal appears only when the learner switched it on', () => {
    const events = [ev(termin, NOON - 3600_000), ev(termin, NOON - 7200_000 * 3, { run: 'z' })];
    expect(dash(events).goal).toBeNull();
    const on = dash(events, { settings: { runGapMin: 20, goal: { enabled: true, runsPerWeek: 4 } } });
    expect(on.goal).toEqual({ target: 4, done: on.week.runs });
  });

  it('events of unknown or suspended words are ignored', () => {
    const d = dash([ev({ id: 'w_nobody00' }, NOON - 1000)]);
    expect(d.empty).toBe(true);
    expect(dash([ev(termin, NOON - 1000)], { words: all.map((w) => ({ ...w, status: 'suspended' })) }).words.total).toBe(0);
  });

  it('forbidden measures do not exist in the result', () => {
    const keys = JSON.stringify(Object.keys(dash([ev(termin, NOON - 1000)]))) + JSON.stringify(Object.keys(dash([]).week));
    expect(keys).not.toMatch(/streak|overdue|backlog|forecast|due/i);
  });
});

describe('settings', () => {
  it('defaults are valid and stable through a parse', () => {
    expect(parseSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('garbage')).toEqual(DEFAULT_SETTINGS);
  });
  it('defaults: goal off, device voice, prefetch off, nothing disabled', () => {
    expect(DEFAULT_SETTINGS.goal.enabled).toBe(false);
    expect(DEFAULT_SETTINGS.audio).toMatchObject({ provider: 'device', prefetch: false });
    expect(DEFAULT_SETTINGS.disabled).toEqual([]);
    expect(DEFAULT_SETTINGS.runGapMin).toBe(20);
    expect(DEFAULT_SETTINGS.runLength).toBe(6);
  });
  it('clamps numbers, drops unknown values, never lets Karte be switched off', () => {
    const s = parseSettings({
      runLength: 99, newPerRun: -4, runGapMin: '45', theme: 'neon', haptics: 'yes', disabled: ['karte', 'tippen', 'tippen', 'nope'],
      goal: { enabled: true, runsPerWeek: 0 }, audio: { provider: 'cloud', voiceId: 'abc DEF!!123', dailyCharCap: 1e9 },
    });
    expect(s.runLength).toBe(LIMITS.runLength[1]);
    expect(s.newPerRun).toBe(0);
    expect(s.runGapMin).toBe(45);
    expect(s.theme).toBe('system');
    expect(s.haptics).toBe(true);
    expect(s.disabled).toEqual(['tippen']);
    expect(s.goal).toEqual({ enabled: true, runsPerWeek: 1 });
    expect(s.audio.provider).toBe('device');
    expect(s.audio.voiceId).toBe('abcDEF123');
    expect(s.audio.dailyCharCap).toBe(LIMITS.dailyCharCap[1]);
  });
  it('new cards per run never exceed the run length', () => {
    expect(parseSettings({ runLength: 3, newPerRun: 6 }).newPerRun).toBe(3);
  });
  it('export → import round trip keeps events and settings; no key material in the file', () => {
    const e = ev(termin, NOON);
    const settings = parseSettings({ audio: { provider: 'elevenlabs', voiceId: 'v1' }, theme: 'dark' });
    const text = JSON.stringify(makeExport(settings, [eventToRow(e)], NOON));
    expect(text).not.toMatch(/api[_-]?key|xi-api|secret|token/i);
    const back = readExport(text, (x) => eventFromRow(x as Record<string, string>) !== null);
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.settings).toEqual(settings);
      expect(back.events).toHaveLength(1);
    }
  });
  it('import rejects other files and drops malformed events', () => {
    const isEvent = (x: unknown) => eventFromRow(x as Record<string, string>) !== null;
    expect(readExport('nope', isEvent)).toEqual({ ok: false, error: 'not_json' });
    expect(readExport('{"a":1}', isEvent)).toEqual({ ok: false, error: 'not_a_strecke_backup' });
    expect(readExport('{"app":"strecke","kind":"backup","version":9}', isEvent)).toEqual({ ok: false, error: 'unknown_version' });
    const r = readExport(JSON.stringify({ app: 'strecke', kind: 'backup', version: 1, settings: {}, events: [{ bogus: true }] }), isEvent);
    expect(r.ok && r.events).toEqual([]);
  });
});
