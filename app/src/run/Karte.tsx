import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Rating } from '@core/fsrs.ts';
import { splitTarget } from './text';
import { Icon } from '../ui/Icon';
import { reducedMotion } from '../lib/haptics';
import { Chip, EASE, Head, Hint, sizeClass, useFit, type ExerciseProps } from './parts';
import { t } from '../i18n';

/** The four steps about memory, not difficulty. Rising bars; the colour is the grade colour of the route. */
const STEPS: Array<{ g: 0 | 1 | 2 | 3; rating: Rating }> = [
  { g: 0, rating: 1 },
  { g: 1, rating: 2 },
  { g: 2, rating: 3 },
  { g: 3, rating: 4 },
];
const BAR_H = [6, 10, 15, 20];

export function Karte({ card, speak, canSpeak, onAnswer, onNext, haptic }: ExerciseProps) {
  const { word: w, exercise: x } = card;
  const [revealed, setRevealed] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const flap = useRef<HTMLButtonElement>(null);
  const back = useRef<HTMLDivElement>(null);
  const wordEl = useRef<HTMLHeadingElement>(null);
  const drag = useRef<{ y: number; moved: number; peel: number } | null>(null);
  useFit(wordEl, 72, w.id);
  const choices = useRef<HTMLDivElement>(null);
  // Labels that would break inside a word (large text on a narrow phone): two rows of two, else one list.
  useLayoutEffect(() => {
    const el = choices.current;
    if (!el) return;
    const broken = () => [...el.querySelectorAll<HTMLElement>('.ch')].some((b) => b.scrollWidth > b.clientWidth + 1) || [...el.querySelectorAll<HTMLElement>('.ch .lbl')].some((l) => l.scrollWidth > l.clientWidth + 1 || l.textContent!.split(' ').some((word) => {
      const t = l.firstChild as Text | null;
      if (!t) return false;
      const r = document.createRange();
      const i = t.data.indexOf(word);
      r.setStart(t, i); r.setEnd(t, i + word.length);
      return r.getClientRects().length > 1;
    }));
    const fit = () => {
      el.classList.remove('two', 'one');
      if (!broken()) return;
      el.classList.add('two');
      if (!broken()) return;
      el.classList.replace('two', 'one');
    };
    fit();
    document.fonts?.ready.then(fit).catch(() => undefined);
    addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
  }, []);

  const parts = splitTarget(x.sentence, x.target);

  const set = (deg: number) => {
    if (drag.current) drag.current.peel = deg;
    if (flap.current) flap.current.style.transform = `rotateX(${deg}deg)`;
    if (back.current) back.current.style.opacity = String(Math.min(1, deg / 55));
  };

  function open() {
    if (revealed) return;
    setRevealed(true);
    haptic(12);
    const f = flap.current, b = back.current;
    if (b) b.style.opacity = '1';
    if (!f) return;
    if (reducedMotion()) { f.style.display = 'none'; return; }
    const deg = drag.current?.peel ?? 0;
    const an = f.animate(
      [{ transform: `rotateX(${deg}deg)`, opacity: 1 }, { transform: 'rotateX(90deg)', opacity: 1, offset: 0.85 }, { transform: 'rotateX(90deg)', opacity: 0 }],
      { duration: 560, easing: EASE, fill: 'forwards' },
    );
    an.onfinish = () => { f.style.display = 'none'; };
  }

  const down = (e: PointerEvent) => {
    if (revealed) return;
    drag.current = { y: e.clientY, moved: 0, peel: 0 };
    try { flap.current?.setPointerCapture(e.pointerId); } catch { /* capture is optional */ }
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = d.y - e.clientY;
    d.moved = Math.max(d.moved, Math.abs(dy));
    set(Math.max(0, Math.min(70, dy * 0.8)));
  };
  const up = () => {
    const d = drag.current;
    if (!d) return;
    if (d.moved < 8 || d.peel > 28) open();
    else { if (flap.current) flap.current.style.transition = `transform 360ms ${EASE}`; set(0); }
    drag.current = null;
  };
  const cancel = () => {
    if (!drag.current) return;
    if (flap.current) flap.current.style.transition = `transform 360ms ${EASE}`;
    set(0);
    drag.current = null;
  };
  // Keyboard and assistive tech arrive as a click without a pointer sequence.
  const click = (e: MouseEvent) => { if (e.detail === 0) open(); };

  function rate(i: number) {
    if (!revealed || picked !== null) return;
    setPicked(i);
    haptic(10);
    const s = STEPS[i]!;
    onAnswer({ correct: s.rating > 1, rating: s.rating, help: false, dontKnow: s.rating === 1 });
    setTimeout(onNext, reducedMotion() ? 60 : 240);
  }

  return (
    <>
      <main class="mid">
        <section lang="de" class="card enter" aria-label={t('kind.karte')}>
          <Head kind="karte" text={x.sentence || w.de} canSpeak={canSpeak} onSpeak={() => speak(x.sentence || w.de, w.id)} />
          <div class="front">
            <Chip w={w} />
            <h1 class="word" ref={wordEl}>{w.de}</h1>
            {w.plural ? <p class="pl">{t('common.plural', { plural: w.plural })}</p> : null}
            {x.sentence ? (
              <p class={`ex${sizeClass(x.sentence, 90, 150)}`}>{parts ? <>{parts[0]}<u>{parts[1]}</u>{parts[2]}</> : x.sentence}</p>
            ) : null}
          </div>
          <div class="zone">
            <div class="back" ref={back} aria-hidden={!revealed}>
              <p class={`mean${sizeClass(x.answer, 28, 60)}`} lang="en">{x.answer}</p>
              {(x.sentenceEn || w.collocation || w.note) ? (
                <button class="more" type="button" aria-expanded={more} onClick={() => setMore(!more)}>{more ? t('common.less') : t('common.more')}</button>
              ) : null}
              <div class="extra" hidden={!more}>
                {x.sentenceEn ? <p class="tr" lang="en">{x.sentenceEn}</p> : null}
                {w.collocation ? <p class="col">{w.collocation}</p> : null}
                {w.note ? <p class="tr">{w.note}</p> : null}
              </div>
            </div>
            <button
              class="flap" type="button" ref={flap} aria-label={t('karte.reveal')} disabled={revealed}
              onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onClick={click}
            >
              <span class="flap-inner"><span class="chev"><Icon name="chevron-up" size={26} /></span>{t('karte.reveal')}</span>
              <span class="cut" /><span class="fold" />
            </button>
          </div>
        </section>
      </main>
      <footer class="act enter">
        <Hint>{!revealed ? t('karte.hintCover') : picked === null ? t('karte.hintRate') : ''}</Hint>
        <div class="choices" ref={choices} role="group" aria-label={t('karte.hintRate')}>
          {STEPS.map((s, i) => (
            <button key={s.g} class={`ch${picked === i ? ' sel' : ''}`} type="button" data-g={s.g} disabled={!revealed || picked !== null} onClick={() => rate(i)}>
              <span class="st" aria-hidden="true">{BAR_H.map((h, k) => <b key={k} class={k <= s.g ? 'on' : ''} style={{ height: `${h}px` }} />)}</span>
              <span class="lbl">{t(`rate.${s.rating}`)}</span>
            </button>
          ))}
        </div>
      </footer>
    </>
  );
}
