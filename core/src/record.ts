/**
 * A word as a record: the shared rules for its columns, and the shape the exercise generator reads.
 *
 * `recordProblems` is used by the Inbox v2 validator, the seed importer and the app's read path, so a
 * row is judged the same way whether an agent, a seed file or the learner's own hand wrote it.
 * `toWordRecord` is the compat layer (D39): legacy `prompts` rows (from Inbox v1 clozes and listen
 * sentences) win over the record's own example columns for the same word.
 */
import {
  ARTICLES, DOMAINS, FIELD_MAX, IMAGE_KEYS, LIMITS, POS, PREPOSITIONS, RECORD_COLUMNS, TIERS, type Row,
} from './schema.ts';
import { clean, contentProblems, wordCount } from './text.ts';

export type Pos = (typeof POS)[number];
export type Tier = (typeof TIERS)[number];
export type Domain = (typeof DOMAINS)[number];

export interface Example {
  /** Full German sentence, no gap. */
  de: string;
  /** Translation; may be empty for legacy clozes. */
  en: string;
  /** The exact surface form inside `de` that an exercise blanks. */
  form: string;
  /** Short English hint (legacy clozes only). */
  hint: string;
}

export interface WordRecord {
  id: string;
  de: string;
  article: '' | 'der' | 'die' | 'das';
  plural: string;
  en: string;
  pos: Pos;
  tier: Tier;
  /** Empty for a thin record entered without a situation. */
  domain: Domain | '';
  status: string;
  source: string;
  startStage: number;
  /** The first and (optionally) the second example, in two different situations. */
  examples: Example[];
  /** Sentence for Hören when it differs from the first example (legacy listen prompt). */
  listen: { de: string; en: string } | null;
  collocation: string;
  prep: string;
  note: string;
  /** Hand-picked wrong meanings. */
  wrong: string[];
  imageKey: string;
}

const CONTENT_COLUMNS = ['de', 'en', 'family', 'plural', 'example_de', 'example_en', 'example_form', 'example_2_de',
  'example_2_en', 'example_2_form', 'collocation', 'note', 'wrong_1', 'wrong_2'] as const;

const isOneOf = <T extends readonly string[]>(list: T, v: string): v is T[number] => list.includes(v);

/** `pos` as written, or `noun` when it is empty and an article is given (thin records). */
export function effectivePos(r: Row): string {
  const pos = clean(r.pos ?? '');
  return pos || (r.article ? 'noun' : '');
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Occurrences of `form` in `sentence` as a whole word (letters may not touch it on either side). */
export function formCount(sentence: string, form: string): number {
  const f = clean(form);
  if (!f) return 0;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(f)}(?![\\p{L}\\p{N}])`, 'gu');
  return [...clean(sentence).matchAll(re)].length;
}

export interface RecordOptions {
  /** Agent rows must bring a first example with translation; learner and seed rows may be thin. */
  requireExample?: boolean;
  /** Agent rows must name a situation. */
  requireDomain?: boolean;
}

/**
 * Problems with one record's content columns. Empty list = acceptable. Never repairs anything.
 * Reasons use the validator's `reason:column` style.
 */
export function recordProblems(r: Row, opts: RecordOptions = {}): string[] {
  const out: string[] = [];
  const v = (c: string) => r[c] ?? '';
  for (const c of ['de', 'en'] as const) if (!clean(v(c))) out.push(`missing:${c}`);
  if (opts.requireDomain && !clean(v('domain'))) out.push('missing:domain');
  if (opts.requireExample) for (const c of ['example_de', 'example_en'] as const) if (!clean(v(c))) out.push(`missing:${c}`);

  for (const c of [...CONTENT_COLUMNS, 'pos', 'tier', 'domain', 'article', 'prep', 'image_key']) {
    if (v(c).length > (FIELD_MAX[c] ?? 0)) out.push(`too_long:${c}`);
  }
  for (const c of CONTENT_COLUMNS) {
    if (!v(c)) continue;
    for (const p of contentProblems(v(c), FIELD_MAX[c] ?? 0).filter((p) => p !== 'too_long')) out.push(`${p}:${c}`);
  }
  for (const c of ['de', 'en'] as const) if (clean(v(c)) && !/\p{L}/u.test(v(c))) out.push(`no_letters:${c}`);

  const pos = effectivePos(r), tier = v('tier'), article = v('article');
  if (!pos) out.push('missing:pos');
  else if (!isOneOf(POS, pos)) out.push('bad_enum:pos');
  if (tier && !isOneOf(TIERS, tier)) out.push('bad_enum:tier');
  if (v('domain') && !isOneOf(DOMAINS, v('domain'))) out.push('bad_enum:domain');
  if (article && !isOneOf(ARTICLES, article)) out.push('bad_enum:article');
  if (pos === 'noun' && !article) out.push('noun_without_article');
  if (pos && pos !== 'noun' && article) out.push('article_on_non_noun');
  if (pos && pos !== 'noun' && v('plural')) out.push('plural_on_non_noun');
  if (tier === 'chunk' && pos !== 'phrase') out.push('chunk_must_be_phrase');
  if (tier === 'core' && pos === 'phrase') out.push('phrase_must_be_chunk');
  if (v('prep') && !isOneOf(PREPOSITIONS, v('prep'))) out.push('bad_enum:prep');
  if (v('image_key') && !isOneOf(IMAGE_KEYS, v('image_key'))) out.push('bad_enum:image_key');

  // Examples: German and English come together; the blanked form must occur exactly once.
  for (const [deC, enC, formC] of [['example_de', 'example_en', 'example_form'], ['example_2_de', 'example_2_en', 'example_2_form']] as const) {
    const de = v(deC), en = v(enC), form = v(formC) || v('de');
    if (!de) {
      if (en) out.push(`translation_without_example:${enC}`);
      if (v(formC)) out.push(`form_without_example:${formC}`);
      continue;
    }
    if (!clean(en)) out.push(`missing:${enC}`);
    if (de.includes('_')) out.push(`gap_in_example:${deC}`);
    if (wordCount(de) > LIMITS.maxSentenceWords) out.push(`too_many_words:${deC}`);
    const n = formCount(de, form);
    if (n === 0) out.push(`form_not_in_example:${deC}`);
    if (n > 1) out.push(`form_repeated_in_example:${deC}`);
  }
  if (v('example_2_de') && !v('example_de')) out.push('second_example_without_first');
  if (v('example_2_de') && clean(v('example_2_de')) === clean(v('example_de'))) out.push('examples_identical');

  const en = clean(v('en')).toLowerCase();
  const w1 = clean(v('wrong_1')).toLowerCase(), w2 = clean(v('wrong_2')).toLowerCase();
  if ((w1 && w1 === en) || (w2 && w2 === en)) out.push('distractor_equals_answer');
  if (w1 && w1 === w2) out.push('distractors_identical');
  return [...new Set(out)];
}

/** Record columns copied verbatim (after `clean`) from a source row into a Core `words` row. */
export function recordColumns(r: Row): Row {
  return Object.fromEntries(RECORD_COLUMNS.map((c) => [c, clean(r[c] ?? '')]));
}

/** Default tier when the column is empty (SPEC "Data model" rules). */
export function defaultTier(pos: string): Tier {
  return pos === 'phrase' ? 'chunk' : 'core';
}

function example(de: string, en: string, form: string): Example | null {
  if (!clean(de)) return null;
  return { de: clean(de), en: clean(en), form: clean(form), hint: '' };
}

/**
 * Core `words` row (+ its `prompts`) → the record the generator and scheduler read.
 * Compat (D39): an active cloze prompt replaces the example in the same slot (1st, 2nd); its
 * translation is kept only when the sentence is the same. An active listen prompt sets `listen`.
 * Prompt distractors fill `wrong` when the record has none.
 */
export function toWordRecord(w: Row, prompts: readonly Row[] = []): WordRecord {
  const pos = effectivePos(w) as Pos;
  const own = [
    example(w.example_de ?? '', w.example_en ?? '', w.example_form || w.de || ''),
    example(w.example_2_de ?? '', w.example_2_en ?? '', w.example_2_form || w.de || ''),
  ];
  const mine = prompts.filter((p) => p.word_id === w.word_id && (p.status ?? 'active') === 'active');
  const clozes = mine.filter((p) => p.kind === 'cloze' && (p.de_text ?? '').includes('___') && clean(p.answer ?? ''));
  clozes.slice(0, 2).forEach((p, i) => {
    const de = clean(p.de_text!.replace('___', p.answer!));
    const kept = own[i] && own[i]!.de === de ? own[i]!.en : '';
    own[i] = { de, en: kept, form: clean(p.answer!), hint: clean(p.hint_en ?? '') };
  });
  const listenPrompt = mine.find((p) => p.kind === 'listen' && clean(p.de_text ?? ''));
  let wrong = [w.wrong_1, w.wrong_2].map((s) => clean(s ?? '')).filter(Boolean);
  if (!wrong.length) {
    for (const p of clozes) {
      try {
        const d = JSON.parse(p.distractors || '[]');
        if (Array.isArray(d)) wrong = d.filter((x): x is string => typeof x === 'string').map(clean).filter(Boolean).slice(0, 2);
      } catch { /* malformed distractors: ignore */ }
      if (wrong.length) break;
    }
  }
  const stage = Number(w.start_stage);
  return {
    id: w.word_id ?? '',
    de: clean(w.de ?? ''),
    article: (isOneOf(ARTICLES, w.article ?? '') ? w.article : '') as WordRecord['article'],
    plural: clean(w.plural ?? ''),
    en: clean(w.en ?? ''),
    pos,
    tier: (isOneOf(TIERS, w.tier ?? '') ? w.tier : defaultTier(pos)) as Tier,
    domain: (isOneOf(DOMAINS, w.domain ?? '') ? w.domain : '') as Domain | '',
    status: w.status ?? 'active',
    source: w.source ?? '',
    startStage: Number.isInteger(stage) && stage >= 0 && stage <= 2 ? stage : 0,
    examples: own.filter((e): e is Example => !!e),
    listen: listenPrompt ? { de: clean(listenPrompt.de_text!), en: clean(listenPrompt.en_text ?? '') } : null,
    collocation: clean(w.collocation ?? ''),
    prep: clean(w.prep ?? ''),
    note: clean(w.note ?? ''),
    wrong,
    imageKey: isOneOf(IMAGE_KEYS, w.image_key ?? '') ? w.image_key! : '',
  };
}
