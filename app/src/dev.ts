/**
 * Development-only URL parameters for design review and screenshots. All of it is dead code in a
 * production build (every branch is behind import.meta.env.DEV).
 *   ?demo                 use the bundled demo deck even when a local seed exists
 *   ?theme=light|dark     force a colour scheme
 *   ?force=a,b,c          the first run shows these exercise types (one card each, the first word that has one)
 *   ?word=<de>            with force: only that word
 */
import { exercisesFor, type ExerciseType } from '@core/exercises.ts';
import type { RunCard } from '@core/engine/run.ts';
import type { WordRecord } from '@core/record.ts';

const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);

export const dev = {
  theme: import.meta.env.DEV ? params.get('theme') : null,
  force: import.meta.env.DEV ? params.get('force') : null,
  word: import.meta.env.DEV ? params.get('word') : null,
};

export function forcedCards(words: readonly WordRecord[]): RunCard[] {
  if (!dev.force) return [];
  const active = words.filter((w) => w.status === 'active');
  const out: RunCard[] = [];
  for (const type of dev.force.split(',') as ExerciseType[]) {
    for (const w of active) {
      if (dev.word && w.de !== dev.word) continue;
      const x = exercisesFor(w, active, { extended: true, fewerOptions: true }).find((e) => e.type === type);
      if (x && !out.some((c) => c.word.id === w.id)) { out.push({ word: w, exercise: x, reason: 'practice' }); break; }
    }
  }
  return out;
}
