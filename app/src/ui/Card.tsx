/**
 * One practice card (STATION.md "Exercises on screen"). The layout carries the instruction: amber marks
 * what you have to retrieve. Every graded card offers "I don't know"; the Karte ends with the learner's
 * own four-step report (D52).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Exercise } from '../../../core/src/exercises.ts';
import type { Rating } from '../../../core/src/fsrs.ts';
import type { WordRecord } from '../../../core/src/record.ts';
import { matchTyped } from '../../../core/src/typing.ts';
import { speech } from '../audio/tts';
import type { Answer } from '../engine/practice';
import { t, type StringKey } from '../i18n';
import { BarsIcon, CheckIcon, PlayIcon, SpeakerIcon } from './icons';

export interface CardProps {
  word: WordRecord;
  exercise: Exercise;
  stage: number;
  canListen: boolean;
  haptics: boolean;
  /** Small mono tags in the label strip (DEMO, AI, …). */
  tags: string[];
  /** The source line on the first card of a visit (demo vs sheet). */
  sourceLine?: preact.ComponentChildren;
  inviteAloud: boolean;
  onAnswer: (a: Answer) => void;
  onNext: () => void;
  onDone: () => void;
  onSkipWord?: () => void;
}

const DOMAIN_KEY: Record<string, StringKey> = {
  arbeit: 'domain.arbeit', uni: 'domain.uni', amt: 'domain.amt', alltag: 'domain.alltag', smalltalk: 'domain.smalltalk',
};

function buzz(on: boolean, pattern: number | number[]) {
  if (on && typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
}

/** A sentence with one `___`, the blank drawn as an amber gap (filled once answered). */
function Gapped({ text, fill, filled, children }: { text: string; fill: string; filled: boolean; children?: preact.ComponentChildren }) {
  const [before, after] = text.split('___');
  return (
    <p class="board-text" lang="de">
      {before}
      <span class={filled ? 'gap is-filled' : 'gap'} aria-label={filled ? fill : t('a11y.gap')}>
        {children ?? (filled ? fill : '      ')}
      </span>
      {after}
    </p>
  );
}

/** The example sentence with the word itself marked. */
function Marked({ text, target }: { text: string; target: string }) {
  const i = target ? text.indexOf(target) : -1;
  if (i < 0) return <p class="board-text" lang="de">{text}</p>;
  return (
    <p class="board-text" lang="de">
      {text.slice(0, i)}
      <mark>{target}</mark>
      {text.slice(i + target.length)}
    </p>
  );
}

function Headword({ word, hideArticle, filledArticle }: { word: WordRecord; hideArticle?: boolean; filledArticle?: string }) {
  return (
    <div class="head">
      {word.article && (
        hideArticle
          ? <span class={filledArticle ? 'chip is-filled' : 'chip is-empty'} aria-label={filledArticle || t('a11y.gap')}>{filledArticle || '  '}</span>
          : <span class="chip">{word.article}</span>
      )}
      <h2 class="headword" lang="de">{word.de}</h2>
      {word.plural && !hideArticle && <span class="plural" lang="de">{word.plural}</span>}
    </div>
  );
}

function Speak({ text, enabled }: { text: string; enabled: boolean }) {
  if (!enabled) return null;
  return (
    <button type="button" class="icon-btn" aria-label={t('practice.listen')} onClick={() => speech.speak(text)}>
      <SpeakerIcon />
    </button>
  );
}

export function Card(p: CardProps) {
  const { word, exercise: x } = p;
  const shownAt = useRef(Date.now());
  const [picked, setPicked] = useState<string | null>(null);
  const [dontKnow, setDontKnow] = useState(false);
  const [lifted, setLifted] = useState(false);
  const [typed, setTyped] = useState('');
  const [verdict, setVerdict] = useState<ReturnType<typeof matchTyped> | null>(null);
  const [textShown, setTextShown] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const nextRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const answered = picked !== null || dontKnow || verdict !== null;
  const right = picked !== null ? picked === x.answer : verdict !== null ? verdict !== 'wrong' : false;
  const ms = () => Date.now() - shownAt.current;

  useEffect(() => {
    if (answered) nextRef.current?.focus({ preventScroll: true });
  }, [answered]);
  useEffect(() => {
    if (x.type === 'tippen') inputRef.current?.focus({ preventScroll: true });
  }, []);

  const choose = (o: string) => {
    if (answered) return;
    setPicked(o);
    const ok = o === x.answer;
    buzz(p.haptics, ok ? 12 : [8, 60, 8]);
    p.onAnswer({ correct: ok, ms: ms(), chosen: o, help: textShown });
  };
  const giveUp = () => {
    if (answered) return;
    setDontKnow(true);
    buzz(p.haptics, [8, 60, 8]);
    p.onAnswer({ correct: false, ms: ms(), dontKnow: true });
  };
  const check = () => {
    if (answered || !typed.trim()) return;
    const v = matchTyped(typed, x.answer, word.article);
    setVerdict(v);
    buzz(p.haptics, v === 'wrong' ? [8, 60, 8] : 12);
    p.onAnswer({ correct: v !== 'wrong', ms: ms(), help: v === 'near', chosen: typed });
  };
  const rate = (r: Rating) => {
    p.onAnswer({ correct: true, ms: ms(), rating: r });
    p.onNext();
  };
  const play = () => {
    setSpeaking(true);
    speech.speak(x.sentence, { rate: picked ? 0.85 : 1, onEnd: () => setSpeaking(false) });
  };

  // Keyboard: 1/2/3 pick an option; Enter means Next once answered.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (!answered && x.options.length && /^[1-4]$/.test(e.key)) {
        const o = x.options[Number(e.key) - 1];
        if (o) choose(o);
      } else if (answered && e.key === 'Enter') p.onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const optionClass = (o: string) => {
    if (!answered) return 'opt';
    if (o === x.answer) return 'opt is-right';
    if (o === picked) return 'opt is-chosen';
    return 'opt is-out';
  };
  const options = (chips: boolean) => (
    <div class={chips ? 'options is-chips' : 'options'} role="group">
      {x.options.map((o) => (
        <button type="button" key={o} class={optionClass(o)} disabled={answered} onClick={() => choose(o)} lang={x.type === 'bedeutung' || x.type === 'hoeren' ? 'en' : 'de'}>
          <span>{o}</span>
          {answered && o === x.answer && <CheckIcon />}
          {answered && o === picked && o !== x.answer && <span class="tag">{t('practice.chosen')}</span>}
        </button>
      ))}
    </div>
  );

  let body: preact.JSX.Element;
  switch (x.type) {
    case 'karte': {
      const ex = word.examples[0];
      body = (
        <>
          <Headword word={word} />
          {ex ? (
            <div class="board">
              <Marked text={ex.de} target={ex.form} />
              {lifted && ex.en && <p class="board-sub fade-in" lang="en">{ex.en}</p>}
            </div>
          ) : (
            word.collocation && <p class="collocation" lang="de">{word.collocation}</p>
          )}
          <div class="cover-slot">
            <p class="meaning" lang="en">{word.en}</p>
            <button
              type="button"
              class={lifted ? 'cover is-lifted' : 'cover'}
              aria-label={t('a11y.showMeaning')}
              aria-hidden={lifted || undefined}
              tabIndex={lifted ? -1 : 0}
              onClick={() => {
                setLifted(true);
                buzz(p.haptics, 8);
              }}
            />
          </div>
          {lifted && (
            <div class="fade-in">
              {ex && word.collocation && <p class="collocation" lang="de">{word.collocation}</p>}
              {word.note && <p class="note">{word.note}</p>}
              {p.inviteAloud && <p class="invite">{t('practice.inviteAloud')}</p>}
            </div>
          )}
        </>
      );
      break;
    }
    case 'artikel':
      body = (
        <>
          <Headword word={word} hideArticle filledArticle={answered ? x.answer : ''} />
          {x.sentence && <div class="board"><Marked text={x.sentence} target={x.target} /></div>}
          {options(true)}
          {answered && <p class="meaning-after" lang="en">{word.en}</p>}
        </>
      );
      break;
    case 'bedeutung':
      body = (
        <>
          <Headword word={word} />
          {x.sentence && <div class="board"><Marked text={x.sentence} target={x.target} /></div>}
          <p class="meaning-gap"><span class={answered ? 'gap is-filled' : 'gap'} lang="en">{answered ? x.answer : ' '.repeat(10)}</span></p>
          {options(false)}
        </>
      );
      break;
    case 'hoeren': {
      const words = x.sentence.split(/\s+/).filter(Boolean);
      body = (
        <>
          <div class="board listen">
            {p.canListen && (
              <button type="button" class={speaking ? 'play is-speaking' : 'play'} aria-label={t('a11y.play')} onClick={play}>
                <PlayIcon />
              </button>
            )}
            {answered || textShown ? (
              <Marked text={x.sentence} target={x.target} />
            ) : (
              <p class="bars" aria-label={t('a11y.hiddenSentence', { n: words.length })}>
                {words.map((w, i) => <span key={i} class={x.target && w.includes(x.target) ? 'bar is-target' : 'bar'} style={{ width: `${Math.min(8, Math.max(1.5, w.length * 0.55))}ch` }} />)}
              </p>
            )}
          </div>
          {options(false)}
          {!answered && !textShown && (
            <button type="button" class="quiet" onClick={() => setTextShown(true)}>{t('practice.noSound')}</button>
          )}
          {answered && x.sentenceEn && <p class="translation" lang="en">{x.sentenceEn}</p>}
        </>
      );
      break;
    }
    case 'tippen':
      body = (
        <>
          <div class="board">
            <Gapped text={x.gapped} fill={x.answer} filled={answered && verdict !== 'wrong'}>
              {!answered ? (
                <input
                  ref={inputRef}
                  class="gap-input"
                  lang="de"
                  value={typed}
                  aria-label={t('a11y.yourAnswer')}
                  autocomplete="off"
                  autocapitalize="off"
                  spellcheck={false}
                  enterkeyhint="done"
                  onInput={(e) => setTyped((e.target as HTMLInputElement).value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), check())}
                  size={Math.max(4, x.answer.length)}
                />
              ) : undefined}
            </Gapped>
            {(answered || p.stage <= 2) && x.sentenceEn && <p class="board-sub" lang="en">{x.sentenceEn}</p>}
          </div>
          {verdict === 'near' && <p class="almost" lang="de">{t('practice.almost', { answer: x.answer })}</p>}
          {verdict === 'loose' && <p class="almost" lang="de">{x.answer}</p>}
          {verdict === 'wrong' && <p class="almost" lang="de"><span class="tag">{t('practice.chosen')}</span> {typed} → <strong>{x.answer}</strong></p>}
          {!answered && <button type="button" class="primary" disabled={!typed.trim()} onClick={check}>{t('practice.check')}</button>}
        </>
      );
      break;
    default: {
      // luecke, kontext2, praeposition: a sentence with a blank and options for it.
      const showTranslation = x.type === 'luecke' && p.stage <= 2;
      body = (
        <>
          <div class="board">
            <Gapped text={x.gapped} fill={x.answer} filled={answered} />
            {(showTranslation || answered) && x.sentenceEn && <p class="board-sub" lang="en">{x.sentenceEn}</p>}
          </div>
          {options(x.type === 'praeposition')}
          {answered && x.type !== 'praeposition' && <p class="meaning-after"><span lang="de">{word.article ? `${word.article} ${word.de}` : word.de}</span>{'  ·  '}<span lang="en">{word.en}</span></p>}
        </>
      );
    }
  }

  const graded = x.type !== 'karte';
  return (
    <article class={`card card-${x.type}`} aria-live="off">
      <header class="strip">
        <span class="label">{word.domain ? t(DOMAIN_KEY[word.domain]!) : t('label.word')}</span>
        {p.tags.map((tag) => <span class="label is-tag" key={tag}>{tag}</span>)}
        {(x.type === 'karte' || answered) && <Speak text={word.article ? `${word.article} ${word.de}` : word.de} enabled={p.canListen} />}
      </header>
      {p.sourceLine && <div class="source-line">{p.sourceLine}</div>}
      <div class="card-body">{body}</div>
      <p class="sr-only" role="status">
        {answered ? (right ? t('a11y.right', { answer: x.answer }) : t('a11y.answerIs', { answer: x.answer })) : ''}
      </p>
      <footer class="actions">
        {graded && !answered && <button type="button" class="quiet" onClick={giveUp}>{t('practice.dontKnow')}</button>}
        {graded && answered && !right && <p class="calm">{t('practice.seeAgain')}</p>}
        {graded && answered && (
          <div class="row">
            <button type="button" class="secondary" onClick={p.onDone}>{t('practice.done')}</button>
            <button type="button" class="primary" ref={nextRef} onClick={p.onNext}>{t('practice.next')}</button>
          </div>
        )}
        {x.type === 'karte' && lifted && (
          <div class="rating" role="group" aria-label={t('rate.group')}>
            {([1, 2, 3, 4] as const).map((r) => (
              <button type="button" key={r} class="rate" onClick={() => rate(r)}>
                <BarsIcon level={r} />
                <span>{t(`rate.${r}` as StringKey)}</span>
              </button>
            ))}
          </div>
        )}
        {p.onSkipWord && !skipped && (
          <button type="button" class="quiet small" onClick={() => { setSkipped(true); p.onSkipWord!(); }}>{t('practice.skipWord')}</button>
        )}
        {skipped && <p class="calm small">{t('practice.skipped')}</p>}
      </footer>
    </article>
  );
}
