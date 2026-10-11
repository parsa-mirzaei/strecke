import { blank, GAP } from '@core/exercises.ts';

/**
 * A sentence split around its single whole-word occurrence of `target`, for highlighting.
 * Returns null when the target is missing or appears more than once (then nothing is highlighted).
 */
export function splitTarget(sentence: string, target: string): [string, string, string] | null {
  if (!sentence || !target) return null;
  const gapped = blank(sentence, target);
  if (!gapped) return null;
  const i = gapped.indexOf(GAP);
  return [gapped.slice(0, i), target, gapped.slice(i + GAP.length)];
}
