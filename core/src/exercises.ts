/**
 * Exercises generated from a word record (SPEC "Exercises", DECISIONS D39, ENGINE.md).
 *
 * `exercisesFor(word, allWords)` is pure: the same records always give the same exercises, options
 * and option order. A missing column never fails; it only removes the exercises that need it.
 * Distractors come from other records (engine/distractors.ts), never the answer, never twice;
 * an exercise that cannot get its distractors is skipped.
 */
import { PREPOSITIONS } from './schema.ts';
import { formCount, type Example, type WordRecord } from './record.ts';
import { clean } from './text.ts';
import {
  collocationDistractors, collocationSplit, formDistractors, meaningDistractors, pluralDistractors, type Confusions,
} from './engine/distractors.ts';
import { hash } from './engine/rng.ts';

/** The eight exercises of Phase B. They define the ladder's gates; the three after them never gate. */
export const CORE_TYPES = ['karte', 'artikel', 'bedeutung', 'luecke', 'praeposition', 'hoeren', 'tippen', 'kontext2'] as const;
/** Added in round 2 (ENGINE.md). Variety exercises: a miss lowers the stage by one at most, a hit never promotes. */
export const EXTRA_TYPES = ['plural', 'kollokation', 'reihenfolge'] as const;
export const EXERCISE_TYPES = [...CORE_TYPES, ...EXTRA_TYPES] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

/** Ladder stages at which each exercise may appear (inclusive). */
export const STAGE_RANGE: Record<ExerciseType, readonly [number, number]> = {
  karte: [0, 0],
  artikel: [1, 5],
  bedeutung: [1, 5],
  luecke: [1, 3],
  praeposition: [2, 5],
  hoeren: [2, 5],
  tippen: [3, 5],
  kontext2: [4, 5],
  plural: [1, 5],
  kollokation: [2, 5],
  reihenfolge: [3, 5],
};

/** Exercises that need a German voice on the device. */
export const NEEDS_VOICE: ReadonlySet<ExerciseType> = new Set(['hoeren']);

export const GAP = '___';

export interface Exercise {
  type: ExerciseType;
  wordId: string;
  /** What fills the amber shape: the meaning (karte, bedeutung, hoeren), article, form, plural, partner or preposition. */
  answer: string;
  /** Choice exercises: the answer plus its distractors, in a stable order. Empty for karte, tippen and reihenfolge. */
  options: string[];
  /** Sentence with one `___` (luecke, tippen, kontext2, praeposition, kollokation). */
  gapped: string;
  /** The full German sentence: shown on the board (karte, artikel, bedeutung) or spoken (hoeren). */
  sentence: string;
  /** Translation of `sentence` / `gapped`, when known. */
  sentenceEn: string;
  /** Short English hint for a legacy cloze, when known. */
  hint: string;
  /** The surface form of the word inside `sentence`, to highlight or to mark as an amber bar. */
  target: string;
  /** Reihenfolge: the sentence's words in a fixed, shuffled order. */
  tokens: string[];
}

const fold = (s: string) => clean(s).toLowerCase().replace(/[.!?…]+$/, '');

function stableOrder<T>(items: T[], seed: string, key: (t: T) => string): T[] {
  return [...items].sort((a, b) => hash(seed + key(a)) - hash(seed + key(b)) || key(a).localeCompare(key(b)));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The sentence with its (single) whole-word occurrence of `form` replaced by `___`, or '' if not exactly once. */
export function blank(sentence: string, form: string): string {
  if (formCount(sentence, form) !== 1) return '';
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(clean(form))}(?![\\p{L}\\p{N}])`, 'u');
  return clean(sentence).replace(re, GAP);
}

/** The usable example in slot `i` (0 = first, 1 = second situation): one with its form exactly once. */
function usableExample(w: WordRecord, i: number): Example | null {
  const e = w.examples[i];
  return e && formCount(e.de, e.form) === 1 ? e : null;
}

/**
 * Exercise types a record's own columns support, ignoring distractors and the device's voice.
 * The ladder's gate is computed from this, so replaying a log never depends on other words.
 * Only the eight core types: the added ones never gate.
 */
export function capabilities(w: WordRecord): Set<ExerciseType> {
  const caps = new Set<ExerciseType>(['karte', 'bedeutung', 'hoeren']);
  if (w.pos === 'noun' && w.article) caps.add('artikel');
  if (usableExample(w, 0)) { caps.add('luecke'); caps.add('tippen'); }
  if (w.prep) caps.add('praeposition');
  if (usableExample(w, 1)) caps.add('kontext2');
  return caps;
}

export interface ExerciseOptions {
  /** Also generate plural, kollokation and reihenfolge. Off by default so the Phase B catalogue is unchanged. */
  extended?: boolean;
  /** Wrong options the learner chose before; ranked first when they are valid candidates. */
  confusions?: Confusions;
  /** Varies tie-breaks between equally good distractors; same seed, same exercises. */
  seed?: string;
  /** Accept one distractor (two options) when two cannot be found. */
  fewerOptions?: boolean;
}

/** Sentences for Reihenfolge: 4 to 12 words, so the order is neither trivial nor a puzzle. */
export const REORDER_WORDS: readonly [number, number] = [4, 12];

function shuffled(tokens: string[], seed: string): string[] {
  const out = stableOrder(tokens.map((t, i) => ({ t, i })), seed, (x) => `${x.i}:${x.t}`).map((x) => x.t);
  // Never hand the learner the finished sentence.
  return out.join(' ') === tokens.join(' ') ? [...out.slice(1), out[0]!] : out;
}

export const pluralUsable = (w: WordRecord) => w.pos === 'noun' && !!w.plural && !!w.article;

/** Every exercise the record supports, in catalogue order. */
export function exercisesFor(w: WordRecord, all: readonly WordRecord[], opts: ExerciseOptions = {}): Exercise[] {
  const out: Exercise[] = [];
  const ex0 = usableExample(w, 0);
  const ex1 = usableExample(w, 1);
  const first = w.examples[0];
  const base = {
    wordId: w.id,
    options: [] as string[],
    gapped: '',
    sentence: ex0?.de ?? '',
    sentenceEn: ex0?.en ?? '',
    hint: ex0?.hint ?? '',
    target: ex0?.form ?? '',
    tokens: [] as string[],
  };
  if (!clean(w.de) || !clean(w.en)) return out;

  const pool = (type: ExerciseType) => ({ w, all, seed: `${w.id}|${type}|${opts.seed ?? ''}`, confusions: opts.confusions });
  const order = (type: ExerciseType, answer: string, d: string[]) => stableOrder([answer, ...d], pool(type).seed, (s) => s);
  const distract = (get: (n: number) => string[] | null): string[] | null => get(2) ?? (opts.fewerOptions ? get(1) : null);

  out.push({ ...base, type: 'karte', answer: w.en, sentence: first?.de ?? '', sentenceEn: first?.en ?? '', target: first?.form ?? '' });

  if (w.pos === 'noun' && w.article) out.push({ ...base, type: 'artikel', answer: w.article, options: ['der', 'die', 'das'] });

  if (opts.extended && pluralUsable(w)) {
    const d = distract((n) => pluralDistractors(pool('plural'), n));
    if (d) out.push({ ...base, type: 'plural', answer: w.plural, options: order('plural', w.plural, d), sentence: '', sentenceEn: '', target: '' });
  }

  const meanings = distract((n) => meaningDistractors(pool('bedeutung'), n));
  if (meanings) out.push({ ...base, type: 'bedeutung', answer: w.en, options: order('bedeutung', w.en, meanings) });

  if (ex0) {
    const gapped = blank(ex0.de, ex0.form);
    const d = distract((n) => formDistractors(pool('luecke'), ex0.form, gapped, (o) => o.examples[0]?.form || o.de, n));
    if (d) out.push({ ...base, type: 'luecke', answer: ex0.form, options: order('luecke', ex0.form, d), gapped });
  }

  if (w.prep) {
    const fromExample = ex0 ? blank(ex0.de, w.prep) : '';
    const wrong = stableOrder(PREPOSITIONS.filter((p) => p !== w.prep), pool('praeposition').seed, (p) => p).slice(0, 2);
    out.push({
      ...base, type: 'praeposition', answer: w.prep, options: order('praeposition', w.prep, wrong),
      gapped: fromExample || `${w.de} ${GAP}`,
      sentence: fromExample ? ex0!.de : '',
      sentenceEn: fromExample ? ex0!.en : '',
    });
  }

  if (opts.extended) {
    const split = collocationSplit(w);
    if (split) {
      const d = distract((n) => collocationDistractors(pool('kollokation'), split, n));
      if (d) {
        out.push({
          ...base, type: 'kollokation', answer: split.answer, options: order('kollokation', split.answer, d), gapped: split.gapped,
          sentence: w.collocation, sentenceEn: w.en, hint: '', target: split.answer,
        });
      }
    }
  }

  const listen = w.listen ?? (ex0 ? { de: ex0.de, en: ex0.en } : first ? { de: first.de, en: first.en } : { de: w.de, en: '' });
  const hearOpts = distract((n) => meaningDistractors(pool('hoeren'), n));
  if (hearOpts) {
    out.push({
      ...base, type: 'hoeren', answer: w.en, options: order('hoeren', w.en, hearOpts), sentence: listen.de, sentenceEn: listen.en,
      target: formCount(listen.de, ex0?.form ?? w.de) === 1 ? (ex0?.form ?? w.de) : '',
    });
  }

  if (ex0) out.push({ ...base, type: 'tippen', answer: ex0.form, gapped: blank(ex0.de, ex0.form) });

  if (opts.extended && ex0) {
    const toks = clean(ex0.de).split(/\s+/);
    if (toks.length >= REORDER_WORDS[0] && toks.length <= REORDER_WORDS[1]) {
      out.push({ ...base, type: 'reihenfolge', answer: clean(ex0.de), tokens: shuffled(toks, pool('reihenfolge').seed), target: '' });
    }
  }

  if (ex1) {
    const gapped = blank(ex1.de, ex1.form);
    const d = distract((n) => formDistractors(pool('kontext2'), ex1.form, gapped, (o) => o.examples[1]?.form || o.examples[0]?.form || o.de, n));
    if (d) {
      out.push({
        ...base, type: 'kontext2', answer: ex1.form, options: order('kontext2', ex1.form, d), gapped,
        sentence: ex1.de, sentenceEn: ex1.en, hint: '', target: ex1.form,
      });
    }
  }
  return out;
}
