/**
 * Development-only URL parameters for design review and screenshots. All of it is dead code in a
 * production build (every branch is behind import.meta.env.DEV).
 *   ?demo                 use the bundled demo deck even when a local seed exists
 *   ?theme=light|dark     force a colour scheme
 *   ?force=a,b,c          the first run shows these exercise types (one card each, the first word that has one)
 *   ?word=<de>            with force: only that word
 *   ?pick=longest         with force: the word whose exercise has the most text (layout stress)
 *   ?sheet=stress|stress3|stress500   committed synthetic sheets through the real ingestion (data/source.ts)
 */
import { exercisesFor, type ExerciseType } from '@core/exercises.ts';
import type { RunCard } from '@core/engine/run.ts';
import type { WordRecord } from '@core/record.ts';

const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);

export const dev = {
  theme: import.meta.env.DEV ? params.get('theme') : null,
  force: import.meta.env.DEV ? params.get('force') : null,
  word: import.meta.env.DEV ? params.get('word') : null,
  pick: import.meta.env.DEV ? params.get('pick') : null,
};

export function forcedCards(words: readonly WordRecord[]): RunCard[] {
  if (!dev.force) return [];
  const active = words.filter((w) => w.status === 'active');
  const out: RunCard[] = [];
  const size = (x: { gapped: string; sentence: string; answer: string; options: string[]; tokens: string[] }, de: string) =>
    de.length + x.gapped.length + x.sentence.length + x.answer.length + x.options.join('').length + x.tokens.join('').length;
  for (const type of dev.force.split(',') as ExerciseType[]) {
    let best: RunCard | null = null, bestSize = -1;
    for (const w of active) {
      if (dev.word && w.de !== dev.word) continue;
      if (out.some((c) => c.word.id === w.id)) continue;
      const x = exercisesFor(w, active, { extended: true, fewerOptions: true }).find((e) => e.type === type);
      if (!x) continue;
      const n = size(x, w.de);
      if (!best || (dev.pick === 'longest' && n > bestSize)) { best = { word: w, exercise: x, reason: 'practice' }; bestSize = n; }
      if (dev.pick !== 'longest') break;
    }
    if (best) out.push(best);
  }
  return out;
}
