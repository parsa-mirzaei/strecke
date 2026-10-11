/**
 * What the practice screen draws from: the bundled demo deck, or the learner's sheet (D49).
 * The engine never knows which; this view adds the labels the UI needs.
 */
import type { WordRecord } from '../../../core/src/record.ts';
import type { RowMeta } from '../../../core/src/sheet/parse.ts';
import { formatTime, t, type StringKey } from '../i18n';
import type { SheetCache } from '../sheet/sync';
import { DEMO_RECORDS } from './boot';

export interface ContentView {
  kind: 'demo' | 'sheet';
  words: WordRecord[];
  /** One line naming the data in use, e.g. "Your sheet · 132 words · synced 10:42". */
  summary(): string;
  /** The mono label at the top left of a card: the situation, or the sheet's own topic. */
  labelFor(w: WordRecord): string;
  tagsFor(w: WordRecord): string[];
  canSkip(w: WordRecord): boolean;
  metaFor(w: WordRecord): RowMeta | undefined;
}

const DOMAIN_KEY: Record<string, StringKey> = {
  arbeit: 'domain.arbeit', uni: 'domain.uni', amt: 'domain.amt', alltag: 'domain.alltag', smalltalk: 'domain.smalltalk',
};

const domainLabel = (w: WordRecord) => (w.domain ? t(DOMAIN_KEY[w.domain]!) : '');

export function demoContent(): ContentView {
  return {
    kind: 'demo',
    words: DEMO_RECORDS,
    summary: () => t('source.demo'),
    labelFor: (w) => domainLabel(w) || t('label.word'),
    tagsFor: () => [t('label.demo')],
    canSkip: () => false,
    metaFor: () => undefined,
  };
}

/** The sheet's practised rows, minus the words skipped on this device. */
export function sheetContent(cache: SheetCache, skips: ReadonlySet<string>): ContentView {
  const meta = new Map(cache.rows.map((r) => [r.key, r.meta]));
  const words = cache.rows.filter((r) => r.record && !skips.has(r.key)).map((r) => r.record!);
  return {
    kind: 'sheet',
    words,
    summary: () => (cache.syncedAt ? t('source.sheet', { n: words.length, time: formatTime(cache.syncedAt) }) : t('source.sheetNotYet', { n: words.length })),
    labelFor: (w) => domainLabel(w) || meta.get(w.id)?.topic.toUpperCase().slice(0, 24) || t('label.word'),
    tagsFor: (w) => (meta.get(w.id)?.source === 'agent' ? [t('label.ai')] : []),
    canSkip: (w) => meta.get(w.id)?.source === 'agent',
    metaFor: (w) => meta.get(w.id),
  };
}
