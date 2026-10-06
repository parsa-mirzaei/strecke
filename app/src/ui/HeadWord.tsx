import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Article } from '../data/types';

const MAX = 2.75;
const MIN = 1.625;

/**
 * The headword, sized so its longest word fits on one line: long compounds
 * (Krankenversicherungskarte) step down in size instead of breaking mid-word.
 * Tapping it speaks it.
 */
export function HeadWord({ text, article, plural, onSpeak, hideArticle }: {
  text: string;
  article: Article;
  plural?: string;
  onSpeak?: () => void;
  /** Article quiz: the article is the question, so it is not shown yet. */
  hideArticle?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const isPhrase = /\s/.test(text);
  const top = isPhrase ? 2 : MAX;
  const [size, setSize] = useState(top);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const box = el.parentElement!.clientWidth;
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-family:var(--serif);font-weight:560';
      el.parentElement!.appendChild(probe);
      // The longest word decides; phrases may wrap between words.
      probe.textContent = text.split(/\s+/).sort((a, b) => b.length - a.length)[0] ?? text;
      let s = top;
      for (; s > MIN; s -= 0.125) {
        probe.style.fontSize = `${s}rem`;
        if (probe.getBoundingClientRect().width <= box) break;
      }
      probe.remove();
      setSize(s);
    };
    measure();
    // Re-measure once the web font has loaded and on rotation.
    document.fonts?.ready.then(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el.parentElement!);
    return () => ro.disconnect();
  }, [text]);

  const label = `${article && !hideArticle ? article + ' ' : ''}${text}`;
  return (
    <div class="head">
      {article && (
        <span class={hideArticle ? 'head-article is-unknown' : `head-article art-${article}`}>
          {hideArticle ? ' ' : article}
        </span>
      )}
      {onSpeak ? (
        <button ref={ref as preact.Ref<HTMLButtonElement>} type="button" class="headword" style={{ '--hw-size': `${size}rem` }} lang="de" onClick={onSpeak} aria-label={`${label}, anhören`}>
          {text}
        </button>
      ) : (
        <span ref={ref as preact.Ref<HTMLSpanElement>} class="headword" style={{ '--hw-size': `${size}rem` }} lang="de">
          {text}
        </span>
      )}
      {plural && <span class="head-meta">{plural === 'nur Plural' ? 'nur Plural' : `Plural ${plural}`}</span>}
    </div>
  );
}
