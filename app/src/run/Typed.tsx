import { useRef, useState } from 'preact/hooks';
import { matchTyped, type TypedVerdict } from '@core/typing.ts';
import { Head, Hint, seeAgain, sizeClass, splitGap, type ExerciseProps } from './parts';
import { t } from '../i18n';

/** Tippen: type the missing word into the blank. Matching is forgiving (spelling variants, one slip). */
export function Typed({ card, speak, canSpeak, onAnswer, onNext, haptic }: ExerciseProps) {
  const { word: w, exercise: x } = card;
  const [text, setText] = useState('');
  const [verdict, setVerdict] = useState<TypedVerdict | null>(null);
  const [dont, setDont] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const done = verdict !== null || dont;
  const [before, after] = splitGap(x.gapped);

  function check() {
    if (done) return;
    const v = matchTyped(text, x.answer, w.pos === 'noun' ? w.article : '');
    if (v === 'wrong' && !text.trim()) { input.current?.focus(); return; }
    haptic(10);
    setVerdict(v);
    onAnswer({ correct: v !== 'wrong', help: v === 'near', dontKnow: false, chosen: text.trim() });
  }

  function giveUp() {
    if (done) return;
    setDont(true);
    onAnswer({ correct: false, help: false, dontKnow: true });
  }

  const right = verdict === 'exact' || verdict === 'loose' || verdict === 'near';
  const hint = !done ? t('typed.ask')
    : verdict === 'exact' ? t('common.right')
    : verdict === 'loose' ? t('typed.loose', { answer: x.answer })
    : verdict === 'near' ? t('typed.near', { answer: x.answer })
    : seeAgain();
  const translation = x.sentenceEn || x.hint;

  return (
    <>
      <main class="mid">
        <section lang="de" class="card cl enter" aria-label={t('kind.tippen')}>
          <Head kind="tippen" text={x.sentence} canSpeak={canSpeak} onSpeak={() => speak(x.sentence, w.id)} />
          <div class="front">
            <p class={`q${sizeClass(x.gapped, 70, 130)}`}>
              {before}
              {done ? (
                <span class={`slot ${right ? 'right' : 'shown'}`}>{x.answer}</span>
              ) : (
                <input
                  ref={input} class="slot" type="text" value={text} aria-label={t('typed.input')} autocapitalize="off" autocomplete="off" autocorrect="off"
                  spellcheck={false} enterkeyhint="done" onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); check(); } }}
                />
              )}
              {after}
            </p>
            {translation ? <p class="qtr" lang="en">{translation}</p> : null}
          </div>
        </section>
      </main>
      <footer class="act enter">
        <Hint>{hint}</Hint>
        <div class="pair">
          <button class="ghost" type="button" disabled={done} onClick={giveUp}>{t('common.dontKnow')}</button>
          {done
            ? <button class="primary" type="button" onClick={onNext}>{t('common.next')}</button>
            : <button class="primary" type="button" disabled={!text.trim()} onClick={check}>{t('common.check')}</button>}
        </div>
      </footer>
    </>
  );
}
