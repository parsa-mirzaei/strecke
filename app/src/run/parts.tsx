import { useLayoutEffect } from 'preact/hooks';
import type { ComponentChildren, RefObject } from 'preact';
import type { Rating } from '@core/fsrs.ts';
import type { RunCard } from '@core/engine/run.ts';
import type { ExerciseType } from '@core/exercises.ts';
import type { WordRecord } from '@core/record.ts';
import { Icon } from '../ui/Icon';
import { reducedMotion } from '../lib/haptics';

export const EASE = 'cubic-bezier(.22,.9,.28,1.02)';

export interface Answer {
  correct: boolean;
  /** Karte only: the learner's own four steps. */
  rating?: Rating;
  help: boolean;
  dontKnow: boolean;
  chosen?: string;
}

export interface ExerciseProps {
  card: RunCard;
  /** Speak German text; `key` names what is being spoken. */
  speak: (text: string, key: string) => void;
  canSpeak: boolean;
  onAnswer: (a: Answer) => void;
  onNext: () => void;
  haptic: (ms?: number) => void;
}

/** What the exercise is called on its card: the "what is this" of the 10-second test. */
export const KIND_LABEL: Record<ExerciseType, string> = {
  karte: 'Karte', artikel: 'Artikel', plural: 'Plural', bedeutung: 'Bedeutung', luecke: 'Lücke', praeposition: 'Präposition',
  kollokation: 'Wortverbindung', hoeren: 'Hören', tippen: 'Tippen', reihenfolge: 'Reihenfolge', kontext2: 'Zweiter Kontext',
};

const POS_LABEL: Record<string, string> = { verb: 'Verb', adj: 'Adj.', phrase: 'Satz', noun: 'Nomen' };

export function Head({ kind, text, canSpeak, onSpeak }: { kind: ExerciseType; text?: string; canSpeak: boolean; onSpeak?: () => void }) {
  return (
    <div class="card-head">
      <span class="kind">{KIND_LABEL[kind]}</span>
      {canSpeak && text && onSpeak ? (
        <button class="icon-btn" type="button" onClick={onSpeak} aria-label="Vorlesen"><Icon name="volume-2" size={22} /></button>
      ) : null}
    </div>
  );
}

/** The small chip before a headword: the article for a noun, else the word class. */
export function Chip({ w }: { w: WordRecord }) {
  const label = w.pos === 'noun' ? w.article : POS_LABEL[w.pos] ?? '';
  return label ? <span class="art">{label}</span> : null;
}

/** "before ___ after" → [before, after]; the gap in the middle is rendered by the caller. */
export function splitGap(gapped: string): [string, string] {
  const i = gapped.indexOf('___');
  return i < 0 ? [gapped, ''] : [gapped.slice(0, i), gapped.slice(i + 3)];
}

/** Shrink the headword until it fits its line (floor 28 px); never breaks inside a word. */
export function useFit(ref: RefObject<HTMLElement>, max: number, dep: unknown) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      let s = innerHeight < 700 ? Math.min(max, 52) : max;
      el.classList.remove('wrap');
      el.style.fontSize = `${s}px`;
      while (el.scrollWidth > el.clientWidth + 1 && s > 28) { s -= 2; el.style.fontSize = `${s}px`; }
      // Still too wide at the floor (a 30+ letter compound on a narrow phone): let it break, never clip.
      if (el.scrollWidth > el.clientWidth + 1) el.classList.add('wrap');
    };
    fit();
    document.fonts?.ready.then(fit).catch(() => undefined);
    addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
  }, [dep]);
}

/**
 * The chosen text flies from its button into the blank. Resolves when it has landed (or been sent back).
 * With reduced motion it resolves at once.
 */
export function flyTo(from: HTMLElement, to: HTMLElement, text: string, ok: boolean): Promise<void> {
  if (reducedMotion()) return Promise.resolve();
  return new Promise((resolve) => {
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    const fly = document.createElement('span');
    fly.className = 'fly';
    fly.textContent = text;
    document.body.appendChild(fly);
    const fw = fly.getBoundingClientRect();
    const sc = 0.72;
    const start = `translate(${a.left + 16}px,${a.top + a.height / 2 - fw.height / 2}px) scale(${sc})`;
    const end = `translate(${b.left + Math.max(0, (b.width - fw.width) / 2)}px,${b.top + (b.height - fw.height) / 2}px) scale(1)`;
    from.style.opacity = '.35';
    const done = () => { fly.remove(); from.style.opacity = ''; resolve(); };
    const go = fly.animate([{ transform: start }, { transform: end }], { duration: 420, easing: EASE, fill: 'forwards' });
    go.onfinish = () => {
      if (ok) return done();
      setTimeout(() => {
        const back = fly.animate([{ transform: end, opacity: 1 }, { transform: start, opacity: 0 }], { duration: 360, easing: 'ease-in-out', fill: 'forwards' });
        back.onfinish = done;
      }, 180);
    };
  });
}

export function Hint({ children }: { children: ComponentChildren }) {
  return <p class="hint" aria-live="polite">{children}</p>;
}

/** Wrong answers get the project's quiet line; right answers a plain confirmation. No praise, no alarm colour. */
export const SEE_AGAIN = 'Das sehen wir bald wieder.';

/** Words from the sheet shown in the answer area (English glosses stay as typed). */
export const CheckMark = () => <Icon name="check" size={22} />;

/** Size step for long content: '' up to `a` characters, 'long' up to `b`, 'xlong' beyond. */
export const sizeClass = (text: string, a: number, b: number) => (text.length > b ? ' xlong' : text.length > a ? ' long' : '');
