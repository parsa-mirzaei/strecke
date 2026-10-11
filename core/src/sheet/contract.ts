/**
 * The sheet contract (DECISIONS D56): what a learner's Google Sheet may contain for the app to read it.
 *
 * Only a `word` column is required. Every other column is optional, may appear in any order, may be
 * named in English or German, and may sit next to columns the app does not know. A missing optional
 * tab (Inbox, Meta) never breaks anything. The template in docs/template/ is a convenience, not a
 * requirement. Generated agent instructions (instructions.ts) use these same names, and a test proves
 * that every column they ask for is one this module reads back.
 */

/** Version of this contract. A sheet can state its own in an optional `Meta` tab (`schema_version`). */
export const SCHEMA_VERSION = 1;

/** Canonical columns of the Words tab, in template order. */
export const WORDS_COLUMNS = [
  'word', 'article', 'plural', 'meaning', 'pos', 'topic',
  'example', 'example_translation', 'example_form', 'example_2', 'example_2_translation', 'example_2_form',
  'collocation', 'prep', 'note', 'wrong_1', 'wrong_2',
  'level', 'source', 'added', 'verified', 'id',
] as const;
export type WordsColumn = (typeof WORDS_COLUMNS)[number];

/** Columns of the optional Inbox tab: words the learner drops in for their AI assistant to fill. */
export const INBOX_TAB_COLUMNS = ['word', 'note', 'processed'] as const;
export type InboxColumn = (typeof INBOX_TAB_COLUMNS)[number];

/** Allowed values where the contract has a closed list (shown as dropdowns in the template). */
export const ENUMS = {
  article: ['der', 'die', 'das'],
  pos: ['noun', 'verb', 'adj', 'phrase'],
  source: ['agent', 'me'],
  verified: ['yes', 'no'],
} as const;

/** Header names the app recognises, before normalisation (see `normHeader`). First listed = canonical. */
export const WORDS_ALIASES: Record<WordsColumn, readonly string[]> = {
  word: ['word', 'wort', 'de', 'german', 'deutsch', 'lemma', 'vokabel', 'vocabulary', 'term', 'begriff', 'front'],
  article: ['article', 'artikel', 'art', 'genus', 'gender', 'geschlecht'],
  plural: ['plural', 'pl', 'mehrzahl', 'plural form', 'pluralform'],
  meaning: ['meaning', 'en', 'english', 'englisch', 'translation', 'übersetzung', 'bedeutung', 'definition', 'gloss', 'back'],
  pos: ['pos', 'part of speech', 'wortart', 'word type', 'type', 'typ', 'word class', 'wordclass'],
  topic: ['topic', 'domain', 'thema', 'bereich', 'situation', 'category', 'kategorie', 'tag', 'tags'],
  example: ['example', 'example_de', 'example de', 'example sentence', 'sentence', 'satz', 'beispiel', 'beispielsatz', 'example 1', 'example1'],
  example_translation: ['example_translation', 'example_en', 'example en', 'example english', 'sentence translation', 'example meaning',
    'übersetzung beispiel', 'beispiel übersetzung', 'beispiel englisch', 'example 1 translation'],
  example_form: ['example_form', 'form', 'word form', 'form in example', 'form im beispiel', 'example 1 form'],
  example_2: ['example_2', 'example_2_de', 'example 2', 'example2', 'second example', 'sentence 2', 'beispiel 2', 'zweites beispiel'],
  example_2_translation: ['example_2_translation', 'example_2_en', 'example 2 translation', 'example 2 en', 'beispiel 2 übersetzung'],
  example_2_form: ['example_2_form', 'example 2 form', 'form 2'],
  collocation: ['collocation', 'kollokation', 'combination', 'verbindung', 'wendung'],
  prep: ['prep', 'preposition', 'präposition'],
  note: ['note', 'notes', 'notiz', 'hinweis', 'anmerkung', 'comment', 'kommentar', 'grammar', 'grammatik', 'usage'],
  wrong_1: ['wrong_1', 'wrong 1', 'distractor 1', 'falsch 1'],
  wrong_2: ['wrong_2', 'wrong 2', 'distractor 2', 'falsch 2'],
  level: ['level', 'niveau', 'stufe', 'cefr', 'ger'],
  source: ['source', 'quelle', 'added by', 'origin', 'herkunft'],
  added: ['added', 'date added', 'added on', 'date', 'datum', 'hinzugefügt', 'created', 'erstellt'],
  verified: ['verified', 'checked', 'geprüft', 'ok'],
  id: ['id', 'word_id', 'key', 'schlüssel'],
};

export const INBOX_ALIASES: Record<InboxColumn, readonly string[]> = {
  word: WORDS_ALIASES.word,
  note: ['note', 'notes', 'notiz', 'hinweis', 'context', 'kontext', 'comment'],
  processed: ['processed', 'done', 'erledigt', 'verarbeitet', 'filled', 'added'],
};

/**
 * Header normalisation: NFC, lower case, umlauts and ß spelled out, everything that is not a letter
 * or digit removed. "Example (EN)", "example_en" and "Example EN" all become "exampleen".
 */
export function normHeader(h: string): string {
  return h.normalize('NFC').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

export interface HeaderMap<C extends string> {
  /** Column index per recognised canonical column (first occurrence wins). */
  index: Partial<Record<C, number>>;
  /** Headers the app does not know; they are ignored, never an error. */
  unknown: string[];
  /** Headers that map to a column already seen; the later one is ignored. */
  repeated: string[];
}

export function mapHeaders<C extends string>(headers: readonly string[], aliases: Record<C, readonly string[]>): HeaderMap<C> {
  const lookup = new Map<string, C>();
  for (const [canon, names] of Object.entries(aliases) as [C, readonly string[]][]) {
    for (const n of [canon, ...names]) if (!lookup.has(normHeader(n))) lookup.set(normHeader(n), canon);
  }
  const index: Partial<Record<C, number>> = {};
  const unknown: string[] = [];
  const repeated: string[] = [];
  headers.forEach((h, i) => {
    const key = normHeader(h);
    if (!key) return;
    const canon = lookup.get(key);
    if (!canon) unknown.push(h.trim());
    else if (index[canon] !== undefined) repeated.push(h.trim());
    else index[canon] = i;
  });
  return { index, unknown, repeated };
}
