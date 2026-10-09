import { useRef, useState } from 'preact/hooks';
import type { Exercise, ExerciseType } from '@core/exercises.ts';
import { splitTarget } from './text';
import { CheckMark, Chip, Head, Hint, SEE_AGAIN, flyTo, splitGap, useFit, type ExerciseProps } from './parts';
import { Icon } from '../ui/Icon';

const ASK: Partial<Record<ExerciseType, string>> = {
  artikel: 'Welcher Artikel passt?',
  plural: 'Wie heißt die Mehrzahl?',
  bedeutung: 'Was bedeutet das Wort?',
  luecke: 'Was passt in die Lücke?',
  kontext2: 'Was passt in die Lücke?',
  praeposition: 'Welche Präposition passt?',
  kollokation: 'Welches Wort passt dazu?',
  hoeren: 'Tippe auf den Lautsprecher. Was bedeutet der Satz?',
};

/** One component for every exercise that is answered by tapping one of a few options. */
export function Choice({ card, speak, canSpeak, onAnswer, onNext, haptic }: ExerciseProps) {
  const { word: w, exercise: x } = card;
  const [chosen, setChosen] = useState<string | null>(null);
  const [dont, setDont] = useState(false);
  const [busy, setBusy] = useState(false);
  const [textShown, setTextShown] = useState(false);
  const slot = useRef<HTMLElement>(null);
  const wordEl = useRef<HTMLHeadingElement>(null);
  useFit(wordEl, 64, w.id);
  const done = chosen !== null || dont;
  const ok = chosen === x.answer;

  async function pick(opt: string, btn: HTMLElement) {
    if (done || busy) return;
    setBusy(true);
    haptic(10);
    if (slot.current) await flyTo(btn, slot.current, opt, opt === x.answer);
    setChosen(opt);
    setBusy(false);
    onAnswer({ correct: opt === x.answer, help: textShown, dontKnow: false, chosen: opt });
  }

  function giveUp() {
    if (done || busy) return;
    setDont(true);
    onAnswer({ correct: false, help: textShown, dontKnow: true });
  }

  const shown = done ? x.answer : '';
  const slotCls = `slot${done ? (ok ? ' right' : ' shown') : ''}`;
  // A plain function, not a component, so the slot element survives re-renders and its colour can transition.
  const slotEl = (wide = false) => (
    <span class={`${slotCls}${wide ? ' wide' : ''}`} ref={slot} role="img" aria-label={done ? `Antwort: ${x.answer}` : 'Lücke'}>{shown}</span>
  );

  const [before, after] = splitGap(x.gapped);
  const parts = splitTarget(x.sentence, x.target);
  const translation = x.type === 'kontext2' ? '' : x.sentenceEn || x.hint;

  let content;
  switch (x.type) {
    case 'luecke':
    case 'kontext2':
    case 'praeposition':
    case 'kollokation':
      content = (
        <div class="front">
          <p class="q">{before}{slotEl()}{after}</p>
          {x.type === 'kollokation' ? <p class="qtr">„{w.en}“</p> : translation ? <p class="qtr">{translation}</p> : null}
        </div>
      );
      break;
    case 'artikel':
      content = (
        <div class="front">
          <p class="q">{slotEl()} <span>{w.de}</span></p>
          <p class="qtr">{w.en}</p>
        </div>
      );
      break;
    case 'plural':
      content = (
        <div class="front">
          <Chip w={w} />
          <h1 class="word" ref={wordEl}>{w.de}</h1>
          <p class="q" style={{ marginTop: '10px' }}>Pl. {slotEl()}</p>
        </div>
      );
      break;
    case 'bedeutung':
      content = (
        <div class="front">
          <Chip w={w} />
          <h1 class="word" ref={wordEl}>{w.de}</h1>
          {x.sentence ? <p class="ex">{parts ? <>{parts[0]}<u>{parts[1]}</u>{parts[2]}</> : x.sentence}</p> : null}
          <div style={{ width: '100%', marginTop: '14px' }}>{slotEl(true)}</div>
        </div>
      );
      break;
    case 'hoeren':
      content = (
        <div class="front" style={{ alignItems: 'stretch' }}>
          <button class="play" type="button" onClick={() => speak(x.sentence || w.de, w.id)} aria-label="Satz anhören" disabled={!canSpeak}>
            <Icon name="volume-2" size={40} />
          </button>
          {textShown ? <p class="shown-text">{x.sentence}</p> : (
            <button class="more" type="button" style={{ alignSelf: 'center' }} onClick={() => setTextShown(true)} disabled={done}>Text zeigen</button>
          )}
          <div style={{ width: '100%', marginTop: '14px' }}>{slotEl(true)}</div>
        </div>
      );
      break;
    default:
      content = null;
  }

  const hint = !done ? ASK[x.type] ?? '' : ok ? 'Richtig.' : `${SEE_AGAIN}`;
  return (
    <>
      <main class="mid">
        <section class="card cl enter" aria-label={x.type}>
          <Head kind={x.type} text={x.type === 'hoeren' ? undefined : x.sentence} canSpeak={canSpeak && x.type !== 'hoeren'} onSpeak={() => speak(x.sentence, w.id)} />
          {content}
        </section>
      </main>
      <footer class="act enter">
        <Hint>{hint}</Hint>
        <div class="tags" role="group" aria-label="Antworten">
          {x.options.map((o) => {
            const isRight = done && o === x.answer;
            const isMiss = done && chosen === o && o !== x.answer;
            return (
              <button
                key={o} type="button" class={`tag${isRight ? ' right' : ''}${isMiss ? ' miss' : ''}`} disabled={done || busy}
                onClick={(e) => pick(o, e.currentTarget as HTMLElement)}
              >
                <span>{o}</span>{isRight ? <CheckMark /> : null}
              </button>
            );
          })}
        </div>
        <div class="pair">
          <button class="ghost" type="button" disabled={done || busy} onClick={giveUp}>Weiß ich nicht</button>
          <button class="primary" type="button" disabled={!done} onClick={onNext}>Weiter</button>
        </div>
      </footer>
    </>
  );
}

export const isChoice = (x: Exercise) => x.options.length > 0;
