/** Content and learning-state shapes the UI works with. Mirrors Core's words/prompts, flattened per item. */

export type Domain = 'arbeit' | 'alltag' | 'uni' | 'amt' | 'smalltalk';
export type Pos = 'noun' | 'verb' | 'adj' | 'phrase';
export type Tier = 'core' | 'chunk';
export type Article = 'der' | 'die' | 'das' | '';

export interface Cloze {
  /** German sentence with exactly one `___`. */
  text: string;
  answer: string;
  hint?: string;
}

export interface Item {
  id: string;
  de: string;
  article: Article;
  /** Plural ending or form, e.g. "-en", "Anschlüsse", "nur Plural". */
  plural?: string;
  en: string;
  pos: Pos;
  tier: Tier;
  domain: Domain;
  /** A full sentence, used for Meet and Listen. */
  sentence: string;
  sentenceEn: string;
  cloze1: Cloze;
  cloze2?: Cloze;
  /** Two plausible wrong meanings for Listen. */
  wrong: [string, string];
  /** One short usage note, only when it prevents a typical mistake. */
  note?: string;
  /** Key of an optional visual mnemonic. Most items have none. */
  mnemonic?: string;
  /** `suggestion` = proposed by an agent, shown as "Vorschlag" until kept or dismissed. */
  origin: 'own' | 'suggestion';
}

/** meet = first encounter; choice = pick the meaning or the article; listen = hear, then pick; recall = fill the gap. */
export type CardType = 'meet' | 'choice' | 'listen' | 'recall';

export interface ItemState {
  /** 0 new, 1 recognise (choice or listen), 2 recall with hint, 3 recall without hint, 4+ rotation. */
  stage: number;
  dueAt: number;
  lapses: number;
  reps: number;
  /** Suggestion items only: kept (accepted) or dismissed. */
  status: 'active' | 'pending' | 'dismissed';
}

export type Grade = 'new' | 'known' | 'good' | 'miss';

/** What happened to one feed item: a grade, dismissed (suggestion), or scrolled past unanswered. */
export type Outcome = Grade | 'dismiss' | 'skip';

export interface ReviewEvent {
  id: string;
  ts: number;
  itemId: string;
  card: CardType;
  grade: Outcome;
  ms: number;
}

export interface Capture {
  id: string;
  ts: number;
  text: string;
  domain: Domain | '';
}

export interface UsageEntry {
  open: number;
  close: number;
  cards: number;
}

export const DOMAIN_LABEL: Record<Domain, string> = {
  arbeit: 'Arbeit',
  alltag: 'Alltag',
  uni: 'Uni',
  amt: 'Amt',
  smalltalk: 'Gespräche',
};

export const DOMAIN_ORDER: Domain[] = ['alltag', 'arbeit', 'amt', 'uni', 'smalltalk'];
