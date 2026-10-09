/**
 * Synthetic event logs for checking Verlauf (round 3, section 4): the real engine composes the runs, the
 * synthetic learner (sim.ts) answers. Same caveat as the simulator: the learner is an assumption.
 */
import { composeRun } from '../engine/run.ts';
import { rng } from '../engine/rng.ts';
import { DEFAULT_SETTINGS } from '../engine/settings.ts';
import type { WordRecord } from '../record.ts';
import type { LearnEvent } from '../scheduler.ts';
import { pCorrect } from './sim.ts';

const DAY = 86_400_000;

export type LogShape = 'empty' | '3d' | '30d' | 'spiky';

/** Cards per day, oldest day first, for each named shape. `spiky`: a day with one card and a day with 200. */
export function shapeCards(shape: LogShape): number[] {
  switch (shape) {
    case 'empty': return [];
    case '3d': return [6, 12, 4];
    case '30d': return Array.from({ length: 30 }, (_, i) => [6, 12, 0, 18, 6, 24, 0][i % 7]!);
    case 'spiky': return [6, 1, 0, 200, 12, 6, 30];
  }
}

/** A log ending on `endDay` (start of today, local), `cardsPerDay[i]` cards on day i, in runs of six. */
export function syntheticLog(words: readonly WordRecord[], cardsPerDay: readonly number[], endDay: number, seed = 'log'): LearnEvent[] {
  const r = rng(seed);
  const events: LearnEvent[] = [];
  const truth = new Map<string, { s: number; last: number; d: number; practice: Record<string, number> }>();
  let n = 0;
  cardsPerDay.forEach((cards, i) => {
    const day = endDay - (cardsPerDay.length - 1 - i) * DAY;
    for (let done = 0, k = 0; done < cards; k++) {
      const now = day + 7 * 3_600_000 + k * 25 * 60_000;
      const run = `r_log${i}_${k}`;
      const want = Math.min(6, cards - done);
      const picks = composeRun({ words, events, settings: { ...DEFAULT_SETTINGS, runLength: want }, now, seed: `${seed}${i}${k}`, canListen: true });
      if (!picks.length) break;
      picks.forEach((c, j) => {
        const ts = now + j * 20_000;
        let t = truth.get(c.word.id);
        if (!t) { t = { s: 0.4, last: ts, d: 0.8 + 0.4 * r(), practice: {} }; truth.set(c.word.id, t); }
        const ok = r() < pCorrect(t, c.exercise.type, ts);
        if (ok) t.s *= 2.2; else t.s = Math.max(0.3, t.s * 0.4);
        t.last = ts;
        t.practice[c.exercise.type] = (t.practice[c.exercise.type] ?? 0) + 1;
        const e: LearnEvent = {
          id: `e_l${String(++n).padStart(7, '0')}`, ts, wordId: c.word.id, kind: 'review', exercise: c.exercise.type,
          correct: ok, ms: 3000, help: false, dontKnow: false, run, ...(c.exercise.type === 'karte' ? { rating: ok ? 3 : 1 } : {}),
        };
        events.push(e);
      });
      done += picks.length;
    }
  });
  return events;
}
