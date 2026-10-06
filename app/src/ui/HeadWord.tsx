import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Article } from '../data/types';

/**
 * The headword, sized to fit one line where possible: long German compounds switch to the
 * condensed width first, then step down in size, and only then hyphenate.
 */
export function HeadWord({ text, article, plural, onSpeak }: { text: string; article: Article; plural?: string; onSpeak?: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [fit, setFit] = useState({ size: 2.75, condensed: false });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const box = el.parentElement!.clientWidth;
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-weight:500;letter-spacing:-0.02em';
      el.parentElement!.appendChild(probe);
      const widthAt = (size: number, condensed: boolean) => {
        probe.style.fontFamily = condensed ? 'var(--font-cond)' : 'var(--font)';
        probe.style.fontSize = `${size}rem`;
        // The longest word decides; phrases may wrap between words.
        const longest = text.split(/\s+/).sort((a, b) => b.length - a.length)[0] ?? text;
        probe.textContent = longest;
        return probe.getBoundingClientRect().width;
      };
      let next = { size: 2.75, condensed: false };
      if (widthAt(2.75, false) > box) {
        next = { size: 2.75, condensed: true };
        for (let s = 2.75; s >= 1.75 && widthAt(s, true) > box; s -= 0.125) next = { size: s - 0.125, condensed: true };
      }
      probe.remove();
      setFit((prev) => (prev.size === next.size && prev.condensed === next.condensed ? prev : next));
    };
    measure();
    // Re-measure once the web font has loaded and on rotation.
    document.fonts?.ready.then(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el.parentElement!);
    return () => ro.disconnect();
  }, [text]);

  const isPhrase = /\s/.test(text);
  return (
    <h2 class="head">
      {article && <span class={`head-article art-${article}`}>{article}</span>}
      <button
        ref={ref}
        type="button"
        class={fit.condensed ? 'headword is-condensed' : 'headword'}
        style={{ '--hw-size': `${isPhrase ? Math.min(fit.size, 2.125) : fit.size}rem` }}
        lang="de"
        onClick={onSpeak}
        aria-label={`${article ? article + ' ' : ''}${text}, anhören`}
      >
        {text}
      </button>
      {plural && <span class="meta">{plural === 'nur Plural' ? 'nur Plural' : `Plural: ${plural}`}</span>}
    </h2>
  );
}
