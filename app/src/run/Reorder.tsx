import { useState } from 'preact/hooks';
import { Head, Hint, seeAgain, sizeClass, type ExerciseProps } from './parts';
import { t } from '../i18n';

/** Reihenfolge: tap the words in the order of the sentence. Tap a placed word to take it back. */
export function Reorder({ card, speak, canSpeak, onAnswer, onNext, haptic }: ExerciseProps) {
  const { word: w, exercise: x } = card;
  /** Indices into x.tokens, in the order the learner placed them. */
  const [placed, setPlaced] = useState<number[]>([]);
  const [result, setResult] = useState<'right' | 'wrong' | null>(null);
  const [dont, setDont] = useState(false);
  const done = result !== null || dont;
  const all = placed.length === x.tokens.length;

  const add = (i: number) => { if (!done && !placed.includes(i)) { haptic(6); setPlaced([...placed, i]); } };
  const take = (i: number) => { if (!done) setPlaced(placed.filter((p) => p !== i)); };

  function check() {
    if (done || !all) return;
    const given = placed.map((i) => x.tokens[i]).join(' ');
    const ok = given === x.answer;
    haptic(10);
    setResult(ok ? 'right' : 'wrong');
    onAnswer({ correct: ok, help: false, dontKnow: false, chosen: given });
  }

  function giveUp() {
    if (done) return;
    setDont(true);
    onAnswer({ correct: false, help: false, dontKnow: true });
  }

  const hint = !done ? t('reorder.ask') : result === 'right' ? t('common.right') : `${seeAgain()} ${t('reorder.shown')}`;
  const shownRight = done && result !== 'right';

  return (
    <>
      <main class="mid">
        <section lang="de" class="card cl enter" aria-label={t('kind.reihenfolge')}>
          <Head kind="reihenfolge" text={x.answer} canSpeak={canSpeak && done} onSpeak={() => speak(x.answer, w.id)} />
          <div class="front">
            {x.sentenceEn ? <p class={`q${sizeClass(x.sentenceEn, 60, 110)}`} lang="en">{x.sentenceEn}</p> : null}
            <div class={`built${result === 'right' ? ' right' : shownRight ? ' shown' : ''}`} aria-label={t('reorder.yours')} aria-live="polite">
              {shownRight
                ? <p class="shown-text" style={{ margin: 0 }}>{x.answer}</p>
                : placed.map((i) => (
                  <button key={i} type="button" class="chip" disabled={done} onClick={() => take(i)}>{x.tokens[i]}</button>
                ))}
            </div>
          </div>
        </section>
      </main>
      <footer class="act enter">
        <Hint>{hint}</Hint>
        <div class="chips" lang="de" role="group" aria-label={t('reorder.words')}>
          {x.tokens.map((t, i) => (
            <button key={i} type="button" class={`chip${placed.includes(i) ? ' used' : ''}`} disabled={done || placed.includes(i)} onClick={() => add(i)}>{t}</button>
          ))}
        </div>
        <div class="pair">
          <button class="ghost" type="button" disabled={done} onClick={giveUp}>{t('common.dontKnow')}</button>
          {done
            ? <button class="primary" type="button" onClick={onNext}>{t('common.next')}</button>
            : <button class="primary" type="button" disabled={!all} onClick={check}>{t('common.check')}</button>}
        </div>
      </footer>
    </>
  );
}
