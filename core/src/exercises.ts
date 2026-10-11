/**
 * Exercises generated from a word record (SPEC "Exercises", DECISIONS D39).
 *
 * `exercisesFor(word, allWords)` is pure: the same records always give the same exercises, options
 * and option order. A missing column never fails; it only removes the exercises that need it.
 * Distractors come from other records (same pos, same tier first), never the answer, never twice.
 * Meaning options need two distractors or the exercise is skipped. Form options (Lücke, Zweiter
 * Kontext) must fill the same inflectional slot as the answer (D55): with one such form the exercise
 * has two options, with none it is skipped and the scheduler lets another exercise stand in for it.
 */
import { PREPOSITIONS } from './schema.ts';
import { formCount, type Example, type WordRecord } from './record.ts';
import { clean } from './text.ts';

export const EXERCISE_TYPES = ['karte', 'artikel', 'bedeutung', 'luecke', 'praeposition', 'hoeren', 'tippen', 'kontext2'] as const;
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
};

/** Exercises that need a German voice on the device. */
export const NEEDS_VOICE: ReadonlySet<ExerciseType> = new Set(['hoeren']);

export const GAP = '___';

export interface Exercise {
  type: ExerciseType;
  wordId: string;
  /** What fills the amber shape: the meaning (karte, bedeutung, hoeren), article, form or preposition. */
  answer: string;
  /** Choice exercises: the answer plus two distractors, in a stable order. Empty for karte and tippen. */
  options: string[];
  /** Sentence with one `___` (luecke, tippen, kontext2, praeposition). */
  gapped: string;
  /** The full German sentence: shown on the board (karte, artikel, bedeutung) or spoken (hoeren). */
  sentence: string;
  /** Translation of `sentence` / `gapped`, when known. */
  sentenceEn: string;
  /** Short English hint for a legacy cloze, when known. */
  hint: string;
  /** The surface form of the word inside `sentence`, to highlight or to mark as an amber bar. */
  target: string;
}

/** FNV-1a: a tiny, stable hash so option order and distractor choice are deterministic. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
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
 */
export function capabilities(w: WordRecord): Set<ExerciseType> {
  const caps = new Set<ExerciseType>(['karte', 'bedeutung', 'hoeren']);
  if (w.pos === 'noun' && w.article) caps.add('artikel');
  if (usableExample(w, 0)) { caps.add('luecke'); caps.add('tippen'); }
  if (w.prep) caps.add('praeposition');
  if (usableExample(w, 1)) caps.add('kontext2');
  return caps;
}

/** Candidates from other records: same pos only, same tier first, then a stable per-word order. */
function candidates(w: WordRecord, all: readonly WordRecord[], seed: string): WordRecord[] {
  const pool = all.filter((o) => o.id !== w.id && o.pos === w.pos);
  return stableOrder(pool, seed, (o) => o.id).sort((a, b) => Number(b.tier === w.tier) - Number(a.tier === w.tier));
}

function pickDistinct(answer: string, preferred: readonly string[], pool: readonly string[], n = 2): string[] | null {
  const taken = new Set([fold(answer)]);
  const out: string[] = [];
  for (const raw of [...preferred, ...pool]) {
    const v = clean(raw);
    if (!v || taken.has(fold(v))) continue;
    taken.add(fold(v));
    out.push(v);
    if (out.length === n) return out;
  }
  return null;
}

function meaningOptions(w: WordRecord, all: readonly WordRecord[], type: ExerciseType): string[] | null {
  const seed = `${w.id}|${type}|`;
  const d = pickDistinct(w.en, w.wrong, candidates(w, all, seed).map((o) => o.en));
  return d && stableOrder([w.en, ...d], seed, (s) => s);
}

/** Words before a gap that show the noun's gender (and case): a determiner, optionally followed by up to two inflected adjectives ("an der nächsten ___"). */
const DETERMINER = /(?:^|\s)(der|die|das|den|dem|des|ein|eine|einen|einem|einer|eines|kein|keine|keinen|keinem|keiner|keines|mein|meine|meinen|meinem|meiner|dein|deine|deinen|deinem|deiner|sein|seine|seinen|seinem|seiner|ihr|ihre|ihren|ihrem|ihrer|unser|unsere|unseren|unserem|euer|eure|euren|eurem|dieser|diese|diesen|diesem|dieses|jeder|jede|jeden|jedem|jedes|welcher|welche|welchen|welchem|welches|am|im|zum|zur|vom|beim|ins|ans)(?:\s+\p{Ll}+(?:e|en|er|es|em))?(?:\s+\p{Ll}+(?:e|en|er|es|em))?\s*$/iu;
const DATIVE_MN = /^(dem|einem|keinem|meinem|deinem|seinem|ihrem|unserem|eurem|diesem|jedem|welchem|am|im|zum|vom|beim)$/;
const AUX = /(?<![\p{L}])(habe|hast|hat|haben|habt|hatte|hattest|hatten|bin|bist|ist|sind|seid|war|warst|waren|wart|wird|wirst|werden|werdet|wurde|wurden|worden|sein)(?![\p{L}])/iu;
const SEPARABLE = ['zurück', 'zusammen', 'weiter', 'vorbei', 'nach', 'fest', 'heim', 'weg', 'ab', 'an', 'auf', 'aus', 'bei', 'ein', 'mit', 'vor', 'zu', 'los', 'her', 'hin', 'um'];
const INSEPARABLE = /^(be|emp|ent|er|ge|miss|ver|zer|über|unter|hinter|wider)/;

/**
 * The inflectional slot of `form` (the word as it stands in `sentence`) relative to its lemma, so an
 * option can be required to fit the same slot (D55): conjugated with conjugated (same ending, so the
 * same person), participle with participle, infinitive with infinitive; for nouns the same number,
 * and the same gender when a determiner before the gap shows it; for adjectives the same ending.
 */
export function formSlot(w: Pick<WordRecord, 'de' | 'pos' | 'article' | 'plural'>, form: string, sentence: string): string {
  const f = clean(form).toLowerCase();
  const lemma = clean(w.de).toLowerCase().replace(/^sich\s+/, '');
  if (w.pos === 'phrase') return 'phrase';
  if (w.pos === 'noun') {
    const number = f === lemma ? 'sg' : w.plural && f === clean(w.plural).toLowerCase() ? 'pl' : 'other';
    if (number === 'pl') return 'noun|pl'; // plural forms share their determiners across genders
    const det = DETERMINER.exec(blank(sentence, form).split(GAP)[0] ?? '')?.[1]?.toLowerCase();
    if (!det) return `noun|${number}`;
    // dem/einem/am/im/zum/vom/beim show masculine or neuter dative: both fit the same gap.
    const gender = DATIVE_MN.test(det) && (w.article === 'der' || w.article === 'das') ? 'mn' : w.article;
    return `noun|${gender}|${number}`;
  }
  if (w.pos === 'adj') {
    if (f === lemma) return 'adj|';
    return f.startsWith(lemma) && /^(e|en|er|es|em)$/.test(f.slice(lemma.length)) ? `adj|${f.slice(lemma.length)}` : 'adj|other';
  }
  // verbs
  if (f === lemma) return 'verb|inf';
  const sep = SEPARABLE.find((p) => lemma.startsWith(p) && lemma.length > p.length + 3);
  if (sep && f === sep + 'zu' + lemma.slice(sep.length)) return 'verb|inf';
  const hasAux = AUX.test(blank(sentence, form).replace(GAP, ' '));
  if ((sep && f.startsWith(sep + 'ge')) || (f.startsWith('ge') && !lemma.startsWith('ge'))) return 'verb|part';
  if (hasAux && /(t|en)$/.test(f) && (INSEPARABLE.test(lemma) || lemma.endsWith('ieren') || f.startsWith('ge') || !!sep)) return 'verb|part';
  for (const end of ['st', 'e', 't', 'en', 'n'] as const) if (f.endsWith(end)) return `verb|${end === 'n' ? 'en' : end}`;
  return 'verb|other';
}

function nounNumber(o: Pick<WordRecord, 'de' | 'plural'>, form: string): 'sg' | 'pl' | 'other' {
  const f = clean(form).toLowerCase();
  return f === clean(o.de).toLowerCase() ? 'sg' : o.plural && f === clean(o.plural).toLowerCase() ? 'pl' : 'other';
}

function formOptions(w: WordRecord, ex: Example, all: readonly WordRecord[], type: ExerciseType): string[] | null {
  const seed = `${w.id}|${type}|`;
  const slot = formSlot(w, ex.form, ex.de);
  // Does another record's form fill the same slot? Nouns: same number, and the same gender when the
  // answer's sentence shows it (judged by the candidate's own article). Verbs and adjectives: the same
  // slot, read in the candidate's own sentence (where an auxiliary marks a participle).
  const fits = (o: WordRecord, form: string, sentence: string): boolean => {
    if (w.pos !== 'noun') return formSlot(o, form, sentence) === slot;
    const parts = slot.split('|');
    const number = nounNumber(o, form);
    if (parts[1] === 'pl') return number === 'pl';
    if (parts.length === 2) return number === parts[1];
    const gender = parts[1];
    const theirs = gender === 'mn' && (o.article === 'der' || o.article === 'das') ? 'mn' : o.article;
    return number === parts[2] && theirs === gender;
  };
  const pool: string[] = [];
  for (const o of candidates(w, all, seed)) {
    for (const e of o.examples) {
      const form = e.form || o.de;
      if (formCount(e.de, form) === 1 && fits(o, form, e.de)) pool.push(form);
    }
    const dict = o.de.replace(/^sich\s+/, '');
    if (fits(o, dict, o.pos === 'verb' ? `${dict}` : dict)) pool.push(dict);
    if (o.pos === 'noun' && o.plural && fits(o, o.plural, o.plural)) pool.push(o.plural);
  }
  // Fewer than two such forms → two options; none → no exercise (the scheduler lets another stand in, D55).
  const d = pickDistinct(ex.form, [], pool, 2) ?? pickDistinct(ex.form, [], pool, 1);
  return d && stableOrder([ex.form, ...d], seed, (s) => s);
}

/** Two other prepositions from the closed list, in a stable per-word order. */
function prepOptions(w: WordRecord): string[] {
  const seed = `${w.id}|praeposition|`;
  const others = stableOrder(PREPOSITIONS.filter((p) => p !== w.prep), seed, (p) => p).slice(0, 2);
  return stableOrder([w.prep, ...others], seed, (p) => p);
}

/** Every exercise the record supports, in catalogue order. */
export function exercisesFor(w: WordRecord, all: readonly WordRecord[]): Exercise[] {
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
  };
  if (!clean(w.de) || !clean(w.en)) return out;

  out.push({ ...base, type: 'karte', answer: w.en, sentence: first?.de ?? '', sentenceEn: first?.en ?? '', target: first?.form ?? '' });

  if (w.pos === 'noun' && w.article) out.push({ ...base, type: 'artikel', answer: w.article, options: ['der', 'die', 'das'] });

  const meanings = meaningOptions(w, all, 'bedeutung');
  if (meanings) out.push({ ...base, type: 'bedeutung', answer: w.en, options: meanings });

  if (ex0) {
    const opts = formOptions(w, ex0, all, 'luecke');
    if (opts) out.push({ ...base, type: 'luecke', answer: ex0.form, options: opts, gapped: blank(ex0.de, ex0.form) });
  }

  if (w.prep) {
    const fromExample = ex0 ? blank(ex0.de, w.prep) : '';
    out.push({
      ...base, type: 'praeposition', answer: w.prep, options: prepOptions(w),
      gapped: fromExample || `${w.de} ${GAP}`,
      sentence: fromExample ? ex0!.de : '',
      sentenceEn: fromExample ? ex0!.en : '',
    });
  }

  const listen = w.listen ?? (ex0 ? { de: ex0.de, en: ex0.en } : first ? { de: first.de, en: first.en } : { de: w.de, en: '' });
  const hearOpts = meaningOptions(w, all, 'hoeren');
  if (hearOpts) {
    out.push({
      ...base, type: 'hoeren', answer: w.en, options: hearOpts, sentence: listen.de, sentenceEn: listen.en,
      target: formCount(listen.de, ex0?.form ?? w.de) === 1 ? (ex0?.form ?? w.de) : '',
    });
  }

  if (ex0) out.push({ ...base, type: 'tippen', answer: ex0.form, gapped: blank(ex0.de, ex0.form) });

  if (ex1) {
    const opts = formOptions(w, ex1, all, 'kontext2');
    if (opts) {
      out.push({
        ...base, type: 'kontext2', answer: ex1.form, options: opts, gapped: blank(ex1.de, ex1.form),
        sentence: ex1.de, sentenceEn: ex1.en, hint: '', target: ex1.form,
      });
    }
  }
  return out;
}
