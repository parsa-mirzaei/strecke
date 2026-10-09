/**
 * Runs (Runden) in the event log (ENGINE.md "Runs"). A run is what one `composeRun` produced and the
 * learner worked through; the log knows it by `event.run`. Events from before runs existed (or from
 * another device) have no run id and are grouped by the inactivity gap instead, so every count in
 * the app can be recomputed from the log alone.
 */
import { sortEvents, type LearnEvent } from '../scheduler.ts';

const MIN = 60_000;

export interface RunSummary {
  id: string;
  start: number;
  end: number;
  /** Cards answered (Karte ratings included). */
  cards: number;
  /** Cards the learner got right or rated Gewusst/Sofort. */
  right: number;
  events: LearnEvent[];
}

/** After this much inactivity the next card starts a new run, and an unfinished run is left behind. */
export function gapExceeded(lastTs: number | null, now: number, gapMin: number): boolean {
  return lastTs !== null && now - lastTs > gapMin * MIN;
}

/** Every card the learner answered counts; a Karte without a rating (legacy `seen`) does too. */
export function splitRuns(events: readonly LearnEvent[], gapMin: number): RunSummary[] {
  const runs: RunSummary[] = [];
  let cur: RunSummary | null = null;
  const seen = new Set<string>();
  for (const e of sortEvents(events)) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const split =
      !cur ||
      gapExceeded(cur.end, e.ts, gapMin) ||
      (e.run !== undefined && e.run !== cur.id) ||
      (e.run === undefined && !cur.id.startsWith('gap:'));
    if (split) {
      cur = { id: e.run ?? `gap:${e.ts}`, start: e.ts, end: e.ts, cards: 0, right: 0, events: [] };
      runs.push(cur);
    }
    cur!.end = e.ts;
    cur!.cards++;
    if (e.kind === 'seen' || (e.correct && !e.dontKnow)) cur!.right++;
    cur!.events.push(e);
  }
  return runs;
}
