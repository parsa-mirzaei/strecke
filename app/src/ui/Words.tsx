import type { JSX } from 'preact';

/**
 * A German sentence where some words can be hidden as bars.
 * The bars keep the word's real width, so the sentence keeps its shape when revealed.
 */

export interface WordsProps {
  text: string;
  /** Hide every word (Listen) or only the gap (Recall, via `gap`). */
  hideAll?: boolean;
  /** Recall: the `___` placeholder is replaced by this answer, hidden until revealed. */
  gap?: string;
  revealed: boolean;
  /** Index of the word being spoken (Listen), lights the bar. */
  live?: number;
  /** Word indices drawn as the target (Listen: the item's word). */
  target?: number[];
  /** Highlight words matching this form (Meet). */
  focus?: string;
  chunk?: boolean;
  /** Prompt cards: the sentence is the largest thing on screen. */
  hero?: boolean;
  label?: string;
}

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}]/gu, '');

export function splitWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** Indices of the words in `sentence` that belong to `item` (first match of the item's longest word). */
export function targetIndices(sentence: string, de: string): number[] {
  const words = splitWords(sentence).map(norm);
  const parts = splitWords(de).map(norm).filter((p) => p.length > 2 && !['sich', 'der', 'die', 'das'].includes(p));
  const key = parts.sort((a, b) => b.length - a.length)[0];
  if (!key) return [];
  const stem = key.slice(0, Math.max(4, key.length - 3));
  const hits = words.flatMap((w, i) => (w.startsWith(stem) || w.includes(key) ? [i] : []));
  return hits.slice(0, 1);
}

export function Words({ text, hideAll, gap, revealed, live = -1, target = [], focus, chunk, hero, label }: WordsProps) {
  const focusKey = focus ? norm(focus).slice(0, Math.max(4, norm(focus).length - 3)) : '';
  const parts: JSX.Element[] = [];

  splitWords(text).forEach((word, i) => {
    const space = i > 0 ? ' ' : '';
    if (gap !== undefined && word.includes('___')) {
      const [before, after] = word.split('___');
      parts.push(
        <span key={i}>
          {space}
          {before}
          {revealed ? (
            <span class="w w-reveal">{gap}</span>
          ) : (
            <span class="w w-hidden" aria-label="Lücke">{gap}</span>
          )}
          {after}
        </span>,
      );
      return;
    }
    if (hideAll && !revealed) {
      const cls = ['w', 'w-hidden', target.includes(i) && 'is-target', i === live && 'is-live'].filter(Boolean).join(' ');
      parts.push(
        <span key={i}>
          {space}
          <span class={cls} aria-hidden="true">{word}</span>
        </span>,
      );
      return;
    }
    const isFocus = !!focusKey && norm(word).startsWith(focusKey);
    const cls = [hideAll && 'w-plain-reveal', target.includes(i) && hideAll && 'w-focus', isFocus && 'w-focus'].filter(Boolean).join(' ');
    parts.push(
      <span key={i}>
        {space}
        {cls ? <span class={cls}>{word}</span> : word}
      </span>,
    );
  });

  return (
    <p class={['sentence', hero && 'is-hero', chunk && !hero && 'is-chunk'].filter(Boolean).join(' ')} lang="de" aria-label={hideAll && !revealed ? label : undefined}>
      {parts}
    </p>
  );
}
