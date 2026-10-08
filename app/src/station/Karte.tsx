import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Exercise } from '@core/exercises.ts';
import type { WordRecord } from '@core/record.ts';
import { Icon } from '../ui/Icon';
import {
  DUR, EASE_OUT, animateSpring, currentY, haptic, profile, reducedMotion, releaseVelocity, rubberband,
} from './motion';
import { splitTarget } from './text';

export interface KarteProps {
  word: WordRecord;
  exercise: Exercise;
  /** Show the optional speaking invitation after the reveal (owner's choice, D42). */
  invite: boolean;
  /** Set when the card should leave; `velocity` (px/ms, negative = up) continues a swipe. */
  leaving: { velocity: number } | null;
  onReveal: () => void;
  onAdvance: (velocity: number) => void;
  onFinish: () => void;
  onExited: () => void;
}

/** Commit a swipe past this distance (px), or on a flick faster than FLICK (px/ms) past MIN_FLICK px. */
const COMMIT_DISTANCE = 110;
const FLICK = 0.45;
const MIN_FLICK = 20;
/** Movement before a press becomes a drag, so taps stay taps. */
const SLOP = 10;

/**
 * Karte (stage 0): the word, its example on a board, and an amber cover over the meaning. Lifting the
 * cover is the only thing to do; then *Weiter* or a swipe up moves on. Not graded.
 */
export function Karte(props: KarteProps) {
  const { word, exercise, invite, leaving } = props;
  const cardRef = useRef<HTMLElement>(null);
  const coverRef = useRef<HTMLButtonElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const [revealed, setRevealed] = useState(false);
  const [coverGone, setCoverGone] = useState(false);
  // Listeners are attached once; they always reach the latest props and reveal() through refs.
  const live = useRef(props);
  live.current = props;

  // Live handles shared by the gesture and the animations, so either can interrupt the other.
  const motion = useRef({
    enter: null as Animation | null,
    cancelSpring: null as (() => void) | null,
    revealed: false,
    leaving: false,
  });
  motion.current.revealed = revealed;

  // Long compounds never break inside the word: the headword shrinks until its longest word fits.
  useLayoutEffect(() => {
    const el = headRef.current;
    if (!el) return;
    el.style.fontSize = '';
    const fit = () => {
      if (el.scrollWidth <= el.clientWidth + 1) return;
      const size = parseFloat(getComputedStyle(el).fontSize);
      el.style.fontSize = `${Math.max(28, Math.floor((size * el.clientWidth) / el.scrollWidth))}px`;
    };
    fit();
    // Overpass may still be loading on the very first card; refit once it is in.
    document.fonts?.ready.then(() => { el.style.fontSize = ''; fit(); });
  }, [word.de]);

  // Enter: rise from below and settle (brief: 680 ms). Content is interactive from the first frame.
  useLayoutEffect(() => {
    const el = cardRef.current!;
    const reduce = reducedMotion();
    const p = profile();
    motion.current.enter = el.animate(
      reduce
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ transform: `translateY(${p.enterOffset}px)`, opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
      { duration: reduce ? DUR.reduced : p.enter, easing: p.enterEase },
    );
  }, []);

  // Leave: continue upwards from wherever the card is now, at the swipe's speed.
  useEffect(() => {
    if (!leaving) return;
    const el = cardRef.current!;
    const m = motion.current;
    m.leaving = true;
    m.cancelSpring?.();
    const from = stopEnter(el);
    const reduce = reducedMotion();
    const distance = Math.max(160, el.offsetHeight * 0.45);
    const speed = Math.abs(Math.min(0, leaving.velocity));
    const exit = profile().exit;
    const duration = reduce ? DUR.reduced : speed > 0 ? Math.min(exit, Math.max(160, distance / speed)) : exit;
    el.style.pointerEvents = 'none';
    const anim = el.animate(
      reduce
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [{ transform: `translateY(${from}px)`, opacity: 1 }, { transform: `translateY(${from - distance}px)`, opacity: 0 }],
      { duration, easing: EASE_OUT, fill: 'forwards' },
    );
    anim.onfinish = () => live.current.onExited();
  }, [leaving]);

  /** Stop the enter animation where it is and hand the live position to inline style. */
  function stopEnter(el: HTMLElement): number {
    const m = motion.current;
    const y = currentY(el);
    if (m.enter && m.enter.playState === 'running') {
      m.enter.cancel();
      el.style.opacity = '1';
    }
    m.enter = null;
    el.style.transform = `translateY(${y}px)`;
    return y;
  }

  // ------------------------------------------------------------- the cover

  function reveal() {
    if (motion.current.revealed || motion.current.leaving) return;
    haptic.reveal();
    setRevealed(true);
    live.current.onReveal();
    const reduce = reducedMotion();
    const cover = coverRef.current!;
    const hadFocus = document.activeElement === cover;
    const p = profile();
    const lift = cover.animate(
      reduce ? [{ opacity: 1 }, { opacity: 0 }] : p.coverFrames,
      { duration: reduce ? DUR.reduced : p.cover, easing: p.coverEase, fill: 'forwards' },
    );
    lift.onfinish = () => setCoverGone(true);
    // Translation, collocation and note arrive after the meaning, one by one.
    const items = Array.from(detailsRef.current?.children ?? []) as HTMLElement[];
    items.forEach((node, i) => {
      node.animate(
        reduce ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
        { duration: reduce ? DUR.reduced : 320, delay: reduce ? 0 : p.detailsDelay + i * DUR.detailsStagger, easing: EASE_OUT, fill: 'backwards' },
      );
    });
    nextRef.current?.animate(
      [{ opacity: 0, transform: reduce ? 'none' : 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
      { duration: 240, delay: reduce ? 0 : Math.min(180, p.cover / 3), easing: EASE_OUT, fill: 'backwards' },
    );
    if (hadFocus) requestAnimationFrame(() => nextRef.current?.focus({ preventScroll: true }));
  }

  const revealRef = useRef(reveal);
  revealRef.current = reveal;

  // ------------------------------------------------------------- swipe up to continue

  useEffect(() => {
    const el = cardRef.current!;
    let pointer: number | null = null;
    let dragging = false;
    let startX = 0, startY = 0, base = 0;
    let samples: { y: number; t: number }[] = [];
    let suppressClick = false;
    const m = motion.current;

    const place = (raw: number) => {
      const h = el.offsetHeight || 600;
      // Upwards follows the finger once the cover is lifted; everything else resists.
      const y = raw < 0 && m.revealed ? raw : rubberband(raw, h);
      el.style.transform = `translateY(${y}px)`;
    };

    const down = (e: PointerEvent) => {
      if (pointer !== null || m.leaving || (e.pointerType === 'mouse' && e.button !== 0)) return; // one finger only
      pointer = e.pointerId;
      dragging = false;
      startX = e.clientX;
      startY = e.clientY;
      samples = [{ y: e.clientY, t: e.timeStamp }];
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (!dragging) {
        if (Math.abs(dy) < SLOP || Math.abs(dy) < Math.abs(dx)) return;
        dragging = true;
        suppressClick = true;
        m.cancelSpring?.();
        m.cancelSpring = null;
        base = stopEnter(el);
        // Start from the finger, not from where the slop ended: no jump.
        startY = e.clientY;
        try { el.setPointerCapture(e.pointerId); } catch { /* pointer already gone: the drag still tracks via the card */ }
      }
      samples.push({ y: e.clientY, t: e.timeStamp });
      if (samples.length > 12) samples.shift();
      place(base + (e.clientY - startY));
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      pointer = null;
      if (!dragging) return;
      dragging = false;
      const v = releaseVelocity(samples);
      const y = currentY(el);
      if (m.revealed && (y < -COMMIT_DISTANCE || (v < -FLICK && y < -MIN_FLICK))) {
        live.current.onAdvance(v);
        return;
      }
      // Spring home, carrying the finger's speed; a little bounce only when the release was a flick.
      const reduce = reducedMotion();
      if (reduce) { el.style.transform = 'translateY(0)'; return; }
      m.cancelSpring = animateSpring(y, 0, v, (x) => { el.style.transform = `translateY(${x}px)`; },
        { damping: Math.abs(v) > FLICK ? 0.8 : 1, response: 0.38 });
    };
    // A drag must never also count as a tap on the cover or a button.
    const click = (e: MouseEvent) => {
      if (suppressClick) { e.stopPropagation(); e.preventDefault(); }
      suppressClick = false;
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('click', click, true);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('click', click, true);
      m.cancelSpring?.();
    };
  }, []);

  // Keyboard: Enter or Arrow Up moves on after the reveal (buttons keep their own Enter/Space).
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (motion.current.leaving || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const onButton = (e.target as HTMLElement | null)?.closest('button');
      if (e.key === 'ArrowUp' || (e.key === 'Enter' && !onButton)) {
        if (motion.current.revealed) { e.preventDefault(); live.current.onAdvance(0); }
        else if (e.key === 'Enter') { e.preventDefault(); revealRef.current(); }
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  // ------------------------------------------------------------- layout

  const parts = splitTarget(exercise.sentence, exercise.target);
  const isPhrase = word.pos === 'phrase';
  const translation = exercise.sentence ? exercise.sentenceEn : '';

  return (
    <article
      class={`card${isPhrase ? ' is-phrase' : ''}${exercise.sentence ? '' : ' is-thin'}`}
      ref={cardRef} aria-label={word.de} aria-hidden={leaving ? true : undefined}
    >
      <div class="card-body">
        <div class="display">
        <header class="head">
          <div class="head-text">
            {word.article ? <span class="chip" lang="de">{word.article}</span> : null}
            <h1 class={isPhrase ? 'headword is-phrase' : 'headword'} lang="de" ref={headRef}>{word.de}</h1>
            {word.plural ? <p class="plural" lang="de"><span class="sr-only">Plural: </span>{word.plural}</p> : null}
          </div>
          {word.imageKey ? <span class="pictogram"><Icon name={word.imageKey} size={28} /></span> : null}
        </header>

        {exercise.sentence ? (
          <figure class="board" lang="de">
            {parts ? <>{parts[0]}<mark>{parts[1]}</mark>{parts[2]}</> : exercise.sentence}
          </figure>
        ) : null}
        </div>

        <section class="answer">
        <div class="meaning">
          <p class="meaning-text" lang="en" aria-hidden={revealed ? undefined : true}>{word.en}</p>
          <p class="sr-only" aria-live="polite">{revealed ? word.en : ''}</p>
          {coverGone ? null : (
            <button class="cover" ref={coverRef} type="button" aria-label="Bedeutung zeigen" onClick={reveal} disabled={revealed} />
          )}
        </div>

        <div class="details" ref={detailsRef} data-hidden={revealed ? undefined : ''} aria-hidden={revealed ? undefined : true}>
          {translation ? <p class="translation" lang="en">{translation}</p> : null}
          {word.collocation ? <p class="collocation" lang="de">{word.collocation}</p> : null}
          {word.note ? <p class="note" lang="de">{word.note}</p> : null}
          {invite ? <p class="speak-invite">Wenn du magst: sag es einmal laut.</p> : null}
        </div>
        </section>
      </div>

      <div class="actions">
        <button class="btn btn-quiet" type="button" onClick={props.onFinish}>Fertig</button>
        <button class="btn btn-primary" type="button" ref={nextRef} hidden={!revealed} onClick={() => props.onAdvance(0)}>
          Weiter
        </button>
      </div>
    </article>
  );
}
