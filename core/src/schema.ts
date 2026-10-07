/**
 * Schemas and limits for the two data stores.
 *   Inbox: the only spreadsheet an AI connector can open. Untrusted.
 *   Core:  the authoritative corpus and the learner's history. Never shared with an AI identity.
 * Everything that crosses from Inbox to Core goes through validate.ts and importer.ts.
 */

export const DOMAINS = ['arbeit', 'uni', 'amt', 'alltag', 'smalltalk'] as const;
export const POS = ['noun', 'verb', 'adj', 'phrase'] as const;
export const TIERS = ['core', 'chunk'] as const;
export const ARTICLES = ['der', 'die', 'das'] as const;
/** Sources an Inbox row may claim. `seed` and `capture` are never accepted from Inbox. */
export const INBOX_SOURCES = ['claude', 'chatgpt', 'manual'] as const;
export const WORD_STATUSES = ['active', 'pending', 'rejected', 'suspended'] as const;

export type Row = Record<string, string>;

/**
 * Optional record columns (DECISIONS D38). A word needs only `de` and `en` (plus `pos`, or an article,
 * which implies a noun); every other column adds exercises. Same names in Core `words`, the Inbox v2
 * header and seed files.
 */
export const RECORD_COLUMNS = [
  'plural', 'example_de', 'example_en', 'example_form', 'example_2_de', 'example_2_en', 'example_2_form',
  'collocation', 'prep', 'note', 'wrong_1', 'wrong_2', 'image_key',
] as const;

/** Closed list for `prep`: the prepositions that commonly govern a word at A2–B1. */
export const PREPOSITIONS = [
  'ab', 'an', 'auf', 'aus', 'bei', 'bis', 'durch', 'für', 'gegen', 'in', 'mit', 'nach', 'ohne', 'seit', 'über',
  'um', 'unter', 'von', 'vor', 'zu', 'zwischen',
] as const;

/**
 * Allow-list for `image_key`: bundled pictograms (Lucide icon names, D44) for concrete nouns where a
 * picture helps. The app bundles exactly these; anything else is rejected, so no row can point at a URL.
 */
export const IMAGE_KEYS = [
  'bus', 'train-front', 'tram-front', 'bike', 'car', 'plane', 'ticket', 'map-pin', 'id-card', 'file-text',
  'mail', 'phone', 'key', 'house', 'building-2', 'landmark', 'hospital', 'pill', 'stethoscope', 'shopping-cart',
  'shopping-bag', 'wallet', 'credit-card', 'banknote', 'receipt', 'calendar', 'clock', 'umbrella', 'shirt',
  'coffee', 'utensils', 'apple', 'book-open', 'graduation-cap', 'laptop', 'printer', 'briefcase', 'backpack',
  'bed', 'lamp', 'trash-2', 'package', 'scissors', 'glasses', 'baby', 'dog', 'sun', 'cloud-rain', 'snowflake',
] as const;

/**
 * Inbox v1 columns (Phase 0 contract), in sheet order. Still accepted by the importer; its clozes and
 * listen sentences are stored as `prompts` and win over generated exercises (compat layer, record.ts).
 */
export const INBOX_V1_COLUMNS = [
  'de', 'article', 'en', 'pos', 'tier', 'domain', 'family', 'cloze_1', 'answer_1', 'hint_1',
  'cloze_2', 'answer_2', 'listen_de', 'listen_en', 'wrong_1', 'wrong_2', 'capture_id',
  'start_stage', 'source', 'run_id', 'status', 'reason', 'word_id',
] as const;

/** Inbox v2 columns (current contract), in sheet order. The importer refuses a header matching neither version. */
export const INBOX_COLUMNS = [
  'de', 'article', 'plural', 'en', 'pos', 'tier', 'domain', 'family',
  'example_de', 'example_en', 'example_form', 'example_2_de', 'example_2_en', 'example_2_form',
  'collocation', 'prep', 'note', 'wrong_1', 'wrong_2', 'image_key',
  'capture_id', 'start_stage', 'source', 'run_id', 'status', 'reason', 'word_id',
] as const;

export type InboxVersion = 1 | 2;
export const INBOX_HEADERS: Record<InboxVersion, readonly string[]> = { 1: INBOX_V1_COLUMNS, 2: INBOX_COLUMNS };

/** Columns an agent fills (all but the last three, which the importer writes back). */
export const agentColumns = (v: InboxVersion): readonly string[] => INBOX_HEADERS[v].slice(0, -3);
export const AGENT_V1_COLUMNS = agentColumns(1);
export const AGENT_COLUMNS = agentColumns(2);
export const RESERVED_COLUMNS = ['start_stage', 'status', 'reason', 'word_id'] as const;

/** Core tabs, their columns and primary keys. */
export const CORE_TABS = {
  words: {
    key: 'word_id',
    columns: ['word_id', 'de', 'article', 'en', 'pos', 'tier', 'domain', 'family', 'start_stage', 'image_url',
      'image_ok', 'source', 'status', 'dedupe_key', 'created_at', 'updated_at', ...RECORD_COLUMNS],
  },
  prompts: {
    key: 'prompt_id',
    columns: ['prompt_id', 'word_id', 'kind', 'de_text', 'answer', 'hint_en', 'en_text', 'distractors', 'status'],
  },
  events: {
    key: 'event_id',
    columns: ['event_id', 'ts', 'type', 'word_id', 'prompt_id', 'card_type', 'result', 'ms', 'payload', 'device'],
  },
  /** A cache derivable from `events` (scheduler.ts); FSRS fields added by D41. */
  word_state: {
    key: 'word_id',
    columns: ['word_id', 'stage', 'due_at', 'lapses', 'streak', 'last_seen', 'stability', 'difficulty', 'reps'],
  },
  captures: { key: 'capture_id', columns: ['capture_id', 'ts', 'text', 'domain', 'context', 'status'] },
  config: { key: 'key', columns: ['key', 'value'] },
  /** Every Inbox row the importer has ever seen, verbatim, keyed by content fingerprint. */
  inbox_log: {
    key: 'fingerprint',
    columns: ['fingerprint', 'seen_at', 'run_id', 'source_claimed', 'stream', 'outcome', 'reason', 'word_id', 'raw'],
  },
  /** Append-only, hash-chained record of every Core write. */
  audit: { key: 'seq', columns: ['seq', 'ts', 'actor', 'op', 'target', 'detail', 'prev_hash', 'hash'] },
} as const;

export type CoreTab = keyof typeof CORE_TABS;
export type Core = Record<CoreTab, Row[]>;
export const CORE_TAB_NAMES = Object.keys(CORE_TABS) as CoreTab[];

export function emptyCore(): Core {
  return Object.fromEntries(CORE_TAB_NAMES.map((t) => [t, []])) as unknown as Core;
}

/** Per-field length caps for Inbox rows and records (characters). */
export const FIELD_MAX: Record<string, number> = {
  de: 60, article: 3, en: 80, pos: 6, tier: 5, domain: 9, family: 40,
  cloze_1: 120, answer_1: 60, hint_1: 60, cloze_2: 120, answer_2: 60,
  listen_de: 140, listen_en: 160, wrong_1: 80, wrong_2: 80,
  plural: 40, example_de: 140, example_en: 160, example_form: 60, example_2_de: 140, example_2_en: 160,
  example_2_form: 60, collocation: 60, prep: 8, note: 120, image_key: 32,
  capture_id: 10, start_stage: 0, source: 7, run_id: 48, status: 0, reason: 0, word_id: 0,
};

export const LIMITS = {
  maxSentenceWords: 14,
  /** Rows accepted per agent run_id, across all passes. */
  maxRowsPerRun: 20,
  /** New rows evaluated per importer pass; the rest wait for the next pass. */
  maxRowsPerPass: 100,
  /** Rows of the Inbox sheet the importer reads at all. */
  maxInboxRows: 2000,
  /** Any single Core cell. */
  maxCoreCell: 2000,
  /** Captures exposed to the agent. */
  maxOpenCaptures: 30,
} as const;

export const ID_PATTERN = {
  word_id: /^w_[a-z0-9]{8}$/,
  prompt_id: /^p_[a-z0-9]{8}$/,
  event_id: /^e_[a-z0-9]{8}$/,
  capture_id: /^c_[a-z0-9]{8}$/,
} as const;
