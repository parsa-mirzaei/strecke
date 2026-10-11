import { useEffect, useRef, useState } from 'preact/hooks';
import { ratingFor, type LearnEvent } from '@core/scheduler.ts';
import { mintId } from '@core/ids.ts';
import { gapExceeded } from '@core/engine/runs.ts';
import type { RunCard } from '@core/engine/run.ts';
import type { Ctx } from '../appctx';
import { randomBytes } from '../data/source';
import { haptic, reducedMotion } from '../lib/haptics';
import { Karte } from './Karte';
import { Choice } from './Choice';
import { Typed } from './Typed';
import { Reorder } from './Reorder';
import type { Answer, ExerciseProps } from './parts';
import { t } from '../i18n';

export type Grade = 0 | 1 | 2 | 3;
export interface RunState { id: string; no: number; cards: RunCard[] }

/** Route stop colour from the rating the engine derived: Again, Hard, Good, Easy. */
export const gradeOf = (e: LearnEvent): Grade => (ratingFor(e) - 1) as Grade;

/** The route on top: one stop per card, coloured by how it went. */
export function Route({ n, cur, results }: { n: number; cur: number; results: Grade[] }) {
  return (
    <ol class="route" aria-label={t('run.route', { i: Math.min(cur + 1, n), n })}>
      {Array.from({ length: n }, (_, k) => {
        const cls = k < results.length ? `done g${results[k]}` : k === cur ? 'cur' : '';
        return <li key={k} class={`stop ${cls}`}><i /></li>;
      })}
    </ol>
  );
}

export function Run({ ctx, run, onFinish, onLeave, onExpire }: {
  ctx: Ctx; run: RunState; onFinish: (results: Grade[]) => void; onLeave: (results: Grade[]) => void; onExpire: () => void;
}) {
  const n = run.cards.length;
  const [i, setI] = useState(0);
  const [results, setResults] = useState<Grade[]>([]);
  const shownAt = useRef(Date.now());
  const lastAct = useRef(Date.now());
  const answered = useRef(false);
  const leaving = useRef(false);
  const results$ = useRef<Grade[]>([]);
  const card = run.cards[i]!;
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__card = card; // design-review tooling only

  // After a long pause the unfinished run is left behind and a new one starts (the gap rule).
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && gapExceeded(lastAct.current, Date.now(), ctx.settings.runGapMin)) onExpire();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [ctx.settings.runGapMin]);

  // Opt-in: generate the cloud voice for this run's spoken texts while online, within the daily cap.
  useEffect(() => {
    if (!ctx.settings.audio.prefetch) return;
    const texts = run.cards.flatMap((c) => (c.exercise.type === 'hoeren' ? [c.exercise.sentence] : c.exercise.type === 'karte' ? [c.exercise.sentence || c.word.de] : []));
    void ctx.audio.prefetch(texts);
  }, [run.id]);

  useEffect(() => { shownAt.current = Date.now(); answered.current = false; leaving.current = false; }, [i]);

  const speak = (text: string, key: string) => { void ctx.audio.speak(text, key); };

  function onAnswer(a: Answer) {
    if (answered.current) return;
    answered.current = true;
    const now = Date.now();
    lastAct.current = now;
    const e: LearnEvent = {
      id: mintId('e', ctx.eventIds, randomBytes), ts: now, wordId: card.word.id,
      kind: 'review', exercise: card.exercise.type, correct: a.correct, ms: now - shownAt.current,
      help: a.help, dontKnow: a.dontKnow, run: run.id,
      ...(a.chosen !== undefined ? { chosen: a.chosen } : {}),
      ...(a.rating ? { rating: a.rating } : {}),
    };
    ctx.eventIds.add(e.id);
    ctx.record(e);
    const g = gradeOf(e);
    results$.current = [...results$.current, g];
    setResults(results$.current);
  }

  function onNext() {
    if (!answered.current || leaving.current) return;
    leaving.current = true;
    ctx.audio.stop();
    const last = i + 1 >= n;
    const root = document.getElementById('app')!;
    const parts = [root.querySelector('.card'), root.querySelector('.act')].filter(Boolean) as HTMLElement[];
    const d = reducedMotion() ? 160 : 300;
    parts.forEach((p) => p.animate(reducedMotion() ? [{ opacity: 1 }, { opacity: 0 }] : [{ transform: 'none', opacity: 1 }, { transform: 'translateX(-30px)', opacity: 0 }], { duration: d, easing: 'ease-in', fill: 'forwards' }));
    setTimeout(() => { if (last) onFinish(results$.current); else setI(i + 1); }, d + 20);
  }

  const props: ExerciseProps = { card, speak, canSpeak: ctx.audio.canListen(), onAnswer, onNext, haptic };
  const type = card.exercise.type;
  const body = type === 'karte' ? <Karte key={i} {...props} />
    : type === 'tippen' ? <Typed key={i} {...props} />
    : type === 'reihenfolge' ? <Reorder key={i} {...props} />
    : <Choice key={i} {...props} />;

  return (
    <>
      <header class="top">
        <div class="row">
          <span class="run">{t('run.label', { no: run.no, i: Math.min(i + 1, n), n })}</span>
          <button class="quiet" type="button" onClick={() => onLeave(results$.current)}>{t('common.done')}</button>
        </div>
        <Route n={n} cur={i} results={results} />
      </header>
      {body}
    </>
  );
}
