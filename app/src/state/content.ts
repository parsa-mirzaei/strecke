/**
 * What the practice screen draws from: the bundled demo deck, or the learner's sheet (D49).
 * The engine never knows which; this view adds the labels the UI needs.
 */
import type { WordRecord } from '../../../core/src/record.ts';
import { t } from '../i18n';
import { DEMO_RECORDS } from './boot';

export interface ContentView {
  kind: 'demo' | 'sheet';
  words: WordRecord[];
  /** One line naming the data in use, e.g. "Your sheet · 132 words · synced 10:42". */
  summary(): string;
  tagsFor(w: WordRecord): string[];
  canSkip(w: WordRecord): boolean;
}

export function demoContent(): ContentView {
  return {
    kind: 'demo',
    words: DEMO_RECORDS,
    summary: () => t('source.demo'),
    tagsFor: () => [t('label.demo')],
    canSkip: () => false,
  };
}
