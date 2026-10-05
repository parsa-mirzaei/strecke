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

/** Inbox columns, in sheet order. The importer refuses the whole sheet if the header differs. */
export const INBOX_COLUMNS = [
  'de', 'article', 'en', 'pos', 'tier', 'domain', 'family', 'cloze_1', 'answer_1', 'hint_1',
  'cloze_2', 'answer_2', 'listen_de', 'listen_en', 'wrong_1', 'wrong_2', 'capture_id',
  'start_stage', 'source', 'run_id', 'status', 'reason', 'word_id',
] as const;
/** Columns an agent fills. The last three are written back by the importer only. */
export const AGENT_COLUMNS = INBOX_COLUMNS.slice(0, 20);
export const RESERVED_COLUMNS = ['start_stage', 'status', 'reason', 'word_id'] as const;

/** Core tabs, their columns and primary keys. */
export const CORE_TABS = {
  words: {
    key: 'word_id',
    columns: ['word_id', 'de', 'article', 'en', 'pos', 'tier', 'domain', 'family', 'start_stage', 'image_url',
      'image_ok', 'source', 'status', 'dedupe_key', 'created_at', 'updated_at'],
  },
  prompts: {
    key: 'prompt_id',
    columns: ['prompt_id', 'word_id', 'kind', 'de_text', 'answer', 'hint_en', 'en_text', 'distractors', 'status'],
  },
  events: {
    key: 'event_id',
    columns: ['event_id', 'ts', 'type', 'word_id', 'prompt_id', 'card_type', 'result', 'ms', 'payload', 'device'],
  },
  word_state: { key: 'word_id', columns: ['word_id', 'stage', 'due_at', 'lapses', 'streak', 'last_seen'] },
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

/** Per-field length caps for Inbox rows (characters). */
export const FIELD_MAX: Record<string, number> = {
  de: 60, article: 3, en: 80, pos: 6, tier: 5, domain: 9, family: 40,
  cloze_1: 120, answer_1: 60, hint_1: 60, cloze_2: 120, answer_2: 60,
  listen_de: 140, listen_en: 160, wrong_1: 80, wrong_2: 80,
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
