/**
 * Shape check for one stored learning event. IndexedDB returns whatever was written, by this or an
 * older version of the app, or by a bad restore; every record is checked before the engine sees it.
 */
import { EXERCISE_TYPES } from '../../../core/src/exercises.ts';
import type { LearnEvent } from '../../../core/src/scheduler.ts';

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

export function isLearnEvent(x: unknown): x is LearnEvent {
  if (!isObj(x)) return false;
  const { id, ts, wordId, kind, exercise, correct, ms, help, dontKnow, chosen, rating, gate } = x;
  return (
    typeof id === 'string' && id.length > 0 && id.length <= 64 &&
    typeof ts === 'number' && Number.isFinite(ts) && ts > 0 &&
    typeof wordId === 'string' && wordId.length > 0 && wordId.length <= 200 &&
    (kind === 'seen' || kind === 'review') &&
    typeof exercise === 'string' && (EXERCISE_TYPES as readonly string[]).includes(exercise) &&
    typeof correct === 'boolean' &&
    typeof ms === 'number' && Number.isFinite(ms) && ms >= 0 &&
    typeof help === 'boolean' &&
    typeof dontKnow === 'boolean' &&
    (chosen === undefined || typeof chosen === 'string') &&
    (rating === undefined || rating === 1 || rating === 2 || rating === 3 || rating === 4) &&
    (gate === undefined || typeof gate === 'boolean')
  );
}
