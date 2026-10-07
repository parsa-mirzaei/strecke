/**
 * FSRS-5 memory model (DECISIONS D41): stability S (days until recall falls to 90 %), difficulty D
 * (1–10), retrievability R. Formulas and default parameters follow the published FSRS-5 algorithm of
 * the open-spaced-repetition project (MIT). Pure functions, no dependency; time in days.
 *
 * Ratings: 1 Again, 2 Hard, 3 Good, 4 Easy. Strecke infers them from behaviour (scheduler.ts) and
 * never shows them.
 */

export type Rating = 1 | 2 | 3 | 4;

/** FSRS-5 default parameters w0..w18. */
export const W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925,
  1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
] as const;

const w = (i: number) => W[i]!;
const DECAY = -0.5;
const FACTOR = 19 / 81; // so that R(S, S) = 0.9
const S_MIN = 0.01;
export const MAX_INTERVAL_DAYS = 120;

export interface Memory {
  stability: number;
  difficulty: number;
}

const clampD = (d: number) => Math.min(10, Math.max(1, d));

/** Probability of recall after `t` days at stability `s`. */
export function retrievability(t: number, s: number): number {
  return Math.pow(1 + (FACTOR * Math.max(0, t)) / s, DECAY);
}

/** Days until recall falls to `retention`, capped at MAX_INTERVAL_DAYS. */
export function interval(s: number, retention: number): number {
  const days = (s / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
  return Math.min(MAX_INTERVAL_DAYS, Math.max(0, days));
}

function initialDifficulty(g: Rating): number {
  return w(4) - Math.exp(w(5) * (g - 1)) + 1;
}

/** Memory after the first graded review. */
export function initMemory(g: Rating): Memory {
  return { stability: Math.max(S_MIN, w(g - 1)), difficulty: clampD(initialDifficulty(g)) };
}

function nextDifficulty(d: number, g: Rating): number {
  const delta = -w(6) * (g - 3);
  const damped = d + (delta * (10 - d)) / 9; // linear damping: D moves less as it nears 10
  return clampD(w(7) * initialDifficulty(4) + (1 - w(7)) * damped); // mean reversion
}

function recallStability(d: number, s: number, r: number, g: Rating): number {
  const hard = g === 2 ? w(15) : 1;
  const easy = g === 4 ? w(16) : 1;
  return s * (Math.exp(w(8)) * (11 - d) * Math.pow(s, -w(9)) * (Math.exp(w(10) * (1 - r)) - 1) * hard * easy + 1);
}

function forgetStability(d: number, s: number, r: number): number {
  const sf = w(11) * Math.pow(d, -w(12)) * (Math.pow(s + 1, w(13)) - 1) * Math.exp(w(14) * (1 - r));
  return Math.min(sf, s);
}

/** Same-day review (FSRS-5 short-term stability). */
function shortTermStability(s: number, g: Rating): number {
  return s * Math.exp(w(17) * (g - 3 + w(18)));
}

/** Memory after a review `elapsedDays` after the previous one. */
export function review(m: Memory, elapsedDays: number, g: Rating): Memory {
  const { stability: s, difficulty: d } = m;
  let next: number;
  if (elapsedDays < 1) next = shortTermStability(s, g);
  else {
    const r = retrievability(elapsedDays, s);
    next = g === 1 ? forgetStability(d, s, r) : recallStability(d, s, r, g);
  }
  return { stability: Math.max(S_MIN, next), difficulty: nextDifficulty(d, g) };
}
