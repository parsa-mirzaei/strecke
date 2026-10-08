import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { DataAdapter, Snapshot } from '@core/data/adapter.ts';
import { exercisesFor, type Exercise } from '@core/exercises.ts';
import { mintId } from '@core/ids.ts';
import type { WordRecord } from '@core/record.ts';
import { afterCard, newSession, pickNext, replay, type LearnEvent } from '@core/scheduler.ts';
import { speech, type VoiceStatus } from '../audio/tts';
import { randomBytes } from '../data/source';
import { STYLES, applyStyle, dev, freezeAnimations, review, settleAnimations, type StyleId } from '../dev';
import { Icon } from '../ui/Icon';
import { Karte } from './Karte';
import { DOMAIN_LABEL } from './text';

interface Card {
  key: number;
  word: WordRecord;
  exercise: Exercise;
  shownAt: number;
  invite: boolean;
  leaving: { velocity: number } | null;
}

/** The speaking invitation appears once per visit, on this card (never the first). */
const INVITE_AT = 3;

/**
 * Üben: one card at a time, chosen by the scheduler. Vertical slice of Phase C: only the Karte exists
 * yet, so the picker sees only Karte exercises (DECISIONS D49); the other seven follow after the
 * phone test.
 */
export function Practice({ adapter, snapshot }: { adapter: DataAdapter; snapshot: Snapshot }) {
  const { words, config } = snapshot;
  const exercises = useMemo(
    () => new Map(words.map((w) => [w.id, exercisesFor(w, words).filter((x) => x.type === 'karte')])),
    [words],
  );
  const events = useRef<LearnEvent[]>([...snapshot.events]);
  const session = useRef(newSession());
  const shown = useRef(0);
  const nextKey = useRef(0);
  /** Cards already sent off; guards against a double tap before the next render. */
  const gone = useRef(new Set<number>());

  const pick = (): Card | null => {
    const now = Date.now();
    const p = pickNext({
      now,
      dayStart: new Date(now).setHours(0, 0, 0, 0),
      words,
      states: replay(words, events.current, config.retention),
      exercises,
      session: session.current,
      config,
      canListen: speech.available,
    });
    if (!p) return null;
    const card = { key: nextKey.current++, word: p.word, exercise: p.exercise, shownAt: now, invite: shown.current === INVITE_AT, leaving: null };
    shown.current++;
    return card;
  };

  const first = (): Card | null => {
    // Design review: start on a given word (dev only).
    const w = dev.word ? words.find((x) => x.de === dev.word) : undefined;
    const x = w && exercises.get(w.id)?.[0];
    if (w && x) { shown.current++; return { key: nextKey.current++, word: w, exercise: x, shownAt: Date.now(), invite: false, leaving: null }; }
    return pick();
  };
  const [cards, setCards] = useState<Card[]>(() => { const c = first(); return c ? [c] : []; });

  // Design review: put the first card into a state and hold it still for a screenshot (dev only).
  useEffect(() => {
    if (!dev.state) return;
    const t = setTimeout(() => {
      if (dev.state === 'cover') { settleAnimations(); return; }
      (document.querySelector('.cover') as HTMLButtonElement | null)?.click();
      setTimeout(() => {
        settleAnimations();
        if (dev.state === 'next') {
          (document.querySelector('.btn-primary') as HTMLButtonElement | null)?.click();
          setTimeout(() => freezeAnimations(200), 30);
        }
      }, 900);
    }, 300);
    return () => clearTimeout(t);
  }, []);
  const [resting, setResting] = useState(cards.length === 0);
  const [voice, setVoice] = useState<VoiceStatus>(speech.status);
  const [style, setStyle] = useState(document.documentElement.dataset.style ?? '2');
  const pickStyle = (s: StyleId) => { applyStyle(s); setStyle(s); };
  useEffect(() => speech.subscribe(setVoice), []);

  const current = cards.find((c) => !c.leaving) ?? null;

  function onReveal(card: Card) {
    const now = Date.now();
    const e: LearnEvent = {
      id: mintId('e', new Set(events.current.map((x) => x.id)), randomBytes), ts: now, wordId: card.word.id,
      kind: 'seen', exercise: 'karte', correct: true, ms: now - card.shownAt, help: false, dontKnow: false,
    };
    events.current.push(e);
    session.current = afterCard(session.current, e);
    adapter.appendEvents([e]).catch((err) => console.warn('event not saved', err));
  }

  function onAdvance(card: Card, velocity: number) {
    if (gone.current.has(card.key)) return;
    gone.current.add(card.key);
    speech.stop();
    const next = pick();
    setCards((cs) => [...cs.map((c) => (c.key === card.key ? { ...c, leaving: { velocity } } : c)), ...(next ? [next] : [])]);
    if (!next) setResting(true);
  }

  function onExited(card: Card) {
    setCards((cs) => cs.filter((c) => c.key !== card.key));
  }

  function finish() {
    speech.stop();
    setCards((cs) => cs.map((c) => (c.leaving ? c : (gone.current.add(c.key), { ...c, leaving: { velocity: 0 } }))));
    setResting(true);
  }

  function resume() {
    const next = pick();
    setResting(false);
    if (next) setCards((cs) => [...cs, next]);
    else setResting(true);
  }

  function speak() {
    if (!current) return;
    speech.speak(current.exercise.sentence || current.word.de, { rate: 0.95 });
  }

  const domain = current && !resting ? DOMAIN_LABEL[current.word.domain] ?? '' : '';

  return (
    <main class="app">
      <div class="strip">
        <div class="label">
          {domain ? <span>{domain}</span> : null}
          {adapter.kind === 'demo' ? <span>Demo</span> : null}
        </div>
        {(dev.enabled || review) && !dev.state ? (
          <div class="style-switch" role="group" aria-label="Stil (nur Entwicklung)">
            {STYLES.map((s) => (
              <button type="button" key={s} aria-pressed={style === s} onClick={() => pickStyle(s)}>{s}</button>
            ))}
          </div>
        ) : null}
        {voice === 'ready' && current && !resting ? (
          <button class="icon-button" type="button" onClick={speak} aria-label="Vorlesen">
            <Icon name="volume-2" />
          </button>
        ) : <span style={{ height: '44px' }} />}
      </div>
      <div class="stage">
        {cards.map((c) => (
          <Karte
            key={c.key}
            word={c.word}
            exercise={c.exercise}
            invite={c.invite}
            leaving={c.leaving}
            onReveal={() => onReveal(c)}
            onAdvance={(v) => onAdvance(c, v)}
            onFinish={finish}
            onExited={() => onExited(c)}
          />
        ))}
        {resting && cards.every((c) => c.leaving) ? (
          <section class="rest" aria-live="polite">
            <h1>Bis gleich.</h1>
            {words.length ? <button class="btn btn-outline" type="button" onClick={resume}>Weiter</button> : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
