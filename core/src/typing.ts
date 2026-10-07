/**
 * Forgiving matching for typed answers (Tippen, DECISIONS D40).
 *
 *   exact  – same text after trimming, NFC, collapsing spaces and dropping final punctuation
 *   loose  – differs only in case, ß/ss or ä/ae-style spelling: correct, the right spelling is shown quietly
 *   near   – one edit away (two for answers of 10+ characters): counts as correct, rated "hard", shows "Fast: …"
 *   wrong  – anything else, including an empty answer
 * A typed leading article that matches the word's own article is ignored ("die Haltestelle").
 */
import { clean } from './text.ts';

export type TypedVerdict = 'exact' | 'loose' | 'near' | 'wrong';

const strip = (s: string) => clean(s).replace(/[.!?…,;:]+$/, '').trim();

function loose(s: string): string {
  return s.toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/[„“”"‚‘’']/g, '');
}

/** Levenshtein distance with an early exit once it exceeds `max`. */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

export function matchTyped(input: string, answer: string, article = ''): TypedVerdict {
  let given = strip(input);
  const want = strip(answer);
  if (!given || !want) return 'wrong';
  if (article) {
    const prefix = new RegExp(`^${article} `, 'i');
    if (prefix.test(given) && !prefix.test(want)) given = given.replace(prefix, '');
  }
  if (given === want) return 'exact';
  const a = loose(given), b = loose(want);
  if (a === b) return 'loose';
  const allowed = want.length >= 10 ? 2 : 1;
  return editDistance(a, b, allowed) <= allowed && want.length >= 3 ? 'near' : 'wrong';
}

/** Correct for scheduling purposes (near misses count; they are rated "hard"). */
export const isCorrect = (v: TypedVerdict) => v !== 'wrong';
