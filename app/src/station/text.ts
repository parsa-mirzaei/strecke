import { blank, GAP } from '@core/exercises.ts';

/**
 * A sentence split around its single whole-word occurrence of `target`, for highlighting on a board.
 * Returns null when the target is missing or appears more than once (then nothing is highlighted).
 */
export function splitTarget(sentence: string, target: string): [string, string, string] | null {
  if (!sentence || !target) return null;
  const gapped = blank(sentence, target);
  if (!gapped) return null;
  const i = gapped.indexOf(GAP);
  return [gapped.slice(0, i), target, gapped.slice(i + GAP.length)];
}

export const DOMAIN_LABEL: Record<string, string> = {
  arbeit: 'Arbeit',
  alltag: 'Alltag',
  uni: 'Uni',
  amt: 'Amt',
  smalltalk: 'Gespräche',
};
