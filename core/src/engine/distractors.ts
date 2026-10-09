/**
 * Distractors for choice exercises (ENGINE.md "Distractors").
 *
 * Every wrong option is another value from the learner's own records: never an external word list.
 * Candidates are ranked, not picked at random: previously confused options first, then the same
 * word class and tier, similar length and shape. Hard rules drop a candidate when it could also be a
 * correct answer ("if unsure, drop it"). A request that cannot be met returns null, and the caller
 * falls back to fewer options or another exercise.
 */
import type { WordRecord } from '../record.ts';
import { clean } from '../text.ts';
import { hash } from './rng.ts';

/** wordId → folded wrong option the learner chose → how often. Built from the event log. */
export type Confusions = ReadonlyMap<string, ReadonlyMap<string, number>>;

export const fold = (s: string) => clean(s).toLowerCase().replace(/[.!?…]+$/, '');

const STOP = new Set(['something', 'someone', 'somebody', 'about', 'with', 'from', 'that', 'this', 'into', 'over', 'your', 'have', 'been']);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The separate meanings inside an English gloss: "stop (bus, tram)" → ["stop"]; "bill, invoice" → ["bill", "invoice"]. */
function senses(en: string): string[] {
  return fold(en.replace(/\([^)]*\)/g, ' '))
    .split(/[,;/]| or /)
    .map((s) => s.replace(/^to\s+/, '').trim())
    .filter(Boolean);
}

function contentWords(en: string): Set<string> {
  const out = new Set<string>();
  for (const s of senses(en)) for (const w of s.split(/[^a-z]+/)) if (w.length >= 4 && !STOP.has(w)) out.add(w);
  return out;
}

/** Could two English glosses both be right for one word? Same sense, or a shared content word. */
export function meaningsOverlap(a: string, b: string): boolean {
  const sa = new Set(senses(a));
  if (senses(b).some((s) => sa.has(s))) return true;
  const wa = contentWords(a);
  for (const w of contentWords(b)) if (wa.has(w)) return true;
  return false;
}

/** Same lemma or an inflection of it: equal, or a long shared start ("Verspätung" / "Verspätungen"). */
export function sameStem(a: string, b: string): boolean {
  const x = fold(a), y = fold(b);
  if (!x || !y) return false;
  if (x === y) return true;
  let n = 0;
  while (n < x.length && n < y.length && x[n] === y[n]) n++;
  return n >= 5 && n >= 0.7 * Math.min(x.length, y.length);
}

export interface Pool {
  w: WordRecord;
  all: readonly WordRecord[];
  seed: string;
  confusions?: Confusions;
}

const lengthFit = (a: string, b: string) => Math.max(0, 6 - Math.abs(a.length - b.length));
const startFit = (a: string, b: string) => (fold(a)[0] === fold(b)[0] ? 3 : 0);

interface Cand { value: string; owner: WordRecord; bonus?: number }

/** Shared ranking: confusion beats everything; then tier, topic, shape. Ties break by a seeded hash. */
function rank<T extends Cand>(q: Pool, answer: string, cands: T[]): T[] {
  const conf = q.confusions?.get(q.w.id);
  const score = (c: T) =>
    (conf?.get(fold(c.value)) ?? 0) * 100 +
    (c.owner.tier === q.w.tier ? 30 : 0) +
    (c.owner.domain && c.owner.domain === q.w.domain ? 8 : 0) +
    (q.w.article && c.owner.article === q.w.article ? 6 : 0) +
    lengthFit(c.value, answer) + startFit(c.value, answer) + (c.bonus ?? 0);
  return [...cands].sort((a, b) => score(b) - score(a) || hash(q.seed + a.value) - hash(q.seed + b.value) || (a.value < b.value ? -1 : 1));
}

/** The first `n` distinct values that are not the answer. */
function take(values: string[], answer: string, n: number): string[] | null {
  const seen = new Set([fold(answer)]);
  const out: string[] = [];
  for (const v of values) {
    const f = fold(v);
    if (!f || seen.has(f)) continue;
    seen.add(f);
    out.push(clean(v));
    if (out.length === n) return out;
  }
  return null;
}

const others = (q: Pool) =>
  q.all.filter((o) => o.id !== q.w.id && o.pos === q.w.pos && fold(o.de) !== fold(q.w.de) && o.status !== 'suspended');

/** Wrong meanings. Hand-picked `wrong_1/2` first (after the same overlap guard), then ranked records. */
export function meaningDistractors(q: Pool, n = 2): string[] | null {
  const answer = q.w.en;
  const ok = (v: string) => !!clean(v) && !meaningsOverlap(v, answer);
  const own = q.w.wrong.filter(ok);
  const cands = others(q).filter((o) => ok(o.en)).map((o) => ({ value: o.en, owner: o }));
  return take([...own, ...rank(q, answer, cands).map((c) => c.value)], answer, n);
}

/** Everything the sheet says in German, folded: used to spot a candidate that already forms a known phrase. */
function knownGerman(all: readonly WordRecord[]): string[] {
  const out: string[] = [];
  for (const o of all) {
    for (const e of o.examples) out.push(fold(e.de));
    if (o.collocation) out.push(fold(o.collocation));
  }
  return out;
}

/**
 * Wrong forms for a gapped sentence. A candidate is dropped when it is an inflection of the answer's
 * lemma, a synonym of it, already in the sentence, or when the sentence with the candidate in the gap
 * is a phrase the sheet itself contains.
 */
export function formDistractors(q: Pool, answer: string, gapped: string, formOf: (o: WordRecord) => string, n = 2): string[] | null {
  const known = knownGerman(q.all);
  const sentence = fold(gapped.replace('___', ' '));
  const ending = fold(answer).slice(-2);
  const cands = others(q)
    .map((o) => ({ value: formOf(o), owner: o, bonus: fold(formOf(o)).slice(-2) === ending ? 40 : 0 }))
    .filter((c) => {
      const v = fold(c.value);
      if (!v || sameStem(c.value, answer) || sameStem(c.owner.de, q.w.de)) return false;
      if (meaningsOverlap(c.owner.en, q.w.en)) return false;
      if (new RegExp(`(?<![\\p{L}])${escapeRe(v)}(?![\\p{L}])`, 'u').test(sentence)) return false;
      return !known.includes(fold(gapped.replace('___', c.value)));
    });
  return take(rank(q, answer, cands).map((c) => c.value), answer, n);
}

const endClass = (p: string) => fold(p).slice(-2);

/** Wrong plurals: other nouns' plurals, same ending class first so the pattern alone does not decide. */
export function pluralDistractors(q: Pool, n = 2): string[] | null {
  const answer = q.w.plural;
  const cands = q.all
    .filter((o) => o.id !== q.w.id && o.pos === 'noun' && o.plural && o.status !== 'suspended' && fold(o.de) !== fold(q.w.de))
    .filter((o) => !sameStem(o.plural, answer) && fold(o.plural) !== fold(q.w.de))
    .map((o) => ({ value: o.plural, owner: o, bonus: endClass(o.plural) === endClass(answer) ? 40 : 0 }));
  return take(rank(q, answer, cands).map((c) => c.value), answer, n);
}

// ---------------------------------------------------------------- collocations

const FUNCTION_WORDS = new Set([
  'ein', 'eine', 'einen', 'einem', 'einer', 'eines', 'der', 'die', 'das', 'den', 'dem', 'des', 'zu', 'zum', 'zur', 'an', 'auf', 'bei',
  'für', 'in', 'mit', 'nach', 'um', 'von', 'vor', 'über', 'aus', 'im', 'am', 'ans', 'ins', 'sich', 'mir', 'mich', 'dir', 'dich', 'uns',
]);

const tokens = (s: string) => clean(s).split(/\s+/).filter(Boolean);

export interface CollocationSplit { answer: string; gapped: string }

/**
 * Split a collocation into the part to keep and the partner to ask for. The record's own word must be
 * inside the collocation (nothing is invented); the partner is its longest other content word.
 * `einen Termin vereinbaren` for Termin → partner `vereinbaren`.
 */
export function collocationSplit(w: WordRecord): CollocationSplit | null {
  const toks = tokens(w.collocation);
  if (toks.length < 2) return null;
  const heads = new Set([fold(w.de), ...w.examples.map((e) => fold(e.form))].filter(Boolean));
  const head = toks.findIndex((t) => heads.has(fold(t)));
  if (head < 0) return null;
  let best = -1;
  toks.forEach((t, i) => {
    if (i === head || FUNCTION_WORDS.has(fold(t))) return;
    if (best < 0 || t.length >= toks[best]!.length) best = i;
  });
  if (best < 0) return null;
  return { answer: toks[best]!, gapped: toks.map((t, i) => (i === best ? '___' : t)).join(' ') };
}

/** Wrong partners: partners of other records' collocations, never one the sheet also pairs with this headword. */
export function collocationDistractors(q: Pool, split: CollocationSplit, n = 2): string[] | null {
  const heads = new Set([fold(q.w.de), ...q.w.examples.map((e) => fold(e.form))]);
  const valid = new Set<string>([fold(split.answer)]);
  for (const o of q.all) {
    const toks = tokens(o.collocation).map(fold);
    if (toks.some((t) => heads.has(t))) toks.forEach((t) => valid.add(t));
  }
  const known = knownGerman(q.all);
  const cands: Cand[] = [];
  for (const o of q.all) {
    if (o.id === q.w.id || o.status === 'suspended') continue;
    const s = collocationSplit(o);
    if (!s) continue;
    const v = fold(s.answer);
    if (valid.has(v) || sameStem(s.answer, split.answer) || known.includes(fold(split.gapped.replace('___', s.answer)))) continue;
    cands.push({ value: s.answer, owner: o, bonus: v.slice(-2) === fold(split.answer).slice(-2) ? 40 : 0 });
  }
  return take(rank(q, split.answer, cands).map((c) => c.value), split.answer, n);
}

// ---------------------------------------------------------------- confusions from the log

export interface ChoiceEvent { wordId: string; correct: boolean; chosen?: string }

/** Wrong options the learner actually chose, per word. Later exercises for that word rank them first. */
export function buildConfusions(events: readonly ChoiceEvent[]): Confusions {
  const out = new Map<string, Map<string, number>>();
  for (const e of events) {
    if (e.correct || !e.chosen) continue;
    const m = out.get(e.wordId) ?? new Map<string, number>();
    m.set(fold(e.chosen), (m.get(fold(e.chosen)) ?? 0) + 1);
    out.set(e.wordId, m);
  }
  return out;
}
